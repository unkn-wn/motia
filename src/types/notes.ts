/**
 * Note-related type definitions
 */

import type { DrawingData } from './drawing';

export interface Note {
  id: string;
  time: number;
  // Canvas-relative coordinates (not screen coordinates)
  canvasX: number;
  canvasY: number;
  content: string;
  color: string;
  createdAt: Date;
  // Optional drawing data
  drawing?: DrawingData;
  type?: 'note' | 'drawing'; // Default to 'note' for backward compatibility
}

export type NoteType = 'note' | 'drawing';

export interface NoteCreateData {
  time: number;
  canvasX: number;
  canvasY: number;
  content?: string;
  color?: string;
  drawing?: DrawingData;
  type?: NoteType;
}
