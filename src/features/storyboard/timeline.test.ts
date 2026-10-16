import { describe, expect, it } from 'vitest';
import { createFrame } from './model';
import { activeFrameAt, duplicateTime, framesByTime, neighbours } from './timeline';
import type { Frame } from './types';

const f = (id: string, time: number): Frame => ({ ...createFrame({ time, canvasX: 0, canvasY: 0 }), id });

describe('timeline', () => {
	const frames = [f('c', 3), f('a', 1), f('b1', 2), f('b2', 2)];
	const ordered = framesByTime(frames);

	it('orders by time, keeping creation order for equal times', () => {
		expect(ordered.map((x) => x.id)).toEqual(['a', 'b1', 'b2', 'c']);
	});

	it('finds the frame on screen at a time', () => {
		expect(activeFrameAt(ordered, 0.5)).toBeNull();
		expect(activeFrameAt(ordered, 1)?.id).toBe('a');
		expect(activeFrameAt(ordered, 1.999)?.id).toBe('a');
		expect(activeFrameAt(ordered, 2)?.id).toBe('b2');
		expect(activeFrameAt(ordered, 99)?.id).toBe('c');
		expect(activeFrameAt([], 5)).toBeNull();
	});

	it('lists neighbours around a frame', () => {
		expect(neighbours(ordered, 'b1', 1).map((x) => x.id)).toEqual(['a', 'b1', 'b2']);
		expect(neighbours(ordered, 'a', 2).map((x) => x.id)).toEqual(['a', 'b1', 'b2']);
		expect(neighbours(ordered, 'missing', 2)).toEqual([]);
	});

	it('puts duplicates half a second later, or at a later playhead, within the song', () => {
		expect(duplicateTime(f('x', 5), 3, 30)).toBe(5.5);
		expect(duplicateTime(f('x', 5), 8, 30)).toBe(8);
		expect(duplicateTime(f('x', 29.8), 0, 30)).toBe(30);
		expect(duplicateTime(f('x', 5), 0, 0)).toBe(5.5);
	});
});
