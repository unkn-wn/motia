/**
 * Utilities for managing notes data
 */

import type { Note } from '../types';

/**
 * Generates a unique note ID
 */
const generateNoteId = (): string => {
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
