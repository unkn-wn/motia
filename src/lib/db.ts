import { firestore } from '@/lib/firebase';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  Timestamp,
} from 'firebase/firestore';
import type { Note } from '@types';
import type { Preferences, KeyboardShortcut } from '@utils/shortcutsUtils';
import type {
  UserProfileDoc,
  UserSettingsDoc,
  ProjectMetaDoc,
  ProjectNotesDoc,
} from '@types';

// --- Sanitization helpers ---
// Firestore does not support arrays-of-arrays and disallows undefined values.
// We sanitize payloads by: (1) removing undefined fields, (2) wrapping any array element
// that is itself an array into an object { __array: [...] }, recursively.
function sanitizeForFirestore(value: unknown): unknown {
  if (value === undefined) return null; // avoid undefined
  if (value === null) return null;
  if (Array.isArray(value)) {
    return value.map((el) => {
      if (Array.isArray(el)) {
        return { __array: sanitizeForFirestore(el) };
      }
      return sanitizeForFirestore(el);
    });
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (v === undefined) continue; // drop undefined keys
      out[k] = sanitizeForFirestore(v);
    }
    return out;
  }
  return value;
}

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
export async function markUserUpgraded(
  uid: string,
  data: { email: string; displayName?: string | null }
): Promise<void> {
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
  await setDoc(
    userSettingsDoc(uid),
    { ...settings, updatedAt: serverTimestamp() as Timestamp },
    { merge: true }
  );
}

export function shortcutsArrayToMap(shortcuts: KeyboardShortcut[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const s of shortcuts) map[s.id] = s.currentKey;
  return map;
}

// --- Projects ---
export async function createProject(uid: string, opts: {
  title?: string;
  audio: { name: string; size: number; type: string; durationSec?: number };
}): Promise<string> {
  const meta: Omit<ProjectMetaDoc, 'createdAt' | 'updatedAt'> = {
    title: opts.title ?? opts.audio.name,
    audio: opts.audio,
  };
  const ref = await addDoc(userProjectsCol(uid), {
    ...meta,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  } as ProjectMetaDoc);
  return ref.id;
}

export async function updateProjectMeta(
  uid: string,
  projectId: string,
  patch: Partial<ProjectMetaDoc>
): Promise<void> {
  await setDoc(userProjectDoc(uid, projectId), { ...patch, updatedAt: serverTimestamp() }, { merge: true });
}

export async function updateProjectAudioDuration(
  uid: string,
  projectId: string,
  durationSec: number
): Promise<void> {
  // Use field path merge to avoid overwriting other audio fields
  await setDoc(
    userProjectDoc(uid, projectId),
    { 'audio.durationSec': durationSec, updatedAt: serverTimestamp() } as unknown as ProjectMetaDoc,
    { merge: true }
  );
}

// --- Notes ---
export async function saveProjectNotes(
  uid: string,
  projectId: string,
  notes: Note[]
): Promise<void> {
  // Normalize any drawing.compressed arrays to JSON strings to avoid arrays-of-arrays in Firestore
  const normalizedNotes = notes.map((n) => {
    if (n.drawing && Array.isArray(n.drawing.compressed)) {
      try {
        n = {
          ...n,
          drawing: {
            ...n.drawing,
            compressed: JSON.stringify(n.drawing.compressed),
          },
        };
      } catch {/* ignore stringify errors */ }
    }
    return n;
  });
  const safeNotes = sanitizeForFirestore(normalizedNotes) as Note[] | unknown;
  await setDoc(
    userProjectNotesDoc(uid, projectId),
    { notes: safeNotes, updatedAt: serverTimestamp() as Timestamp } as unknown as ProjectNotesDoc,
    { merge: true }
  );
}