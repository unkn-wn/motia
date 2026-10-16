/**
 * Canvas transform and coordinate utilities
 */

import type { CanvasTransform } from '../types/canvas';
import type { Note } from '@types';

/**
 * Converts screen coordinates to canvas coordinates using a bounding rect
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
		// Base centering translate is always (rect.width / 2, 0)
		canvasX: (x - rect.width / 2 - transform.offsetX) / transform.scale,
		canvasY: (y - transform.offsetY) / transform.scale,
	};
};

/**
 * Finds note at canvas position with optional drawing exclusion
 */
/** Note cards on the canvas are this wide (world units). */
export const NOTE_CARD_WIDTH = 240;

export const findNoteAtPosition = (
	canvasX: number,
	canvasY: number,
	notes: Note[],
	scale: number,
	NOTE_LABEL_HIDE_THRESHOLD: number,
	excludeDrawings: boolean = false,
	noteLayoutCache?: Map<string, { key: string; lines: string[]; noteHeight: number }>
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
				if (
					canvasX >= note.canvasX &&
					canvasX <= note.canvasX + bounds.width &&
					canvasY >= note.canvasY &&
					canvasY <= note.canvasY + bounds.height
				) {
					return note;
				}
			}
		} else {
			// For text notes, use the new dimensions to match the rendered note
			const showNoteLabels = scale > NOTE_LABEL_HIDE_THRESHOLD;

			if (showNoteLabels) {
				const noteWidth = NOTE_CARD_WIDTH;
				let noteHeight;

				// Use cached layout if available (accurate), otherwise fall back to approximation
				if (noteLayoutCache && noteLayoutCache.has(note.id)) {
					noteHeight = noteLayoutCache.get(note.id)!.noteHeight;
				} else {
					// Fallback approximation
					const contentLines = note.content ? note.content.split('\n') : ['Empty note'];
					const lineHeight = 18;
					const headerHeight = 32;
					const padding = 12;
					noteHeight = headerHeight + contentLines.length * lineHeight + padding * 2;
				}

				if (
					canvasX >= note.canvasX &&
					canvasX <= note.canvasX + noteWidth &&
					canvasY >= note.canvasY &&
					canvasY <= note.canvasY + noteHeight
				) {
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
 * Calculates waveform dimensions and position for vertical or horizontal orientation
 */
export const getWaveformDimensions = (
	canvasWidth: number,
	canvasHeight: number,
	duration: number,
	orientation: import('@types').CanvasOrientation = 'vertical'
) => {
	if (orientation === 'horizontal') {
		const waveformWidth = Math.max((canvasWidth || window.innerWidth) * 3, duration * 100);
		const waveformHeight = 120;
		const waveformX = 0;
		const waveformY = -waveformHeight / 2;
		return {
			waveformHeight,
			waveformWidth,
			waveformX,
			waveformY,
		};
	}

	const waveformHeight = Math.max((canvasHeight || window.innerHeight) * 3, duration * 100);
	const waveformWidth = 120;
	// World-space center at X=0; left edge is -width/2
	const waveformX = -waveformWidth / 2;
	const waveformY = 0;

	return {
		waveformHeight,
		waveformWidth,
		waveformX,
		waveformY,
	};
};

/**
 * Checks if click is within waveform bounds
 */
export const isClickInWaveform = (
	canvasX: number,
	waveformX: number,
	waveformWidth: number,
	canvasY?: number,
	waveformY?: number,
	waveformHeight?: number,
	orientation: import('@types').CanvasOrientation = 'vertical'
) => {
	if (orientation === 'horizontal') {
		const wy = waveformY ?? -60;
		const wh = waveformHeight ?? 120;
		const inY = canvasY !== undefined ? canvasY >= wy && canvasY <= wy + wh : true;
		const inX = canvasX >= (waveformX ?? 0) && canvasX <= (waveformX ?? 0) + waveformWidth;
		return inX && inY;
	}
	return canvasX >= waveformX && canvasX <= waveformX + waveformWidth;
};

/**
 * Calculates time from canvas Y position (vertical)
 */
export const getTimeFromCanvasY = (canvasY: number, waveformHeight: number, duration: number) => {
	const relativeY = canvasY / waveformHeight;
	return Math.max(0, Math.min(duration, relativeY * duration));
};

