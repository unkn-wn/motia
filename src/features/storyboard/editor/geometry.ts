import type { FrameElement, Point } from '../types';

// Frame-space geometry for the editor (board pixels, y down). Boxes are unrotated x/y/w/h plus `rotation` degrees
// clockwise about their centre; line, arrow and pen elements are absolute points.

export type Pt = { x: number; y: number };
export type Box = { x: number; y: number; w: number; h: number; rotation: number };
export type Handle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw' | 'rotate';
export type PointsElement = Extract<FrameElement, { points: Point[] }>;
export type BoxElement = Exclude<FrameElement, PointsElement>;

export const isPointsElement = (el: FrameElement): el is PointsElement => 'points' in el;

const rad = (deg: number) => (deg * Math.PI) / 180;

export function rotatePoint(p: Pt, c: Pt, deg: number): Pt {
	if (!deg) return p;
	const a = rad(deg);
	const cos = Math.cos(a);
	const sin = Math.sin(a);
	const dx = p.x - c.x;
	const dy = p.y - c.y;
	return { x: c.x + dx * cos - dy * sin, y: c.y + dx * sin + dy * cos };
}

export const boxCenter = (b: Box): Pt => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });

/** The element's box: its own box, or the axis-aligned bounds of its points. */
export function elementBox(el: FrameElement): Box {
	if (!isPointsElement(el)) return { x: el.x, y: el.y, w: el.w, h: el.h, rotation: el.rotation };
	const xs = el.points.map((p) => p[0]);
	const ys = el.points.map((p) => p[1]);
	const x = Math.min(...xs);
	const y = Math.min(...ys);
	return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y, rotation: 0 };
}

/** Axis-aligned bounds of a (possibly rotated) box. */
export function boxBounds(b: Box): { x: number; y: number; w: number; h: number } {
	const c = boxCenter(b);
	const corners = [
		{ x: b.x, y: b.y },
		{ x: b.x + b.w, y: b.y },
		{ x: b.x + b.w, y: b.y + b.h },
		{ x: b.x, y: b.y + b.h },
	].map((p) => rotatePoint(p, c, b.rotation));
	const xs = corners.map((p) => p.x);
	const ys = corners.map((p) => p.y);
	const x = Math.min(...xs);
	const y = Math.min(...ys);
	return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

function distanceToSegment(p: Pt, a: Pt, b: Pt): number {
	const dx = b.x - a.x;
	const dy = b.y - a.y;
	const len2 = dx * dx + dy * dy;
	const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
	return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Whether a frame point touches the element; `tolerance` is in frame pixels. */
export function hitTestElement(el: FrameElement, p: Pt, tolerance: number): boolean {
	if (isPointsElement(el)) {
		const reach = el.strokeWidth / 2 + tolerance;
		for (let i = 1; i < el.points.length; i++) {
			const a = { x: el.points[i - 1][0], y: el.points[i - 1][1] };
			const b = { x: el.points[i][0], y: el.points[i][1] };
			if (distanceToSegment(p, a, b) <= reach) return true;
		}
		return el.points.length === 1 && Math.hypot(p.x - el.points[0][0], p.y - el.points[0][1]) <= reach;
	}
	// Into the element's unrotated space
	const b = elementBox(el);
	const q = rotatePoint(p, boxCenter(b), -b.rotation);
	if (el.type === 'ellipse') {
		const rx = b.w / 2 + tolerance;
		const ry = b.h / 2 + tolerance;
		const c = boxCenter(b);
		return rx > 0 && ry > 0 && ((q.x - c.x) / rx) ** 2 + ((q.y - c.y) / ry) ** 2 <= 1;
	}
	return q.x >= b.x - tolerance && q.x <= b.x + b.w + tolerance && q.y >= b.y - tolerance && q.y <= b.y + b.h + tolerance;
}

/** Topmost element under the point (later elements are drawn on top). */
export function hitTestElements(els: FrameElement[], p: Pt, tolerance: number): FrameElement | null {
	for (let i = els.length - 1; i >= 0; i--) if (hitTestElement(els[i], p, tolerance)) return els[i];
	return null;
}

/** Ids of elements whose bounds intersect a rectangle (any drag direction). */
export function elementsInRect(els: FrameElement[], r: { x: number; y: number; w: number; h: number }): string[] {
	const rx = Math.min(r.x, r.x + r.w);
	const ry = Math.min(r.y, r.y + r.h);
	const rw = Math.abs(r.w);
	const rh = Math.abs(r.h);
	return els
		.filter((el) => {
			const b = boxBounds(elementBox(el));
			return b.x <= rx + rw && rx <= b.x + b.w && b.y <= ry + rh && ry <= b.y + b.h;
		})
		.map((el) => el.id);
}

const HANDLE_LOCAL: Record<Exclude<Handle, 'rotate'>, [number, number]> = {
	nw: [-1, -1],
	n: [0, -1],
	ne: [1, -1],
	e: [1, 0],
	se: [1, 1],
	s: [0, 1],
	sw: [-1, 1],
	w: [-1, 0],
};

/** Handle positions in frame space; `rotateOffset` is how far above the top edge the rotate handle sits. */
export function handlePositions(b: Box, rotateOffset: number): Record<Handle, Pt> {
	const c = boxCenter(b);
	const out = {} as Record<Handle, Pt>;
	for (const [h, [sx, sy]] of Object.entries(HANDLE_LOCAL) as Array<[Exclude<Handle, 'rotate'>, [number, number]]>) {
		out[h] = rotatePoint({ x: c.x + (sx * b.w) / 2, y: c.y + (sy * b.h) / 2 }, c, b.rotation);
	}
	out.rotate = rotatePoint({ x: c.x, y: b.y - rotateOffset }, c, b.rotation);
	return out;
}

/**
 * Resizes a box by dragging a handle by (dx, dy) frame pixels. The opposite edge or corner stays put, also for
 * rotated boxes. `keepRatio` (Shift) keeps the aspect ratio on corner handles. Sizes never go below `min`.
 */
export function resizeBox(b: Box, handle: Exclude<Handle, 'rotate'>, dx: number, dy: number, keepRatio: boolean, min = 1): Box {
	const [sx, sy] = HANDLE_LOCAL[handle];
	const local = rotatePoint({ x: dx, y: dy }, { x: 0, y: 0 }, -b.rotation);
	let w = sx ? Math.max(min, b.w + sx * local.x) : b.w;
	let h = sy ? Math.max(min, b.h + sy * local.y) : b.h;
	if (keepRatio && sx && sy && b.w > 0 && b.h > 0) {
		const k = Math.max(w / b.w, h / b.h);
		w = Math.max(min, b.w * k);
		h = Math.max(min, b.h * k);
	}
	// The anchor (opposite handle) keeps its frame position
	const c = boxCenter(b);
	const anchor = rotatePoint({ x: c.x - (sx * b.w) / 2, y: c.y - (sy * b.h) / 2 }, c, b.rotation);
	const toCenter = rotatePoint({ x: (sx * w) / 2, y: (sy * h) / 2 }, { x: 0, y: 0 }, b.rotation);
	const nc = { x: anchor.x + toCenter.x, y: anchor.y + toCenter.y };
	return { x: nc.x - w / 2, y: nc.y - h / 2, w, h, rotation: b.rotation };
}

/** Rotation (degrees, clockwise, 0 = handle straight up) for the pointer; Shift snaps to 15°. */
export function rotationToward(b: Box, p: Pt, snap: boolean): number {
	const c = boxCenter(b);
	let deg = (Math.atan2(p.y - c.y, p.x - c.x) * 180) / Math.PI + 90;
	if (snap) deg = Math.round(deg / 15) * 15;
	deg = ((deg % 360) + 360) % 360;
	return deg > 180 ? deg - 360 : deg;
}

/** Maps points from one box onto another (resizing a line, arrow or pen stroke). */
export function mapPoints(points: Point[], from: Box, to: Box): Point[] {
	const kx = from.w ? to.w / from.w : 1;
	const ky = from.h ? to.h / from.h : 1;
	return points.map(([x, y]) => [to.x + (x - from.x) * kx, to.y + (y - from.y) * ky]);
}

export function rotatePoints(points: Point[], c: Pt, deg: number): Point[] {
	return points.map(([x, y]) => {
		const q = rotatePoint({ x, y }, c, deg);
		return [q.x, q.y];
	});
}

/** The element moved by (dx, dy). */
export function moveElement<T extends FrameElement>(el: T, dx: number, dy: number): T {
	if (isPointsElement(el)) return { ...el, points: el.points.map(([x, y]) => [x + dx, y + dy] as Point) };
	return { ...el, x: (el as BoxElement).x + dx, y: (el as BoxElement).y + dy };
}

/** Applies a new box: box elements take it directly; point elements are scaled into it. */
export function applyBox<T extends FrameElement>(el: T, from: Box, to: Box): T {
	if (isPointsElement(el)) return { ...el, points: mapPoints(el.points, from, to) };
	return { ...el, x: to.x, y: to.y, w: to.w, h: to.h, rotation: to.rotation };
}

/** Rotates the element to `deg`: box elements store it; point elements have the turn applied to their points. */
export function applyRotation<T extends FrameElement>(el: T, from: Box, deg: number): T {
	if (isPointsElement(el)) {
		// Rounded like committed pen strokes, so repeated turns don't grow the stored points
		const points = rotatePoints(el.points, boxCenter(from), deg - from.rotation).map(([x, y]) => [Math.round(x), Math.round(y)] as Point);
		return { ...el, points };
	}
	return { ...el, rotation: deg };
}

/** Snaps a value to a grid step. */
export const snap = (v: number, step: number) => Math.round(v / step) * step;
