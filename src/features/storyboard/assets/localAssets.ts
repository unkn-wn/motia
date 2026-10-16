// Pictures used by boxes and symbols live only on this device, in IndexedDB (never in Firestore).
// Keyed by asset id; the projectId index lets a project's images be removed with the project.

type StoredAsset = {
	id: string;
	projectId: string;
	mime: string;
	width: number;
	height: number;
	blob: Blob;
};

const DB_NAME = 'motia-assets';
const DB_VERSION = 1;
const STORE = 'assets';
const BY_PROJECT = 'projectId';

function openDB(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const req = indexedDB.open(DB_NAME, DB_VERSION);
		req.onupgradeneeded = () => {
			const db = req.result;
			if (!db.objectStoreNames.contains(STORE)) {
				db.createObjectStore(STORE, { keyPath: 'id' }).createIndex(BY_PROJECT, 'projectId');
			}
		};
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
}

async function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
	const db = await openDB();
	try {
		return await new Promise<T | undefined>((resolve, reject) => {
			const tx = db.transaction(STORE, mode);
			const req = run(tx.objectStore(STORE));
			tx.oncomplete = () => resolve(req ? req.result : undefined);
			// While a request error bubbles, tx.error is still null; the request carries the reason
			tx.onerror = (e) => reject((e.target as IDBRequest | null)?.error ?? tx.error);
			tx.onabort = () => reject(tx.error);
		});
	} finally {
		db.close();
	}
}

export async function putAsset(asset: StoredAsset): Promise<void> {
	await withStore('readwrite', (store) => store.put(asset));
}

export async function getAsset(id: string): Promise<StoredAsset | null> {
	return ((await withStore<StoredAsset | undefined>('readonly', (store) => store.get(id))) ?? null);
}

/** Visits every asset of a project inside one read-write transaction. */
async function forEachProjectAsset(projectId: string, visit: (cursor: IDBCursorWithValue) => void): Promise<void> {
	await withStore('readwrite', (store) => {
		const req = store.index(BY_PROJECT).openCursor(IDBKeyRange.only(projectId));
		req.onsuccess = () => {
			const cursor = req.result;
			if (!cursor) return;
			visit(cursor);
			cursor.continue();
		};
	});
}

export async function deleteProjectAssets(projectId: string): Promise<void> {
	await forEachProjectAsset(projectId, (cursor) => cursor.delete());
}

/** Moves a project's images to another project id (account migration may give the project a new id). */
export async function reassignProjectAssets(fromProjectId: string, toProjectId: string): Promise<void> {
	if (fromProjectId === toProjectId) return;
	await forEachProjectAsset(fromProjectId, (cursor) => {
		cursor.update({ ...(cursor.value as StoredAsset), projectId: toProjectId });
	});
}
