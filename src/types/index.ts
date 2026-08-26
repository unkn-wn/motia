/**
 * Centralized type exports
 * This file re-exports all types for easy importing
 */

// Drawing types
export type {
  DrawingPoint,
  DrawingStroke,
  DrawingData,
  DrawingSession,
  CompressionType,
  CompressedStroke,
  CompressionResult
} from './drawing';

// Canvas types
export type {
  CanvasTransform,
  WaveformDimensions,
  CanvasPoint,
  CanvasBounds,
  CanvasOrientation
} from './canvas';

// Note types
export type {
  Note,
  NoteType,
  NoteCreateData
} from './notes';

// Tool modes (drawing / selection / eraser)
export type ToolMode = 'draw' | 'select' | 'erase' | null;

// Color types (re-export from utils)
export type { NoteColor } from '@utils/colorUtils';

// Keyboard shortcut types (re-export from utils)
export type { KeyboardShortcut } from '@utils/shortcutsUtils';

// Firestore document shapes
export type {
  UserProfileDoc,
  UserSettingsDoc,
  ProjectMetaDoc,
  ProjectNotesDoc,

} from './firebase';
