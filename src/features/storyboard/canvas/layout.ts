import type { CanvasOrientation } from '@types';
import { updateFrame } from '../model';
import type { BoardFormat, Frame, StoryboardDoc } from '../types';

// Frame cards on the main canvas (SPEC §4). World units; the waveform is 120 wide, centred on the time axis
// (x = 0 in vertical, y = 0 in horizontal). Frames sit on the side facing away from notes: left / above.

const CARD_WIDTH = 240;
export const CARD_HEADER = 28;
/** Below this zoom, cards collapse to their anchor dots (notes never collapse). */
export const FRAME_COLLAPSE_SCALE = 0.2;
/** Screen-space grab radius for anchor dots and span end ticks. */
const HANDLE_RADIUS_PX = 10;
const WAVEFORM_HALF = 60;
const CARD_GAP_VERTICAL = 110;
const CARD_GAP_HORIZONTAL = 60;
const STACK_GAP = 16;
/** A span shorter than this on screen collapses back to a single time when its end tick is dragged onto the start. */
const SPAN_CLEAR_PX = 8;

/** Where time runs on the canvas: `length` world units for `duration` seconds. */
export type TimeAxis = { orientation: CanvasOrientation; length: number; duration: number };
type Rect = { x: number; y: number; w: number; h: number };
type Pt = { x: number; y: number };

export function cardSize(board: BoardFormat): { w: number; h: number; thumbH: number } {
	const aspect = board.width > 0 && board.height > 0 ? board.height / board.width : 9 / 16;
	const thumbH = CARD_WIDTH * aspect;
	return { w: CARD_WIDTH, h: CARD_HEADER + thumbH, thumbH };
}

export function cardRect(frame: Pick<Frame, 'canvasX' | 'canvasY'>, board: BoardFormat): Rect {
	const { w, h } = cardSize(board);
	return { x: frame.canvasX, y: frame.canvasY, w, h };
}

export function timeToAxis(time: number, axis: TimeAxis): number {
	return axis.duration > 0 ? (time / axis.duration) * axis.length : 0;
}

/** The song time at a distance along the time axis (world units); the inverse of `timeToAxis`. */
export function axisToTime(along: number, axis: TimeAxis): number {
	return axis.length > 0 ? (along / axis.length) * axis.duration : 0;
}

/** Anchor dots and span brackets sit on the waveform edge that faces the frames. */
export function anchorPoint(time: number, axis: TimeAxis): Pt {
	const along = timeToAxis(time, axis);
	return axis.orientation === 'horizontal' ? { x: along, y: -WAVEFORM_HALF } : { x: -WAVEFORM_HALF, y: along };
}

const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** Beside the waveform at `time`; pushed along the time axis past any card it would overlap. */
export function defaultCardPosition(time: number, frames: Frame[], board: BoardFormat, axis: TimeAxis): { canvasX: number; canvasY: number } {
	const { w, h } = cardSize(board);
	const along = timeToAxis(time, axis);
	const horizontal = axis.orientation === 'horizontal';
	const rect: Rect = horizontal
		? { x: along - w / 2, y: -WAVEFORM_HALF - CARD_GAP_HORIZONTAL - h, w, h }
		: { x: -WAVEFORM_HALF - CARD_GAP_VERTICAL - w, y: along - h / 2, w, h };
	const others = frames.map((f) => cardRect(f, board));
	for (let guard = 0; guard <= others.length; guard++) {
		const hit = others.find((o) => overlaps(rect, o));
		if (!hit) break;
		if (horizontal) rect.x = hit.x + hit.w + STACK_GAP;
		else rect.y = hit.y + hit.h + STACK_GAP;
	}
	return { canvasX: rect.x, canvasY: rect.y };
}

/** `1:05.9` */
export function formatFrameTime(t: number): string {
	const tenths = Math.round(Math.max(0, t) * 10);
	const minutes = Math.floor(tenths / 600);
	const seconds = (tenths % 600) / 10;
	return `${minutes}:${seconds.toFixed(1).padStart(4, '0')}`;
}

/** Card header time: `1:05.9`, or the range `1:03.0 → 1:05.4`. */
export function frameTimeLabel(frame: Pick<Frame, 'time' | 'endTime'>): string {
	return frame.endTime !== undefined ? `${formatFrameTime(frame.time)} → ${formatFrameTime(frame.endTime)}` : formatFrameTime(frame.time);
}

export type FrameHitKind = 'card' | 'anchor' | 'endTick';

/** Topmost frame target at a world point. Collapsed cards (zoomed far out) can't be grabbed; their anchors can. */
export function findFrameTarget(
	p: Pt,
	frames: Frame[],
	board: BoardFormat,
	axis: TimeAxis,
	scale: number
): { frame: Frame; kind: FrameHitKind } | null {
	if (scale >= FRAME_COLLAPSE_SCALE) {
		for (let i = frames.length - 1; i >= 0; i--) {
			const r = cardRect(frames[i], board);
			if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) return { frame: frames[i], kind: 'card' };
		}
	}
	const radius = HANDLE_RADIUS_PX / scale;
	const near = (q: Pt) => Math.hypot(p.x - q.x, p.y - q.y) <= radius;
	for (let i = frames.length - 1; i >= 0; i--) {
		const f = frames[i];
		if (near(anchorPoint(f.time, axis))) return { frame: f, kind: 'anchor' };
		if (f.endTime !== undefined && near(anchorPoint(f.endTime, axis))) return { frame: f, kind: 'endTick' };
	}
	return null;
}

export function framesInRect(r: Rect, frames: Frame[], board: BoardFormat): Set<string> {
	const box = { x: Math.min(r.x, r.x + r.w), y: Math.min(r.y, r.y + r.h), w: Math.abs(r.w), h: Math.abs(r.h) };
	return new Set(frames.filter((f) => overlaps(box, cardRect(f, board))).map((f) => f.id));
}

export type FrameDrag = {
	kind: FrameHitKind;
	id: string;
	initialCanvasX: number;
	initialCanvasY: number;
	initialTime: number;
	initialEndTime?: number;
};

/**
 * Applies a drag by (dx, dy) world units. A card moves freely (time unchanged); the anchor retimes the frame and
 * keeps the span's length; the end tick changes `endTime`, and dragging it onto the start clears the span.
 */
export function dragFrame(doc: StoryboardDoc, drag: FrameDrag, dx: number, dy: number, axis: TimeAxis, scale: number): StoryboardDoc {
	if (drag.kind === 'card') {
		return updateFrame(doc, drag.id, { canvasX: drag.initialCanvasX + dx, canvasY: drag.initialCanvasY + dy });
	}
	if (axis.duration <= 0 || axis.length <= 0) return doc;
	const dt = ((axis.orientation === 'horizontal' ? dx : dy) / axis.length) * axis.duration;
	if (drag.kind === 'anchor') {
		const span = drag.initialEndTime !== undefined ? drag.initialEndTime - drag.initialTime : 0;
		const time = Math.max(0, Math.min(axis.duration - span, drag.initialTime + dt));
		return updateFrame(doc, drag.id, drag.initialEndTime !== undefined ? { time, endTime: time + span } : { time });
	}
	const frame = doc.frames.find((f) => f.id === drag.id);
	if (!frame || drag.initialEndTime === undefined) return doc;
	const end = Math.max(frame.time, Math.min(axis.duration, drag.initialEndTime + dt));
	const onStart = ((end - frame.time) / axis.duration) * axis.length * scale < SPAN_CLEAR_PX;
	return updateFrame(doc, drag.id, { endTime: onStart ? undefined : end });
}
