import { describe, expect, it } from 'vitest';
import type { Note } from '@types';
import type { Frame } from '@/features/storyboard/types';
import { activeItemAt, buildIndex, search } from './searchIndex';

const board = { width: 1920, height: 1080 };
const note = (id: string, time: number, content: string, extra: Partial<Note> = {}): Note => ({
	id,
	time,
	content,
	color: 'blue',
	canvasX: 100,
	canvasY: 200,
	createdAt: new Date(0),
	...extra,
});
const frame = (id: string, time: number, title: string, extra: Partial<Frame> = {}): Frame => ({
	id,
	time,
	title,
	notes: '',
	background: '#171717',
	canvasX: -400,
	canvasY: 100,
	elements: [],
	...extra,
});

const notes = [
	note('n2', 64.1, 'borders tilt here\nthen hold'),
	note('n1', 2, 'intro'),
	note('d', 1, '', { type: 'drawing' }),
	note('n3', 10, 'same time as a frame'),
];
const frames = [
	frame('f2', 65.9, 'Spiky', { notes: 'tilt opposite ways' }),
	frame('f1', 10, 'Checkered', {
		elements: [{ id: 'e1', type: 'box', x: 0, y: 0, w: 10, h: 10, rotation: 0, label: 'coin', note: 'Gold, spins' }],
	}),
];

describe('index', () => {
	const items = buildIndex(notes, frames, board);

	it('lists text notes and frames in time order, a frame first at the same time', () => {
		expect(items.map((i) => i.id)).toEqual(['n1', 'f1', 'n3', 'n2', 'f2']);
		expect(items.find((i) => i.id === 'n1')!.at).toEqual({ x: 220, y: 220 });
		expect(items.find((i) => i.id === 'f1')!.at.x).toBe(-400 + 120);
	});

	it('finds the item active at a time', () => {
		expect(activeItemAt(items, 1)).toBeNull();
		expect(activeItemAt(items, 10)!.id).toBe('n3');
		expect(activeItemAt(items, 65)!.id).toBe('n2');
		expect(activeItemAt(items, 999)!.id).toBe('f2');
	});

	it('searches notes, frame titles, frame notes, element labels and notes, in time order', () => {
		expect(search(items, notes, frames, 'TILT').map((r) => [r.item.id, r.snippet])).toEqual([
			['n2', 'borders tilt here'],
			['f2', 'Spiky · tilt opposite ways'],
		]);
		expect(search(items, notes, frames, 'coin').map((r) => r.snippet)).toEqual(['Checkered · coin']);
		expect(search(items, notes, frames, 'spins').map((r) => r.snippet)).toEqual(['Checkered · Gold, spins']);
		expect(search(items, notes, frames, 'checkered').map((r) => r.snippet)).toEqual(['Checkered']);
		expect(search(items, notes, frames, '  ')).toEqual([]);
	});
});
