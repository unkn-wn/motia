import { useEffect, useMemo, useRef, useState } from 'react';
import { saveProjectNotes, updateProjectMeta, touchProjectUpdatedAt, getProjectNotesVersion } from '@/lib/db';
import type { Note } from '@types';
import type { StoryboardDoc } from '@/features/storyboard/types';
import { serializeStoryboard } from '@/features/storyboard/storage';

type Debounced<T extends (...args: unknown[]) => void> = ((...args: Parameters<T>) => void) & { flush: () => void };

function useDebounced<T extends (...args: unknown[]) => void>(fn: T, delay = 800): Debounced<T> {
	const fnRef = useRef(fn);
	const timer = useRef<number | null>(null);
	const lastArgs = useRef<Parameters<T> | null>(null);

	useEffect(() => {
		fnRef.current = fn;
	}, [fn]);

	return useMemo(() => {
		const debounced = ((...args: Parameters<T>) => {
			lastArgs.current = args;
			if (timer.current) window.clearTimeout(timer.current);
			timer.current = window.setTimeout(() => {
				fnRef.current(...(lastArgs.current ?? ([] as unknown as Parameters<T>)));
				lastArgs.current = null;
			}, delay);
		}) as Debounced<T>;

		debounced.flush = () => {
			if (timer.current) {
				window.clearTimeout(timer.current);
				timer.current = null;
				fnRef.current(...(lastArgs.current ?? ([] as unknown as Parameters<T>)));
				lastArgs.current = null;
			}
		};

		return debounced;
	}, [delay]);
}

export function useFirestoreAutosave(params: {
	uid: string | null | undefined;
	projectId: string | null;
	notes: Note[];
	/** The board to save (serialized at save time); undefined leaves the stored field untouched. */
	storyboard?: StoryboardDoc;
	audioMeta?: { durationSec?: number };
	notesVersion?: number;
	setNotesVersion?: (v: number) => void;
}) {
	const { uid, projectId, notes, storyboard, audioMeta, notesVersion, setNotesVersion } = params;
	const [saving, setSaving] = useState(false);
	const [saveError, setSaveError] = useState<Error | null>(null);
	const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
	// Size of the last written doc (UTF-8 bytes) and whether the storyboard was held back for size
	const [payloadBytes, setPayloadBytes] = useState<number | null>(null);
	const [storyboardHeld, setStoryboardHeld] = useState(false);
	const lastTouchedAtRef = useRef<number | null>(null);
	const durationPatchedRef = useRef<string | null>(null); // track by projectId
	const mounted = useRef(true);

	// Track last successfully saved content to avoid redundant writes
	const lastSavedContentRef = useRef<string>('');

	useEffect(() => {
		mounted.current = true;
		return () => {
			mounted.current = false;
		};
	}, []);

	// When project changes, reset duration patch flag and last saved content
	useEffect(() => {
		durationPatchedRef.current = null;
		lastSavedContentRef.current = ''; // Force next save to execute (or establish baseline)
		setPayloadBytes(null);
		setStoryboardHeld(false);
	}, [projectId]);

	// Guard against parallel save execution from multiple exit hooks
	const isSavingRef = useRef(false);
	// A save requested while another was in flight runs again right after it
	const rerunRef = useRef(false);

	// Debounced notes saver
	const saveNotes = useDebounced(async (force = false) => {
		if (!uid || !projectId) return;

		// Serialize current notes + storyboard to check for changes
		const storyboardString = storyboard ? serializeStoryboard(storyboard) : undefined;
		const currentContent = JSON.stringify(notes) + '\u0000' + (storyboardString ?? '');

		// If content hasn't changed and we are not forcing (e.g. exit timestamp bump), skip
		if (!force && currentContent === lastSavedContentRef.current) {
			return;
		}

		// Prevent re-entry if a save is already strictly in progress; run once more when it ends
		if (isSavingRef.current) {
			rerunRef.current = true;
			return;
		}

		try {
			isSavingRef.current = true;
			setSaving(true);
			setSaveError(null);
			const { version: newVersion, bytes, storyboardHeld: held } = await saveProjectNotes(uid, projectId, notes, notesVersion, storyboardString);

			// Update our baseline
			lastSavedContentRef.current = currentContent;

			if (setNotesVersion) setNotesVersion(newVersion);

			// Ensure project shows as recently updated in lists (throttled)
			const now = Date.now();
			if (!lastTouchedAtRef.current || now - lastTouchedAtRef.current > 60_000) {
				lastTouchedAtRef.current = now;
				await touchProjectUpdatedAt(uid, projectId);
			}
			if (mounted.current) {
				setLastSavedAt(new Date());
				setSaving(false);
				setPayloadBytes(bytes);
				setStoryboardHeld(held);
			}
		} catch (err) {
			console.error('Autosave failed:', err);
			if (mounted.current) {
				setSaving(false);
				setSaveError(err instanceof Error ? err : new Error('Unknown save error'));
			}
		} finally {
			isSavingRef.current = false;
			if (rerunRef.current) {
				rerunRef.current = false;
				// Next tick, with the latest state (the debounced wrapper calls the newest callback)
				window.setTimeout(() => {
					saveNotes();
					saveNotes.flush();
				}, 0);
			}
		}
	}, 4000);

	// 1. Trigger autosave on notes or storyboard changes
	useEffect(() => {
		if (!uid || !projectId) return;
		saveNotes();
	}, [uid, projectId, notes, storyboard, saveNotes]);

	// Refs for event listeners to avoid re-attaching freqently
	const stateRef = useRef({ uid, projectId, notesVersion, saving });
	useEffect(() => {
		stateRef.current = { uid, projectId, notesVersion, saving };
	}, [uid, projectId, notesVersion, saving]);

	// 2. Lifecycle event listeners (Window focus, visibility, pagehide)
	useEffect(() => {
		const onWindowFocus = async () => {
			const { uid, projectId, notesVersion, saving } = stateRef.current;
			if (!uid || !projectId || typeof notesVersion !== 'number') return;
			if (isSavingRef.current || saving) return;

			try {
				const remoteVersion = await getProjectNotesVersion(uid, projectId);
				if (remoteVersion !== null && remoteVersion > notesVersion) {
					setSaveError(new Error('Sync Conflict: Remote data is newer. Please refresh to avoid overwriting.'));
				}
			} catch {
				// Ignore network errors
			}
		};

		const flushOnce = () => saveNotes.flush();

		const onVisibilityChange = () => {
			if (document.visibilityState === 'hidden') flushOnce();
			if (document.visibilityState === 'visible') onWindowFocus();
		};

		window.addEventListener('beforeunload', flushOnce);
		window.addEventListener('pagehide', flushOnce);
		window.addEventListener('focus', onWindowFocus);
		document.addEventListener('visibilitychange', onVisibilityChange);

		return () => {
			window.removeEventListener('beforeunload', flushOnce);
			window.removeEventListener('pagehide', flushOnce);
			window.removeEventListener('focus', onWindowFocus);
			document.removeEventListener('visibilitychange', onVisibilityChange);
		};
	}, [saveNotes]); // Only strictly stable dependencies for listeners

	// 3. Unmount flush triggers
	// We want to ensure this ONLY runs on unmount, not on dependency changes.
	useEffect(() => {
		return () => {
			saveNotes.flush();
		};
	}, [saveNotes]);

	// Update meta when audio duration available
	useEffect(() => {
		if (!uid || !projectId || !audioMeta?.durationSec) return;
		// Only patch duration once per project to avoid redundant writes
		if (durationPatchedRef.current === projectId) return;
		updateProjectMeta(uid, projectId, { audio: { durationSec: audioMeta.durationSec } })
			.then(() => {
				durationPatchedRef.current = projectId;
			})
			.catch(() => undefined);
	}, [uid, projectId, audioMeta?.durationSec]);

	return { saving, lastSavedAt, saveError, payloadBytes, storyboardHeld, flush: saveNotes.flush } as const;
}
