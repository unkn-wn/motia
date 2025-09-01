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
  CanvasBounds
} from './canvas';

// Note types
export type {
  Note,
  NoteType,
  NoteCreateData
} from './notes';

// Color types (re-export from utils)
export type { NoteColor } from '../utils/colorUtils';

// Keyboard shortcut types (re-export from utils)
export type { KeyboardShortcut } from '../utils/shortcutsUtils';
