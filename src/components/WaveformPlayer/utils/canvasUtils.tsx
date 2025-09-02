import type { Note, CanvasTransform } from '@types';

/**
 * Converts screen coordinates to canvas coordinates
 */
export const screenToCanvasCoords = (
  screenX: number,
  screenY: number,
  rect: DOMRect,
  transform: CanvasTransform
) => {
  const x = screenX - rect.left;
  const y = screenY - rect.top;

  return {
    canvasX: (x - transform.offsetX) / transform.scale,
    canvasY: (y - transform.offsetY) / transform.scale
  };
};

/**
 * Finds note at canvas position with optional drawing exclusion
 */
export const findNoteAtPosition = (
  canvasX: number,
  canvasY: number,
  notes: Note[],
  scale: number,
  NOTE_LABEL_HIDE_THRESHOLD: number,
  excludeDrawings: boolean = false
): Note | null => {
  // Check notes in reverse order (most recent on top)
  for (let i = notes.length - 1; i >= 0; i--) {
    const note = notes[i];

    if (note.type === 'drawing') {
      // Skip drawing notes if excludeDrawings is true (for panning detection)
      if (excludeDrawings) continue;

      // For drawing notes, check if point is within drawing bounds
      if (note.drawing?.bounds) {
        const bounds = note.drawing.bounds;
        if (canvasX >= note.canvasX && canvasX <= note.canvasX + bounds.width &&
            canvasY >= note.canvasY && canvasY <= note.canvasY + bounds.height) {
          return note;
        }
      }
    } else {
      // For text notes, use the new dimensions to match the rendered note
      const showNoteLabels = scale > NOTE_LABEL_HIDE_THRESHOLD;

      if (showNoteLabels) {
        const noteWidth = 240;
        const contentLines = note.content ? note.content.split('\n') : ['Empty note'];
        const lineHeight = 18;
        const headerHeight = 32;
        const padding = 12;
        const noteHeight = headerHeight + (contentLines.length * lineHeight) + (padding * 2);

        if (canvasX >= note.canvasX && canvasX <= note.canvasX + noteWidth &&
            canvasY >= note.canvasY && canvasY <= note.canvasY + noteHeight) {
          return note;
        }
      } else {
        // When zoomed out, check if within dot radius
        const distance = Math.sqrt((canvasX - note.canvasX) ** 2 + (canvasY - note.canvasY) ** 2);
        if (distance <= 8) {
          return note;
        }
      }
    }
  }
  return null;
};

/**
 * Calculates waveform dimensions and position
 */
export const getWaveformDimensions = (
  canvasWidth: number,
  canvasHeight: number,
  duration: number
) => {
  const waveformHeight = Math.max(canvasHeight * 3, duration * 100);
  const waveformWidth = 120;
  const waveformX = (canvasWidth - waveformWidth) / 2;

  return {
    waveformHeight,
    waveformWidth,
    waveformX
  };
};

/**
 * Checks if click is within waveform bounds
 */
export const isClickInWaveform = (
  canvasX: number,
  waveformX: number,
  waveformWidth: number
) => {
  return canvasX >= waveformX && canvasX <= waveformX + waveformWidth;
};

/**
 * Calculates time from canvas Y position
 */
export const getTimeFromCanvasY = (
  canvasY: number,
  waveformHeight: number,
  duration: number
) => {
  const relativeY = canvasY / waveformHeight;
  return Math.max(0, Math.min(duration, relativeY * duration));
};
