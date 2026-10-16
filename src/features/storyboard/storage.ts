import { optimizeDrawingPoints } from '@utils/drawingUtils';
import { emptyStoryboard, newId } from './model';
import type { Frame, Point, StoryboardDoc } from './types';

// The storyboard is stored as one JSON string field (`storyboard`) on users/{uid}/projects/{pid}/notes/all.
// A string sidesteps Firestore's arrays-of-arrays limit and shares the doc's version check.

export function utf8Bytes(value: unknown): number {
	return new TextEncoder().encode(JSON.stringify(value)).length;
}

export function serializeStoryboard(doc: StoryboardDoc): string {
	return JSON.stringify(doc);
}

const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * Gives a repeated element id within a frame (saved by an earlier bug that added a new text twice) a new id, so
 * every element can be selected and edited on its own. Ids shared across frames are intended and stay.
 */
function withUniqueElementIds(frame: Frame): Frame {
	if (!Array.isArray(frame?.elements)) return frame;
	const seen = new Set<string>();
	let changed = false;
	const elements = frame.elements.map((el) => {
		if (!seen.has(el.id)) {
			seen.add(el.id);
			return el;
		}
		changed = true;
		return { ...el, id: newId('e_') };
	});
	return changed ? { ...frame, elements } : frame;
}

/**
 * Parses the stored string. A missing field is an empty board. `readable: false` means the stored value
 * could not be understood; callers must then not overwrite it.
 */
export function parseStoryboard(raw: unknown): { doc: StoryboardDoc; readable: boolean } {
	if (raw === undefined || raw === null || raw === '') return { doc: emptyStoryboard(), readable: true };
	try {
		const data = typeof raw === 'string' ? JSON.parse(raw) : null;
		const board = data?.board;
		if (data?.version !== 1 || !Array.isArray(data.frames) || !isFiniteNumber(board?.width) || !isFiniteNumber(board?.height)) {
			return { doc: emptyStoryboard(), readable: false };
		}
		// Unknown top-level fields are kept, so a newer client's additions survive this client's saves.
		// Additive changes keep version 1; a breaking change must bump the version.
		const doc: StoryboardDoc = {
			...data,
			version: 1,
			board,
			frames: data.frames.map(withUniqueElementIds),
			symbols: Array.isArray(data.symbols) ? data.symbols : [],
			assets: Array.isArray(data.assets) ? data.assets : [],
		};
		return { doc, readable: true };
	} catch {
		return { doc: emptyStoryboard(), readable: false };
	}
}

/** Pen strokes inside frames are simplified and rounded to integers before they are committed. */
export function simplifyPenPoints(points: Point[], tolerance = 1): Point[] {
	const simplified = optimizeDrawingPoints(points.map(([x, y]) => ({ x, y })), tolerance);
	const out: Point[] = [];
	for (const p of simplified) {
		const q: Point = [Math.round(p.x), Math.round(p.y)];
		const last = out[out.length - 1];
		if (!last || last[0] !== q[0] || last[1] !== q[1]) out.push(q);
	}
	return out;
}
