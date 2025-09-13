import { useEffect, useMemo, useRef, useState } from 'react';
import { saveProjectNotes, updateProjectMeta, touchProjectUpdatedAt } from '@/lib/db';
import type { Note } from '@types';

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
  audioMeta?: { durationSec?: number };
}) {
  const { uid, projectId, notes, audioMeta } = params;
  const [saving, setSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const lastTouchedAtRef = useRef<number | null>(null);
  const lastSavedSignatureRef = useRef<string | null>(null);
  const durationPatchedRef = useRef<string | null>(null); // track by projectId
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  // When project changes, reset duration patch flag and signatures
  useEffect(() => {
    durationPatchedRef.current = null;
    lastSavedSignatureRef.current = null;
  }, [projectId]);

  // Debounced notes saver
  const saveNotes = useDebounced(async () => {
    if (!uid || !projectId) return;
    try {
      setSaving(true);
      await saveProjectNotes(uid, projectId, notes);
      // Ensure project shows as recently updated in lists (throttled)
      const now = Date.now();
      if (!lastTouchedAtRef.current || now - lastTouchedAtRef.current > 60_000) {
        lastTouchedAtRef.current = now;
        await touchProjectUpdatedAt(uid, projectId);
      }
      if (mounted.current) {
        setLastSavedAt(new Date());
        setSaving(false);
        // Update saved signature on success
        lastSavedSignatureRef.current = buildNotesSignature(notes);
      }
    } catch {
      if (mounted.current) setSaving(false);
    }
  }, 2500);

  // Trigger on notes changes
  useEffect(() => {
    if (!uid || !projectId) return;
    // Skip scheduling save if nothing meaningfully changed since last successful save
    const nextSig = buildNotesSignature(notes);
    if (lastSavedSignatureRef.current && lastSavedSignatureRef.current === nextSig) {
      return;
    }
    saveNotes();
    // flush on unload to minimize data loss
    const onBeforeUnload = () => {
      saveNotes.flush();
      if (uid && projectId) {
        // Fire a best-effort final timestamp bump; ignore errors in unload
        touchProjectUpdatedAt(uid, projectId).catch(() => undefined);
      }
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        saveNotes.flush();
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [uid, projectId, notes, saveNotes]);

  // Update meta when audio duration available
  useEffect(() => {
    if (!uid || !projectId || !audioMeta?.durationSec) return;
    // Only patch duration once per project to avoid redundant writes
    if (durationPatchedRef.current === projectId) return;
    updateProjectMeta(uid, projectId, { audio: { durationSec: audioMeta.durationSec } })
      .then(() => { durationPatchedRef.current = projectId; })
      .catch(() => undefined);
  }, [uid, projectId, audioMeta?.durationSec]);

  return { saving, lastSavedAt, flush: saveNotes.flush } as const;
}

// Build a lightweight signature of notes to detect meaningful changes without hashing large stroke arrays
function buildNotesSignature(notes: Note[]): string {
  // Project each note into a small tuple and stringify
  const proj = notes.map(n => {
    if (n.type === 'drawing' && n.drawing) {
      const comp = n.drawing.compressed;
      const compLen = Array.isArray(comp) ? comp.length : (typeof comp === 'string' ? comp.length : 0);
      return ['d', n.id, n.canvasX, n.canvasY, compLen, n.drawing.bounds?.width ?? 0, n.drawing.bounds?.height ?? 0];
    }
    return ['t', n.id, n.canvasX, n.canvasY, n.content, n.color];
  });
  return JSON.stringify(proj);
}
