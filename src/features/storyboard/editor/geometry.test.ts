import { describe, expect, it } from 'vitest';
import type { FrameElement } from '../types';
import {
	applyBox,
	applyRotation,
	boxBounds,
	elementBox,
	elementsInRect,
	handlePositions,
	hitTestElement,
	hitTestElements,
	resizeBox,
	rotatePoint,
	rotationToward,
	type Box,
} from './geometry';

const rect = (id: string, box: Partial<Box> = {}): FrameElement => ({
	id,
	type: 'rect',
	x: 100,
	y: 100,
	w: 200,
	h: 100,
	rotation: 0,
	radius: 0,
	fill: '#fff',
	stroke: null,
	strokeWidth: 0,
	...box,
});
const close = (a: { x: number; y: number }, b: { x: number; y: number }) => {
	expect(a.x).toBeCloseTo(b.x, 6);
	expect(a.y).toBeCloseTo(b.y, 6);
};

describe('resize', () => {
	const b: Box = { x: 100, y: 100, w: 200, h: 100, rotation: 0 };

	it('moves only the dragged edge or corner', () => {
		expect(resizeBox(b, 'e', 50, 999, false)).toEqual({ x: 100, y: 100, w: 250, h: 100, rotation: 0 });
		expect(resizeBox(b, 'nw', 20, 10, false)).toEqual({ x: 120, y: 110, w: 180, h: 90, rotation: 0 });
		expect(resizeBox(b, 's', 0, -30, false)).toEqual({ x: 100, y: 100, w: 200, h: 70, rotation: 0 });
	});

	it('keeps the ratio on corners with Shift', () => {
		const r = resizeBox(b, 'se', 100, 0, true);
		expect(r.w / r.h).toBeCloseTo(2, 6);
		expect(r).toMatchObject({ x: 100, y: 100, w: 300, h: 150 });
	});

	it('never goes below the minimum size', () => {
		expect(resizeBox(b, 'e', -500, 0, false, 1).w).toBe(1);
	});

	it('keeps the opposite corner fixed on a rotated box', () => {
		const rotated: Box = { ...b, rotation: 30 };
		const before = handlePositions(rotated, 40).nw;
		// Drag the se handle 50 px along the box's own x axis
		const along = rotatePoint({ x: 50, y: 0 }, { x: 0, y: 0 }, 30);
		const r = resizeBox(rotated, 'se', along.x, along.y, false);
		expect(r.w).toBeCloseTo(250, 6);
		expect(r.h).toBeCloseTo(100, 6);
		expect(r.rotation).toBe(30);
		close(handlePositions(r, 40).nw, before);
	});
});

describe('rotate', () => {
	const b: Box = { x: 0, y: 0, w: 100, h: 100, rotation: 0 };

	it('measures clockwise from straight up, snapping to 15° with Shift', () => {
		expect(rotationToward(b, { x: 50, y: -100 }, false)).toBeCloseTo(0, 6);
		expect(rotationToward(b, { x: 200, y: 50 }, false)).toBeCloseTo(90, 6);
		expect(rotationToward(b, { x: 50, y: 200 }, false)).toBeCloseTo(180, 6);
		expect(rotationToward(b, { x: 120, y: -10 }, true) % 15).toBe(0);
	});

	it('turns point elements by baking the angle into their points', () => {
		const line: FrameElement = { id: 'l', type: 'line', points: [[0, 50], [100, 50]], stroke: '#fff', strokeWidth: 4 };
		const turned = applyRotation(line, elementBox(line), 90);
		if (!('points' in turned)) throw new Error('expected points');
		close({ x: turned.points[0][0], y: turned.points[0][1] }, { x: 50, y: 0 });
		close({ x: turned.points[1][0], y: turned.points[1][1] }, { x: 50, y: 100 });
	});

	it('bounds of a rotated box cover all its corners', () => {
		const r = boxBounds({ x: 0, y: 0, w: 100, h: 100, rotation: 45 });
		expect(r.w).toBeCloseTo(Math.SQRT2 * 100, 6);
		expect(r.x).toBeCloseTo(50 - (Math.SQRT2 * 100) / 2, 6);
	});
});

describe('hit testing', () => {
	it('uses the rotated shape', () => {
		const el = rect('r', { x: 0, y: 0, w: 200, h: 20, rotation: 90 });
		// Rotated a quarter turn about its centre (100, 10): now a tall thin bar around x = 100
		expect(hitTestElement(el, { x: 100, y: -60 }, 0)).toBe(true);
		expect(hitTestElement(el, { x: 10, y: 10 }, 0)).toBe(false);
	});

	it('hits ellipses inside the curve only', () => {
		const el: FrameElement = { id: 'e', type: 'ellipse', x: 0, y: 0, w: 100, h: 100, rotation: 0, fill: '#fff', stroke: null, strokeWidth: 0 };
		expect(hitTestElement(el, { x: 50, y: 50 }, 0)).toBe(true);
		expect(hitTestElement(el, { x: 3, y: 3 }, 0)).toBe(false);
	});

	it('hits lines within half the stroke width plus tolerance', () => {
		const el: FrameElement = { id: 'p', type: 'pen', points: [[0, 0], [100, 0]], stroke: '#fff', strokeWidth: 10 };
		expect(hitTestElement(el, { x: 50, y: 8 }, 4)).toBe(true);
		expect(hitTestElement(el, { x: 50, y: 12 }, 4)).toBe(false);
	});

	it('returns the topmost element', () => {
		expect(hitTestElements([rect('a'), rect('b')], { x: 150, y: 150 }, 0)?.id).toBe('b');
	});

	it('finds elements in a marquee in any direction', () => {
		expect(elementsInRect([rect('a'), rect('b', { x: 600 })], { x: 350, y: 250, w: -300, h: -200 })).toEqual(['a']);
	});

	it('maps points into a resized box', () => {
		const pen: FrameElement = { id: 'p', type: 'pen', points: [[0, 0], [100, 50]], stroke: '#fff', strokeWidth: 4 };
		const out = applyBox(pen, elementBox(pen), { x: 10, y: 10, w: 200, h: 100, rotation: 0 });
		expect('points' in out && out.points).toEqual([[10, 10], [210, 110]]);
	});
});
