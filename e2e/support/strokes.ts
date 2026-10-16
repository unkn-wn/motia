import { decompressSession } from '../../src/utils/advancedCompression';
import type { CompressedStroke, DrawingStroke } from '../../src/types/drawing';
import type { NoteState } from './app';

/** Decodes the canvas sketch (the global drawing note) into strokes with absolute world points. */
export function strokesOf(notes: NoteState[]): DrawingStroke[] {
	const drawing = notes.find((n) => n.type === 'drawing' && n.drawing?.compressed);
	if (!drawing) return [];
	let compressed = drawing.drawing!.compressed;
	if (typeof compressed === 'string') compressed = JSON.parse(compressed);
	return decompressSession(compressed as CompressedStroke[]);
}

export function boundsOf(stroke: DrawingStroke) {
	const xs = stroke.points.map((p) => p.x);
	const ys = stroke.points.map((p) => p.y);
	return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}
