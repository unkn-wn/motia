import { Timestamp } from 'firebase/firestore';
import type { CompressedStroke, DrawingStroke, Note } from '@types';
import { decompressSession } from '@utils/advancedCompression';
import { compressDrawingAdaptive } from '@utils/drawingUtils';
import { utf8Bytes } from '@/features/storyboard/storage';

// Pure building of the users/{uid}/projects/{pid}/notes/all payload (no Firestore calls).

/** Firestore caps a document at 1 MiB. The budget covers the whole doc: notes + sketch + storyboard. */
export const DOC_LIMIT_BYTES = 1_048_576;
export const SIZE_WARN_BYTES = 700_000;
export const STORYBOARD_HOLD_BYTES = 950_000;
export const PROJECT_TOO_BIG_ERROR = 'Project too big to save';
/** The one note that holds the whole canvas sketch at runtime */
export const SKETCH_NOTE_ID = 'drawing-global';

// Firestore does not support arrays-of-arrays and disallows undefined values.
// We sanitize payloads by: (1) removing undefined fields, (2) wrapping any array element
// that is itself an array into an object { __array: [...] }, recursively.
export function sanitizeForFirestore(value: unknown): unknown {
	if (value === undefined) return null; // avoid undefined
	if (value === null) return null;
	// Preserve Date and Firestore Timestamp as-is so Firestore can serialize them properly
	if (value instanceof Date) return value;
	if (value instanceof Timestamp) return value;
	if (Array.isArray(value)) {
		return value.map((el) => {
			if (Array.isArray(el)) {
				return { __array: sanitizeForFirestore(el) };
			}
			return sanitizeForFirestore(el);
		});
	}
	if (typeof value === 'object') {
		const obj = value as Record<string, unknown>;
		const out: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(obj)) {
			if (v === undefined) continue; // drop undefined keys
			out[k] = sanitizeForFirestore(v);
		}
		return out;
	}
	return value;
}

/** Every canvas-sketch stroke, from the drawing notes (compressed array or string, or raw strokes). */
export function sketchStrokes(notes: Note[]): DrawingStroke[] {
	const allStrokes: DrawingStroke[] = [];
	for (const dn of notes) {
		if (dn.type !== 'drawing' || !dn.drawing) continue;
		const d = dn.drawing;
		if (Array.isArray(d.compressed) || typeof d.compressed === 'string') {
			try {
				let comp = d.compressed as unknown;
				if (typeof comp === 'string') comp = JSON.parse(comp);
				const strokes = decompressSession(comp as CompressedStroke[]);
				if (strokes) {
					for (const s of strokes) allStrokes.push(s);
				}
			} catch {
				/* ignore parse errors for this note */
			}
		} else if (Array.isArray(d.strokes)) {
			for (const s of d.strokes) allStrokes.push(s);
		}
	}
	return allStrokes;
}

/** Text notes plus every canvas-sketch stroke merged into one compressed JSON string. */
export function buildNotesPayload(notes: Note[]): { notes: Note[]; compressed: string } {
	const nonDrawingNotes = notes.filter((n) => n.type !== 'drawing' || !n.drawing);
	const allStrokes = sketchStrokes(notes);

	// Compress aggregated strokes into a single session array, else empty
	const aggregatedCompressed: unknown[] = allStrokes.length > 0 ? compressDrawingAdaptive(allStrokes).strokes : [];

	return {
		notes: sanitizeForFirestore(nonDrawingNotes) as Note[],
		// Store compressed as JSON string to be safe with arrays-of-arrays
		compressed: JSON.stringify(aggregatedCompressed),
	};
}

export const stringBytes = (s: string) => new TextEncoder().encode(s).length;

/**
 * Size budget for the whole doc. `bytes` counts notes + sketch + storyboard as UTF-8 (the storyboard string as
 * stored, not re-escaped). Above the hold limit the storyboard is left out of the write, so Firestore keeps its
 * last saved value while notes keep saving.
 */
export function planStoryboardWrite(
	base: { notes: Note[]; compressed: string },
	storyboard: string | undefined
): { bytes: number; baseBytes: number; storyboardHeld: boolean } {
	const baseBytes = utf8Bytes(base);
	const bytes = baseBytes + (storyboard === undefined ? 0 : stringBytes(storyboard));
	return { bytes, baseBytes, storyboardHeld: storyboard !== undefined && bytes > STORYBOARD_HOLD_BYTES };
}
