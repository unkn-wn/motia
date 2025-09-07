// Lightweight IndexedDB helpers to store/retrieve audio per project locally.

type StoredAudio = {
  projectId: string;
  name: string;
  type: string;
  lastModified: number;
  blob: Blob;
};

const DB_NAME = 'motia-audio';
const DB_VERSION = 1;
const STORE = 'files';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'projectId' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveLocalAudio(projectId: string, file: File): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const data: StoredAudio = {
      projectId,
      name: file.name,
      type: file.type,
      lastModified: file.lastModified,
      blob: file,
    };
    store.put(data);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function getLocalAudio(projectId: string): Promise<File | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const store = tx.objectStore(STORE);
    const req = store.get(projectId);
    req.onsuccess = () => {
      const data = req.result as StoredAudio | undefined;
      if (!data) return resolve(null);
      const f = new File([data.blob], data.name, { type: data.type, lastModified: data.lastModified });
      resolve(f);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function deleteLocalAudio(projectId: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    store.delete(projectId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
