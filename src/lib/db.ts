import { firestore } from '@/lib/firebase';
import {
	addDoc,
	collection,
	deleteDoc,
	doc,
	getDoc,
	getDocs,
	serverTimestamp,
	setDoc,
	updateDoc,
	Timestamp,
	writeBatch,
	query,
	runTransaction,
} from 'firebase/firestore';
// No Firebase Storage usage in free-plan setup
import type { Note } from '@types';
import { auth } from './firebase';
import type { Preferences, KeyboardShortcut } from '@utils/shortcutsUtils';
import type { UserProfileDoc, UserSettingsDoc, ProjectMetaDoc, ProjectNotesDoc } from '@types';
import { decompressSession } from '@utils/advancedCompression';
import { buildNotesPayload, DOC_LIMIT_BYTES, planStoryboardWrite, PROJECT_TOO_BIG_ERROR, SKETCH_NOTE_ID, stringBytes } from './notesPayload';

// --- Paths helpers ---
const userDoc = (uid: string) => doc(firestore, 'users', uid);
const userSettingsDoc = (uid: string) => doc(firestore, 'users', uid, 'settings', 'app');
const userProjectsCol = (uid: string) => collection(firestore, 'users', uid, 'projects');
const userProjectDoc = (uid: string, projectId: string) => doc(firestore, 'users', uid, 'projects', projectId);
const userProjectNotesDoc = (uid: string, projectId: string) => doc(firestore, 'users', uid, 'projects', projectId, 'notes', 'all');

// --- Users ---
export async function ensureUser(uid: string, profile?: Partial<UserProfileDoc>): Promise<void> {
	const ref = userDoc(uid);
	const snap = await getDoc(ref);
	const base: Partial<UserProfileDoc> = {
		createdAt: Timestamp.now(),
		updatedAt: Timestamp.now(),
	};
	if (!snap.exists()) {
		await setDoc(ref, { ...base, ...profile });
	} else if (profile) {
		await setDoc(ref, { ...profile, updatedAt: serverTimestamp() as Timestamp }, { merge: true });
	}
}

// Mark a previously-anonymous user as upgraded and persist their email/displayName
export async function markUserUpgraded(uid: string, data: { email: string; displayName?: string | null }): Promise<void> {
	const payload: Partial<UserProfileDoc> = {
		email: data.email,
		upgradedFromAnonymous: true,
		updatedAt: serverTimestamp() as Timestamp,
	};
	if (data.displayName) payload.displayName = data.displayName;
	await setDoc(userDoc(uid), payload as UserProfileDoc, { merge: true });
}

// --- Settings ---
export async function fetchUserSettings(uid: string): Promise<UserSettingsDoc | null> {
	const snap = await getDoc(userSettingsDoc(uid));
	return snap.exists() ? (snap.data() as UserSettingsDoc) : null;
}

export async function saveUserSettings(
	uid: string,
	settings: { preferences?: Partial<Preferences>; shortcuts?: Record<string, string> }
): Promise<void> {
	await setDoc(userSettingsDoc(uid), { ...settings, updatedAt: serverTimestamp() as Timestamp }, { merge: true });
}

export function shortcutsArrayToMap(shortcuts: KeyboardShortcut[]): Record<string, string> {
	const map: Record<string, string> = {};
	for (const s of shortcuts) map[s.id] = s.currentKey;
	return map;
}

// --- Projects ---
/** An id for a project whose other data is written before its meta doc (import). */
export const newProjectId = (uid: string): string => doc(userProjectsCol(uid)).id;

export async function createProject(
	uid: string,
	opts: {
		/** Use this id (from `newProjectId`) instead of a new one */
		id?: string;
		title?: string;
		audio: NonNullable<ProjectMetaDoc['audio']> & { name: string };
		orientation?: ProjectMetaDoc['orientation'];
	}
): Promise<string> {
	const meta: Omit<ProjectMetaDoc, 'createdAt' | 'updatedAt'> = {
		title: opts.title ?? opts.audio.name,
		audio: opts.audio,
		...(opts.orientation ? { orientation: opts.orientation } : {}),
	};
	const data = { ...meta, createdAt: serverTimestamp(), updatedAt: serverTimestamp() } as ProjectMetaDoc;
	if (opts.id) {
		await setDoc(userProjectDoc(uid, opts.id), data);
		return opts.id;
	}
	const ref = await addDoc(userProjectsCol(uid), data);
	return ref.id;
}

export async function updateProjectMeta(uid: string, projectId: string, patch: Partial<ProjectMetaDoc>): Promise<void> {
	await setDoc(userProjectDoc(uid, projectId), { ...patch, updatedAt: serverTimestamp() }, { merge: true });
}

// Convenience: rename a project (updates title and updatedAt only)
export async function renameProject(uid: string, projectId: string, title: string): Promise<void> {
	await setDoc(userProjectDoc(uid, projectId), { title, updatedAt: serverTimestamp() }, { merge: true });
}

// Bump only the project's updatedAt timestamp (no other fields changed)
export async function touchProjectUpdatedAt(uid: string, projectId: string): Promise<void> {
	await setDoc(userProjectDoc(uid, projectId), { updatedAt: serverTimestamp() } as unknown as ProjectMetaDoc, { merge: true });
}

// Set or replace the project's thumbnail data URL without updating updatedAt
export async function updateProjectThumbnail(uid: string, projectId: string, dataUrl: string): Promise<void> {
	await setDoc(userProjectDoc(uid, projectId), { thumbnail: dataUrl } as unknown as ProjectMetaDoc, { merge: true });
}

// Update audio trim points (in and out times in seconds)
export async function updateAudioTrim(uid: string, projectId: string, trimStart: number, trimEnd: number): Promise<void> {
	await updateDoc(userProjectDoc(uid, projectId), {
		'audio.trimStart': trimStart,
		'audio.trimEnd': trimEnd,
		updatedAt: serverTimestamp(),
	});
}

// Update project canvas orientation ('vertical' or 'horizontal')
export async function updateProjectOrientation(uid: string, projectId: string, orientation: 'vertical' | 'horizontal'): Promise<void> {
	await setDoc(
		userProjectDoc(uid, projectId),
		{ orientation, updatedAt: serverTimestamp() } as unknown as ProjectMetaDoc,
		{ merge: true }
	);
}

// --- Storage ---
// Removed: uploadProjectAudio (Firebase Storage)

// --- Notes ---
/**
 * Saves notes, the canvas sketch and, when given, the storyboard string. With `storyboard` undefined, or above the
 * size budget (`storyboardHeld`), the stored storyboard field is left as it is (merge write). `holdOversized: false`
 * always writes the storyboard (used by migration, which must not drop it).
 */
export async function saveProjectNotes(
	uid: string,
	projectId: string,
	notes: Note[],
	expectedVersion?: number,
	storyboard?: string,
	opts: { holdOversized?: boolean } = {}
): Promise<{ version: number; bytes: number; storyboardHeld: boolean }> {
	const base = buildNotesPayload(notes);
	const plan = planStoryboardWrite(base, storyboard);
	const { bytes, baseBytes } = plan;
	const storyboardHeld = plan.storyboardHeld && opts.holdOversized !== false;
	const payload: ProjectNotesDoc = {
		...base,
		...(storyboard !== undefined && !storyboardHeld ? { storyboard } : {}),
		updatedAt: serverTimestamp() as Timestamp,
	};

	const ref = userProjectNotesDoc(uid, projectId);

	const version = await runTransaction(firestore, async (transaction) => {
		const sfDoc = await transaction.get(ref);
		let currentVersion = 0;
		if (sfDoc.exists()) {
			const data = sfDoc.data() as ProjectNotesDoc;
			currentVersion = data.version || 0;
			// A held storyboard stays as stored; refuse a write that would push the whole doc over the limit
			const kept = storyboardHeld && typeof data.storyboard === 'string' ? stringBytes(data.storyboard) : 0;
			if (kept && baseBytes + kept > DOC_LIMIT_BYTES) throw new Error(PROJECT_TOO_BIG_ERROR);
		}

		// If we expect a version and the server is ahead, reject
		if (expectedVersion !== undefined && currentVersion > expectedVersion) {
			throw new Error('Conflict: Remote version is newer');
		}

		const newVersion = currentVersion + 1;
		const finalPayload = { ...payload, version: newVersion };

		transaction.set(ref, finalPayload, { merge: true });
		return newVersion;
	});
	return { version, bytes, storyboardHeld };
}

// --- Reads ---
export async function fetchProjectMeta(uid: string, projectId: string): Promise<ProjectMetaDoc | null> {
	const snap = await getDoc(userProjectDoc(uid, projectId));
	return snap.exists() ? (snap.data() as ProjectMetaDoc) : null;
}

function hydrateNotes(raw: unknown): Note[] {
	if (!Array.isArray(raw)) return [];
	return raw.map((n: unknown) => {
		const obj = typeof n === 'object' && n !== null ? (n as Record<string, unknown>) : {};
		const out: Record<string, unknown> = { ...obj };
		// createdAt may be a Firestore Timestamp
		const maybeTs = out.createdAt as unknown;
		if (maybeTs && typeof maybeTs === 'object' && typeof (maybeTs as { toDate?: unknown }).toDate === 'function') {
			out.createdAt = (maybeTs as { toDate: () => Date }).toDate();
		}
		// drawing.compressed may be a JSON string
		const maybeDrawing = out.drawing as unknown;
		if (maybeDrawing && typeof maybeDrawing === 'object' && typeof (maybeDrawing as { compressed?: unknown }).compressed === 'string') {
			try {
				const d = maybeDrawing as { compressed: string } & Record<string, unknown>;
				out.drawing = {
					...d,
					compressed: JSON.parse(d.compressed),
				};
			} catch {
				// leave as-is if parse fails
			}
		}
		return out as unknown as Note;
	});
}

export async function fetchProjectNotes(uid: string, projectId: string): Promise<{ notes: Note[]; version: number; storyboard?: string } | null> {
	const snap = await getDoc(userProjectNotesDoc(uid, projectId));
	if (!snap.exists()) return null;
	const data = snap.data() as ProjectNotesDoc;
	const notes = hydrateNotes(data.notes as unknown);
	const version = data.version || 0;
	const storyboard = typeof data.storyboard === 'string' ? data.storyboard : undefined;

	// If compressed field exists, create a single drawing note for runtime use
	const compressedRaw = (data as unknown as { compressed?: unknown }).compressed;
	if (compressedRaw) {
		let comp: unknown = compressedRaw;
		if (typeof comp === 'string') {
			try {
				comp = JSON.parse(comp);
			} catch {
				comp = [];
			}
		}
		try {
			// Validate it’s parseable by trying to decompress
			decompressSession(comp as unknown as import('@types').CompressedStroke[]);
			// Create a synthetic global drawing note
			const globalDrawing: Note = {
				id: SKETCH_NOTE_ID,
				time: 0,
				canvasX: 0,
				canvasY: 0,
				content: '',
				color: 'gray',
				createdAt: new Date(),
				type: 'drawing',
				drawing: { compressed: comp as unknown as unknown[], bounds: { width: 0, height: 0 } },
			};
			return { notes: [...notes, globalDrawing], version, storyboard };
		} catch {
			return { notes, version, storyboard };
		}
	}
	return { notes, version, storyboard };
}

export async function getProjectNotesVersion(uid: string, projectId: string): Promise<number | null> {
	const snap = await getDoc(userProjectNotesDoc(uid, projectId));
	if (!snap.exists()) return null;
	return (snap.data() as ProjectNotesDoc).version || 0;
}

// --- Migration ---

export async function listUserProjectIds(uid: string): Promise<string[]> {
	const col = userProjectsCol(uid);
	const qs = await getDocs(query(col));
	return qs.docs.map((d) => d.id);
}

export async function listUserProjects(uid: string): Promise<Array<{ id: string; meta: ProjectMetaDoc }>> {
	const col = userProjectsCol(uid);
	const qs = await getDocs(query(col));
	return qs.docs.map((d) => ({ id: d.id, meta: d.data() as ProjectMetaDoc }));
}

// Delete a single project (meta and notes) efficiently via batch
export async function deleteProject(uid: string, projectId: string): Promise<void> {
	const metaRef = userProjectDoc(uid, projectId);
	const notesRef = userProjectNotesDoc(uid, projectId);
	const batch = writeBatch(firestore);
	batch.delete(metaRef);
	batch.delete(notesRef);
	await batch.commit();
}

// --- Cleanup ---
async function deleteUserDoc(uid: string): Promise<void> {
	await deleteDoc(userDoc(uid));
}

/**
 * Note: local images (motia-assets) are deliberately kept; the only caller, account migration, re-keys them to the
 * migrated project. Clear them yourself if you add another caller.
 *
 * Delete all Firestore data for a user: projects (meta + notes) and the user doc.
 * Use with caution. Client must be authenticated as this uid per security rules.
 */
export async function deleteUserData(uid: string): Promise<void> {
	// Delete all projects and their notes
	const ids = await listUserProjectIds(uid);
	for (const projectId of ids) {
		try {
			await deleteDoc(userProjectNotesDoc(uid, projectId));
		} catch {
			/* ignore if missing */
		}
		try {
			await deleteDoc(userProjectDoc(uid, projectId));
		} catch {
			/* ignore if missing */
		}
		try {
			await deleteDoc(userSettingsDoc(uid));
		} catch {
			/* ignore if missing */
		}
	}
	// Finally delete the user profile doc
	try {
		await deleteUserDoc(uid);
		await auth.currentUser?.delete();
	} catch {
		/* ignore if missing */
	}
}
