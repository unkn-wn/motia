import { useMemo, useRef } from 'react';
import type { Note } from '@types';
import { isSameCreatedAt } from '@utils/notesCompare';

/**
 * Returns text notes sorted by time with stable object identities when
 * only non-content fields (like canvas positions) change.
 */
export function useStableDisplayNotes(notes: Note[]) {
  const prevMapRef = useRef<Map<string, Note>>(new Map());
  const prevArrRef = useRef<Note[] | null>(null);

  const displayNotes = useMemo(() => {
    const text = notes.filter(n => n.type !== 'drawing');
    const sorted = [...text].sort((a, b) => a.time - b.time);
    const prevMap = prevMapRef.current;
    let changed = false;
    const next: Note[] = new Array(sorted.length);
    for (let i = 0; i < sorted.length; i++) {
      const n = sorted[i];
      const p = prevMap.get(n.id);
      if (
        p &&
        p.content === n.content &&
        p.color === n.color &&
        p.time === n.time &&
        isSameCreatedAt(p.createdAt, n.createdAt)
      ) {
        next[i] = p;
      } else {
        next[i] = n;
        changed = true;
      }
    }
    const prevArr = prevArrRef.current;
    if (!changed && prevArr && prevArr.length === next.length) {
      let same = true;
      for (let i = 0; i < next.length; i++) { if (prevArr[i] !== next[i]) { same = false; break; } }
      if (same) return prevArr;
    }
    const newMap = new Map<string, Note>();
    for (const n of next) newMap.set(n.id, n);
    prevMapRef.current = newMap;
    prevArrRef.current = next;
    return next;
  }, [notes]);

  return displayNotes;
}
