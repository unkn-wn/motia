import { newId, type ElementPatch } from '../model';
import type { FrameElement, Point } from '../types';
import type { Pt } from './geometry';

// Editor tools and the elements they create. Defaults are plain and readable on the dark default background.

export type Tool = 'select' | 'rect' | 'ellipse' | 'line' | 'arrow' | 'text' | 'pen' | 'box' | 'frameRef';
/** Tools drawn by dragging a box or a line */
export type ShapeTool = 'rect' | 'ellipse' | 'line' | 'arrow' | 'box' | 'frameRef';

export const TOOL_KEYS: Record<string, Tool> = { v: 'select', r: 'rect', o: 'ellipse', l: 'line', a: 'arrow', t: 'text', p: 'pen', b: 'box' };

const SHAPE_FILL = '#d4d4d4';
const LINE_STROKE = '#e5e5e5';
export const TEXT_FONT_SIZE = 96;
/** A click without a drag makes a shape of this size, centred on the click. */
const CLICK_SIZE = { w: 320, h: 200 };

const lineCount = (text: string) => Math.max(1, text.split('\n').length);

/** Average glyph width relative to the font size (system UI fonts), for sizing the text box. */
const GLYPH_WIDTH = 0.62;

/** New text, with the box following it: height from the number of lines, width from the longest one. */
export function textPatch(el: Extract<FrameElement, { type: 'text' }>, text: string): ElementPatch {
	const longest = Math.max(1, ...text.split('\n').map((line) => line.length));
	return { text, w: Math.round(longest * el.fontSize * GLYPH_WIDTH), h: lineCount(text) * el.fontSize * 1.2 };
}

/** Box between two points; Shift makes it square. A click (no drag) gives a default-sized box. */
function boxBetween(a: Pt, b: Pt, square: boolean) {
	let w = b.x - a.x;
	let h = b.y - a.y;
	if (Math.abs(w) < 4 && Math.abs(h) < 4) return { x: a.x - CLICK_SIZE.w / 2, y: a.y - CLICK_SIZE.h / 2, w: CLICK_SIZE.w, h: CLICK_SIZE.h };
	if (square) {
		const s = Math.max(Math.abs(w), Math.abs(h));
		w = Math.sign(w || 1) * s;
		h = Math.sign(h || 1) * s;
	}
	return { x: Math.min(a.x, a.x + w), y: Math.min(a.y, a.y + h), w: Math.abs(w), h: Math.abs(h) };
}

/** End point snapped to 45° steps (Shift on lines and arrows). */
function snapAngle(a: Pt, b: Pt): Pt {
	const len = Math.hypot(b.x - a.x, b.y - a.y);
	const step = Math.PI / 4;
	const ang = Math.round(Math.atan2(b.y - a.y, b.x - a.x) / step) * step;
	return { x: a.x + len * Math.cos(ang), y: a.y + len * Math.sin(ang) };
}

/**
 * The element a shape tool draws from `a` to `b` (a draft until the pointer is released). A frame reference shows
 * `refFrameId`.
 */
export function shapeFromDrag(tool: ShapeTool, a: Pt, b: Pt, shift: boolean, id = newId('e_'), refFrameId = ''): FrameElement {
	if (tool === 'line' || tool === 'arrow') {
		const end = shift ? snapAngle(a, b) : b;
		// A click without a drag draws a short horizontal line
		const to = Math.hypot(end.x - a.x, end.y - a.y) < 4 ? { x: a.x + CLICK_SIZE.w, y: a.y } : end;
		const points: Point[] = [
			[a.x, a.y],
			[to.x, to.y],
		];
		return { id, type: tool, points, stroke: LINE_STROKE, strokeWidth: 8 };
	}
	const box = boxBetween(a, b, shift);
	if (tool === 'box') return { id, type: 'box', ...box, rotation: 0 };
	if (tool === 'frameRef') return { id, type: 'frameRef', ...box, rotation: 0, refFrameId };
	if (tool === 'ellipse') return { id, type: 'ellipse', ...box, rotation: 0, fill: SHAPE_FILL, stroke: null, strokeWidth: 0 };
	return { id, type: 'rect', ...box, rotation: 0, radius: 0, fill: SHAPE_FILL, stroke: null, strokeWidth: 0 };
}

export function penStroke(points: Point[], id = newId('e_')): FrameElement {
	return { id, type: 'pen', points, stroke: LINE_STROKE, strokeWidth: 6 };
}

export function textAt(p: Pt, id = newId('e_')): Extract<FrameElement, { type: 'text' }> {
	return { id, type: 'text', x: p.x, y: p.y, w: TEXT_FONT_SIZE * 8, h: TEXT_FONT_SIZE * 1.2, rotation: 0, text: '', fontSize: TEXT_FONT_SIZE, fill: '#ffffff' };
}
