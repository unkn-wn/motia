import { useEffect, useMemo, useRef, useState } from 'react';
import { saveProjectNotes, updateProjectMeta } from '@/lib/db';
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
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  // Debounced notes saver
  const saveNotes = useDebounced(async () => {
    if (!uid || !projectId) return;
    try {
      setSaving(true);
  await saveProjectNotes(uid, projectId, notes);
      if (mounted.current) {
        setLastSavedAt(new Date());
        setSaving(false);
      }
    } catch {
      if (mounted.current) setSaving(false);
    }
  }, 800);

  // Trigger on notes changes
  useEffect(() => {
    if (!uid || !projectId) return;
    saveNotes();
    // flush on unload to minimize data loss
    const onBeforeUnload = () => saveNotes.flush();
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [uid, projectId, notes, saveNotes]);

  // Update meta when audio duration available
  useEffect(() => {
    if (!uid || !projectId || !audioMeta?.durationSec) return;
    updateProjectMeta(uid, projectId, { audio: { durationSec: audioMeta.durationSec } }).catch(() => undefined);
  }, [uid, projectId, audioMeta?.durationSec]);

  return { saving, lastSavedAt } as const;
}
