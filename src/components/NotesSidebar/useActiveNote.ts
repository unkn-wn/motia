import { useMemo, useRef, useCallback } from 'react';
import type { Note } from '../../types/notes';
import { findActiveNote } from '@utils/notesUtils';

/**
 * Custom hook to efficiently track active note with debouncing
 * Reduces frequent recalculations when currentTime changes rapidly
 */
export const useActiveNote = (notes: Note[], currentTime: number, debounceMs: number = 16) => {
  const lastCalculationTime = useRef<number>(0);
  const cachedActiveNote = useRef<Note | null>(null);
  const cachedActiveNoteId = useRef<string | null>(null);
  const cachedCurrentTime = useRef<number>(-1);

  const activeNoteData = useMemo(() => {
    const now = Date.now();

    // Only recalculate if enough time has passed or if currentTime changed significantly
    const timeChanged = Math.abs(currentTime - cachedCurrentTime.current) > 0.1; // 100ms threshold
    const shouldRecalculate = timeChanged && (now - lastCalculationTime.current) > debounceMs;

    if (!shouldRecalculate && cachedCurrentTime.current !== -1) {
      return {
        activeNote: cachedActiveNote.current,
        activeNoteId: cachedActiveNoteId.current,
      };
    }

    // Perform the calculation
    const textNotes = notes.filter(note => note.type !== 'drawing');
    const activeNote = findActiveNote(textNotes, currentTime);
    const activeNoteId = activeNote?.id || null;

    // Cache the results
    cachedActiveNote.current = activeNote;
    cachedActiveNoteId.current = activeNoteId;
    cachedCurrentTime.current = currentTime;
    lastCalculationTime.current = now;

    return {
      activeNote,
      activeNoteId,
    };
  }, [notes, currentTime, debounceMs]);

  // Force recalculation when notes array changes
  const forceRecalculation = useCallback(() => {
    lastCalculationTime.current = 0;
    cachedCurrentTime.current = -1;
  }, []);

  return {
    ...activeNoteData,
    forceRecalculation,
  };
};
