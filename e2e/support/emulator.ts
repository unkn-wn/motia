// Local Firebase emulator access for tests. Everything here targets 127.0.0.1 and the `demo-motia` project.
const PROJECT_ID = 'demo-motia';
const AUTH_ORIGIN = 'http://127.0.0.1:9099';
const FIRESTORE_ORIGIN = 'http://127.0.0.1:8080';
export const TEST_EMAIL = 'newuser@test.com';
export const TEST_PASSWORD = 'passwordpassword';

const DOCS = `${FIRESTORE_ORIGIN}/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
// The emulator treats this bearer token as an admin and skips security rules.
const ADMIN = { Authorization: 'Bearer owner' };

/** True only when the Firebase emulators (not some other local service) answer on their ports. */
export async function emulatorsUp(): Promise<boolean> {
	try {
		const [a, f] = await Promise.all([fetch(`${AUTH_ORIGIN}/`), fetch(`${FIRESTORE_ORIGIN}/`)]);
		return a.ok && f.ok && (await a.text()).includes('authEmulator') && (await f.text()).trim() === 'Ok';
	} catch {
		return false;
	}
}

export async function clearEmulators(): Promise<void> {
	const urls = [
		`${FIRESTORE_ORIGIN}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`,
		`${AUTH_ORIGIN}/emulator/v1/projects/${PROJECT_ID}/accounts`,
	];
	for (const url of urls) {
		const res = await fetch(url, { method: 'DELETE' });
		if (!res.ok) throw new Error(`Clearing ${url} failed: ${res.status}`);
	}
}

async function identityToolkit(method: string, email: string, password: string) {
	const res = await fetch(`${AUTH_ORIGIN}/identitytoolkit.googleapis.com/v1/accounts:${method}?key=demo-key`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ email, password, returnSecureToken: true }),
	});
	if (!res.ok) throw new Error(`${method} failed: ${res.status} ${await res.text()}`);
	return (await res.json()) as { localId: string; idToken: string };
}

export const signUpUser = (email: string, password: string) => identityToolkit('signUp', email, password);
export const signInUser = (email: string, password: string) => identityToolkit('signInWithPassword', email, password);

// --- Firestore REST value decoding / encoding ---
type FsValue = Record<string, unknown>;

function fromFs(v: FsValue): unknown {
	if ('nullValue' in v) return null;
	if ('booleanValue' in v) return v.booleanValue;
	if ('integerValue' in v) return Number(v.integerValue);
	if ('doubleValue' in v) return Number(v.doubleValue);
	if ('stringValue' in v) return v.stringValue;
	if ('timestampValue' in v) return v.timestampValue;
	if ('arrayValue' in v) return ((v.arrayValue as { values?: FsValue[] }).values ?? []).map(fromFs);
	if ('mapValue' in v) return fromFsFields((v.mapValue as { fields?: Record<string, FsValue> }).fields ?? {});
	throw new Error(`Unsupported Firestore value: ${JSON.stringify(v)}`);
}

function fromFsFields(fields: Record<string, FsValue>): Record<string, unknown> {
	return Object.fromEntries(Object.entries(fields).map(([k, val]) => [k, fromFs(val)]));
}

function toFs(v: unknown): FsValue {
	if (v === null || v === undefined) return { nullValue: null };
	if (typeof v === 'boolean') return { booleanValue: v };
	if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
	if (typeof v === 'string') return { stringValue: v };
	if (Array.isArray(v)) return { arrayValue: { values: v.map(toFs) } };
	if (typeof v === 'object') {
		const fields = Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, toFs(x)]));
		return { mapValue: { fields } };
	}
	throw new Error(`Unsupported value: ${String(v)}`);
}

/** Reads a document as plain JSON (admin access), or null when it doesn't exist. */
export async function readDoc(path: string): Promise<Record<string, unknown> | null> {
	const res = await fetch(`${DOCS}/${path}`, { headers: ADMIN });
	if (res.status === 404) return null;
	if (!res.ok) throw new Error(`readDoc ${path}: ${res.status} ${await res.text()}`);
	const body = (await res.json()) as { fields?: Record<string, FsValue> };
	return fromFsFields(body.fields ?? {});
}

/** Overwrites a document (admin access). */
export async function writeDoc(path: string, data: Record<string, unknown>): Promise<void> {
	const fields = (toFs(data).mapValue as { fields: Record<string, FsValue> }).fields;
	const res = await fetch(`${DOCS}/${path}`, {
		method: 'PATCH',
		headers: { ...ADMIN, 'Content-Type': 'application/json' },
		body: JSON.stringify({ fields }),
	});
	if (!res.ok) throw new Error(`writeDoc ${path}: ${res.status} ${await res.text()}`);
}

/** Writes only the given fields and keeps the rest of the document, like the client's `set(..., { merge: true })`. */
export async function mergeDoc(path: string, data: Record<string, unknown>): Promise<void> {
	const fields = (toFs(data).mapValue as { fields: Record<string, FsValue> }).fields;
	const mask = Object.keys(data)
		.map((k) => `updateMask.fieldPaths=${encodeURIComponent(k)}`)
		.join('&');
	const res = await fetch(`${DOCS}/${path}?${mask}`, {
		method: 'PATCH',
		headers: { ...ADMIN, 'Content-Type': 'application/json' },
		body: JSON.stringify({ fields }),
	});
	if (!res.ok) throw new Error(`mergeDoc ${path}: ${res.status} ${await res.text()}`);
}

/** Frames of a stored storyboard; none for one that can't be read (some tests store such boards on purpose). */
function parseFrames(raw: string): Array<{ id: string }> {
	try {
		return (JSON.parse(raw) as { frames?: Array<{ id: string }> }).frames ?? [];
	} catch {
		return [];
	}
}

/**
 * Finds the user and project whose stored storyboard contains a frame id: one collection-group query over every
 * project's notes doc (a per-user scan is slow, and listing pages stop at 300 docs once the shared account fills up).
 */
export async function findProjectWithFrame(frameId: string): Promise<{ uid: string; pid: string } | null> {
	const res = await fetch(`${DOCS}:runQuery`, {
		method: 'POST',
		headers: { ...ADMIN, 'Content-Type': 'application/json' },
		body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'notes', allDescendants: true }] } }),
	});
	if (!res.ok) throw new Error(`findProjectWithFrame: ${res.status} ${await res.text()}`);
	const rows = (await res.json()) as Array<{ document?: { name: string; fields?: Record<string, FsValue> } }>;
	for (const { document } of rows) {
		if (!document) continue;
		const raw = document.fields ? fromFsFields(document.fields).storyboard : undefined;
		if (typeof raw === 'string' && parseFrames(raw).some((f) => f.id === frameId)) {
			const m = /\/users\/([^/]+)\/projects\/([^/]+)\/notes\//.exec(document.name);
			if (m) return { uid: m[1], pid: m[2] };
		}
	}
	return null;
}

export const projectMetaPath = (uid: string, pid: string) => `users/${uid}/projects/${pid}`;
export const projectNotesPath = (uid: string, pid: string) => `users/${uid}/projects/${pid}/notes/all`;

/** Every user's project notes docs whose stored content mentions `text` (admin; one collection-group query). */
export async function notesDocsMentioning(text: string): Promise<string[]> {
	const res = await fetch(`${DOCS}:runQuery`, {
		method: 'POST',
		headers: { ...ADMIN, 'Content-Type': 'application/json' },
		body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'notes', allDescendants: true }] } }),
	});
	if (!res.ok) throw new Error(`notesDocsMentioning: ${res.status} ${await res.text()}`);
	const rows = (await res.json()) as Array<{ document?: { name: string; fields?: Record<string, FsValue> } }>;
	return rows.filter((r) => r.document && JSON.stringify(r.document.fields ?? {}).includes(text)).map((r) => r.document!.name);
}

/** The ids of a user's projects (admin access). */
export async function projectIds(uid: string): Promise<string[]> {
	const ids: string[] = [];
	let pageToken = '';
	do {
		const res = await fetch(`${DOCS}/users/${uid}/projects?pageSize=300${pageToken ? `&pageToken=${pageToken}` : ''}`, { headers: ADMIN });
		if (!res.ok) throw new Error(`projectIds ${uid}: ${res.status} ${await res.text()}`);
		const body = (await res.json()) as { documents?: Array<{ name: string }>; nextPageToken?: string };
		for (const d of body.documents ?? []) ids.push(d.name.split('/').pop()!);
		pageToken = body.nextPageToken ?? '';
	} while (pageToken);
	return ids;
}
