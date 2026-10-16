import { describe, expect, it } from 'vitest';
import { addFrame, createFrame, emptyStoryboard } from './model';
import { parseStoryboard, serializeStoryboard, simplifyPenPoints, utf8Bytes } from './storage';
import type { StoryboardDoc } from './types';

const sample = (): StoryboardDoc => {
	const frame = createFrame({ time: 63, canvasX: -470, canvasY: 6290 });
	return addFrame(emptyStoryboard(), {
		...frame,
		endTime: 65.457,
		title: 'Checkered intro — «tilt»',
		elements: [
			{ id: 'e1', type: 'rect', x: 0, y: 0, w: 1920, h: 300, rotation: 0, radius: 0, fill: '#E60012', stroke: null, strokeWidth: 0, label: 'top border' },
			{ id: 'e6', type: 'pen', points: [[10, 20], [14, 26]], stroke: '#9CA3AF', strokeWidth: 4 },
		],
	});
};

describe('storyboard storage', () => {
	it('round-trips through the stored string', () => {
		const doc = sample();
		const { doc: parsed, readable } = parseStoryboard(serializeStoryboard(doc));
		expect(readable).toBe(true);
		expect(parsed).toEqual(doc);
	});

	it('gives an element id repeated within a frame a new id, and keeps ids shared across frames', () => {
		const doc = sample();
		const [el] = doc.frames[0].elements;
		const other = { ...createFrame({ time: 70, canvasX: 0, canvasY: 0 }), elements: [el] };
		const broken = { ...doc, frames: [{ ...doc.frames[0], elements: [...doc.frames[0].elements, { ...el, x: 50 }] }, other] };
		const { doc: parsed } = parseStoryboard(serializeStoryboard(broken));
		const ids = parsed.frames[0].elements.map((e) => e.id);
		expect(new Set(ids).size).toBe(3);
		expect(ids.slice(0, 2)).toEqual(['e1', 'e6']);
		expect(parsed.frames[0].elements[2]).toMatchObject({ x: 50, type: 'rect' });
		expect(parsed.frames[1].elements[0].id).toBe('e1');
	});

	it('treats a missing field as an empty, writable board', () => {
		for (const raw of [undefined, null, '']) {
			const { doc, readable } = parseStoryboard(raw);
			expect(readable).toBe(true);
			expect(doc).toEqual(emptyStoryboard());
		}
	});

	it('flags unreadable values so they are not overwritten', () => {
		for (const raw of ['{not json', '{"version":2,"frames":[],"board":{"width":1,"height":1}}', '{"version":1}', 42]) {
			expect(parseStoryboard(raw).readable).toBe(false);
		}
	});

	it('measures UTF-8 bytes of the JSON', () => {
		const value = { title: 'é → ✓', n: [1, 2] };
		expect(utf8Bytes(value)).toBe(new TextEncoder().encode(JSON.stringify(value)).length);
		expect(utf8Bytes(value)).toBeGreaterThan(JSON.stringify(value).length);
	});

	it('simplifies pen points and rounds them to integers', () => {
		const pts: [number, number][] = [[0.4, 0.4], [5.2, 0.1], [10.1, 0.2], [10.2, 0.3], [20.6, 9.7]];
		const out = simplifyPenPoints(pts);
		expect(out.every(([x, y]) => Number.isInteger(x) && Number.isInteger(y))).toBe(true);
		expect(out.length).toBeLessThan(pts.length);
		expect(out[0]).toEqual([0, 0]);
		expect(out[out.length - 1]).toEqual([21, 10]);
	});
});
