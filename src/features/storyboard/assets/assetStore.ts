import { getAsset } from './localAssets';

// Image URLs for rendering, loaded from the local `motia-assets` IndexedDB on first use.
// Object URLs serve the live editor; data URLs serve static rendering (thumbnails, export), because an SVG loaded
// as an image can't fetch blob: URLs. A lookup returns undefined while loading and null when the image isn't on
// this device (shown as "Image missing").

type Entry = { status: 'loading' | 'ready' | 'missing'; objectUrl?: string; dataUrl?: string; settled?: Promise<void> };

const entries = new Map<string, Entry>();
const listeners = new Set<() => void>();
let version = 0;
let bumpScheduled = false;

function bump() {
	if (bumpScheduled) return;
	bumpScheduled = true;
	requestAnimationFrame(() => {
		bumpScheduled = false;
		version += 1;
		listeners.forEach((l) => l());
	});
}

export const assetStore = {
	subscribe(listener: () => void) {
		listeners.add(listener);
		return () => {
			listeners.delete(listener);
		};
	},
	getVersion: () => version,
};

const readDataUrl = (blob: Blob) =>
	new Promise<string>((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(reader.result as string);
		reader.onerror = () => reject(reader.error);
		reader.readAsDataURL(blob);
	});

async function fill(id: string, entry: Entry, blob: Blob) {
	const objectUrl = URL.createObjectURL(blob);
	let dataUrl: string;
	try {
		dataUrl = await readDataUrl(blob);
	} catch (err) {
		URL.revokeObjectURL(objectUrl);
		throw err;
	}
	// Dropped by clearAssetCache while loading: nothing holds this URL
	if (entries.get(id) !== entry) {
		URL.revokeObjectURL(objectUrl);
		entry.status = 'missing';
		return;
	}
	entry.objectUrl = objectUrl;
	entry.dataUrl = dataUrl;
	entry.status = 'ready';
}

function entryFor(id: string): Entry {
	let entry = entries.get(id);
	if (entry) return entry;
	const created: Entry = { status: 'loading' };
	entries.set(id, created);
	created.settled = getAsset(id)
		.then(async (asset) => {
			if (asset) await fill(id, created, asset.blob);
			else created.status = 'missing';
		})
		.catch(() => {
			created.status = 'missing';
		})
		.finally(bump);
	entry = created;
	return entry;
}

const lookup = (id: string, key: 'objectUrl' | 'dataUrl') => {
	const entry = entryFor(id);
	return entry.status === 'ready' ? entry[key] : entry.status === 'missing' ? null : undefined;
};

/** For live rendering: an object URL, undefined while loading, null if missing on this device. */
export const assetObjectUrl = (id: string): string | null | undefined => lookup(id, 'objectUrl');
/** For static rendering: a data URL, undefined while loading, null if missing on this device. */
export const assetDataUrl = (id: string): string | null | undefined => lookup(id, 'dataUrl');

/** Makes a just-stored image available at once, without a round trip to IndexedDB. */
export async function primeAsset(id: string, blob: Blob) {
	const entry: Entry = { status: 'loading' };
	entries.set(id, entry);
	entry.settled = fill(id, entry, blob).finally(bump);
	await entry.settled;
}

/**
 * Ready (or missing) for static rendering; resolves once the image's load has settled. Follows the load itself,
 * not the store's animation-frame updates, so it also settles in a background tab (export).
 */
export function whenAssetSettled(id: string): Promise<void> {
	const entry = entryFor(id);
	if (entry.status !== 'loading' || !entry.settled) return Promise.resolve();
	return entry.settled.catch(() => {});
}

/** Drops cached URLs (on project change), so a project only holds its own images. */
export function clearAssetCache() {
	for (const entry of entries.values()) if (entry.objectUrl) URL.revokeObjectURL(entry.objectUrl);
	entries.clear();
	bump();
}
