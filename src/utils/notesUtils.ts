/**
 * Notes management utilities
 */
import type { Note } from '../components/NotesOverlay';

/**
 * Sorts notes by time in ascending order
 */
export const sortNotesByTime = (notes: Note[]): Note[] => {
  return [...notes].sort((a, b) => a.time - b.time);
};

/**
 * Finds the currently active note during playback
 * (most recent note that has been passed)
 */
export const findActiveNote = (notes: Note[], currentTime: number): Note | null => {
  const sortedNotes = sortNotesByTime(notes);
  for (let i = sortedNotes.length - 1; i >= 0; i--) {
    if (sortedNotes[i].time <= currentTime) {
      return sortedNotes[i];
    }
  }
  return null;
};

/**
 * Generates a unique note ID
 */
export const generateNoteId = (): string => {
  return `note_${Date.now()}_${Math.random()}`;
};

/**
 * Creates a new note object
 */
export const createNote = (
  time: number,
  canvasX: number,
  canvasY: number,
  content: string = '',
  color: string = 'blue'
): Note => {
  return {
    id: generateNoteId(),
    time,
    canvasX,
    canvasY,
    content,
    color,
    createdAt: new Date(),
  };
};
