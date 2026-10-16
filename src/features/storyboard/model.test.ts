import { describe, expect, it } from 'vitest';
import {
	addElements,
	addFrame,
	createFrame,
	duplicateFrame,
	elementsForPaste,
	emptyStoryboard,
	patchElements,
	removeElements,
	removeFrames,
	reorderElements,
	replaceElements,
	setBoard,
	setCardPositions,
	updateFrame,
} from './model';
import type { FrameElement, StoryboardDoc } from './types';

function deepFreeze<T>(value: T): T {
	if (value && typeof value === 'object' && !Object.isFrozen(value)) {
		Object.freeze(value);
		for (const v of Object.values(value)) deepFreeze(v);
	}
	return value;
}

function boardWithTwoFrames(): StoryboardDoc {
	let doc = emptyStoryboard();
	doc = addFrame(doc, { ...createFrame({ time: 1, canvasX: -400, canvasY: 100 }), id: 'f1' });
	doc = addFrame(doc, { ...createFrame({ time: 2, canvasX: -400, canvasY: 300 }), id: 'f2', endTime: 3 });
	return deepFreeze(doc);
}

describe('storyboard model', () => {
	it('creates frames with unique ids and defaults', () => {
		const a = createFrame({ time: 1.5, canvasX: 10, canvasY: 20 });
		const b = createFrame({ time: 1.5, canvasX: 10, canvasY: 20 });
		expect(a.id).not.toBe(b.id);
		expect(a).toMatchObject({ time: 1.5, canvasX: 10, canvasY: 20, title: '', notes: '', elements: [] });
		expect(a.endTime).toBeUndefined();
	});

	it('adds a frame without touching the input', () => {
		const doc = boardWithTwoFrames();
		const frame = deepFreeze(createFrame({ time: 5, canvasX: 0, canvasY: 0 }));
		const next = addFrame(doc, frame);
		expect(next.frames.map((f) => f.id)).toEqual(['f1', 'f2', frame.id]);
		expect(doc.frames).toHaveLength(2);
		expect(next.frames[0]).toBe(doc.frames[0]);
	});

	it('updates one frame immutably and keeps the others by identity', () => {
		const doc = boardWithTwoFrames();
		const next = updateFrame(doc, 'f1', { time: 4, title: 'Checkered intro' });
		expect(next.frames[0]).toMatchObject({ id: 'f1', time: 4, title: 'Checkered intro' });
		expect(doc.frames[0].time).toBe(1);
		expect(next.frames[1]).toBe(doc.frames[1]);
	});

	it('clears a span when endTime is patched to undefined', () => {
		const doc = boardWithTwoFrames();
		const next = updateFrame(doc, 'f2', { endTime: undefined });
		expect('endTime' in next.frames[1]).toBe(false);
		expect(doc.frames[1].endTime).toBe(3);
	});

	it('returns the same doc when nothing changes', () => {
		const doc = boardWithTwoFrames();
		expect(updateFrame(doc, 'f1', { time: 1, title: '' })).toBe(doc);
		expect(updateFrame(doc, 'f1', { endTime: undefined })).toBe(doc);
		expect(updateFrame(doc, 'missing', { time: 9 })).toBe(doc);
		expect(removeFrames(doc, new Set(['missing']))).toBe(doc);
	});

	it('removes frames immutably', () => {
		const doc = boardWithTwoFrames();
		const next = removeFrames(doc, new Set(['f1']));
		expect(next.frames.map((f) => f.id)).toEqual(['f2']);
		expect(doc.frames).toHaveLength(2);
	});

	it('sets the board format', () => {
		const doc = boardWithTwoFrames();
		const next = setBoard(doc, { width: 2160, height: 2160, fps: 30, style: 'heavy glow' });
		expect(next.board).toEqual({ width: 2160, height: 2160, fps: 30, style: 'heavy glow' });
		expect(doc.board).toEqual({ width: 1920, height: 1080 });
	});
});

describe('duplicate and bulk move', () => {
	it('duplicates a frame with element ids kept and its span length', () => {
		let doc = emptyStoryboard();
		doc = addFrame(doc, {
			...createFrame({ time: 2, canvasX: 0, canvasY: 0 }),
			id: 'f1',
			endTime: 3,
			elements: [{ id: 'e1', type: 'rect', x: 0, y: 0, w: 10, h: 10, rotation: 0, radius: 0, fill: '#fff', stroke: null, strokeWidth: 0 }],
		});
		doc = deepFreeze(doc);
		const { doc: next, id } = duplicateFrame(doc, 'f1', { time: 2.5, canvasX: 5, canvasY: 6 });
		const copy = next.frames.find((f) => f.id === id)!;
		expect(id).not.toBe('f1');
		expect(copy).toMatchObject({ time: 2.5, endTime: 3.5, canvasX: 5, canvasY: 6 });
		expect(copy.elements.map((e) => e.id)).toEqual(['e1']);
		expect(doc.frames).toHaveLength(1);
	});

	it('moves several cards at once', () => {
		const doc = boardWithTwoFrames();
		const next = setCardPositions(doc, new Map([['f2', { x: 1, y: 2 }]]));
		expect(next.frames[1]).toMatchObject({ canvasX: 1, canvasY: 2 });
		expect(next.frames[0]).toBe(doc.frames[0]);
		expect(setCardPositions(doc, new Map([['f2', { x: -400, y: 300 }]]))).toBe(doc);
	});
});

describe('elements', () => {
	const el = (id: string): FrameElement => ({ id, type: 'rect', x: 0, y: 0, w: 10, h: 10, rotation: 0, radius: 0, fill: '#fff', stroke: null, strokeWidth: 0 });
	const docWith = (...els: FrameElement[]) =>
		deepFreeze(addFrame(emptyStoryboard(), { ...createFrame({ time: 1, canvasX: 0, canvasY: 0 }), id: 'f1', elements: els }));
	const ids = (doc: StoryboardDoc) => doc.frames[0].elements.map((e) => e.id);

	it('stores geometry to a tenth of a pixel, and keeps already tidy elements as they are', () => {
		const doc = docWith(el('a'));
		const raw = { ...el('b'), x: 113.0000037273378, w: 558.0000223640268, rotation: -6.04 };
		const added = addElements(doc, 'f1', [raw]).frames[0].elements[1];
		expect(added).toMatchObject({ x: 113, w: 558, rotation: -6 });
		const line: FrameElement = { id: 'l', type: 'line', points: [[1.04, 2.26], [3, 4]], stroke: '#fff', strokeWidth: 2 };
		expect((addElements(doc, 'f1', [line]).frames[0].elements[1] as { points: unknown }).points).toEqual([[1, 2.3], [3, 4]]);
		const tidy = el('c');
		expect(addElements(doc, 'f1', [tidy]).frames[0].elements[1]).toBe(tidy);
		expect(replaceElements(doc, 'f1', new Map([['a', { ...el('a'), y: 9.99999 }]])).frames[0].elements[0]).toMatchObject({ y: 10 });
	});

	it('adds, patches and removes immutably', () => {
		const doc = docWith(el('a'));
		const added = addElements(doc, 'f1', [el('b')]);
		expect(ids(added)).toEqual(['a', 'b']);
		const patched = patchElements(added, 'f1', new Map([['b', { x: 5, label: 'coin' }]]));
		expect(patched.frames[0].elements[1]).toMatchObject({ x: 5, label: 'coin' });
		expect(patched.frames[0].elements[0]).toBe(added.frames[0].elements[0]);
		const cleared = patchElements(patched, 'f1', new Map([['b', { label: undefined }]]));
		expect('label' in cleared.frames[0].elements[1]).toBe(false);
		expect(patchElements(patched, 'f1', new Map([['b', { x: 5 }]]))).toBe(patched);
		expect(ids(removeElements(patched, 'f1', new Set(['a'])))).toEqual(['b']);
		expect(ids(doc)).toEqual(['a']);
	});

	it('reorders a step forward or back, keeping selected runs together', () => {
		const doc = docWith(el('a'), el('b'), el('c'));
		expect(ids(reorderElements(doc, 'f1', new Set(['a']), 1))).toEqual(['b', 'a', 'c']);
		expect(ids(reorderElements(doc, 'f1', new Set(['c']), -1))).toEqual(['a', 'c', 'b']);
		expect(ids(reorderElements(doc, 'f1', new Set(['b', 'c']), 1))).toEqual(['a', 'b', 'c']);
		expect(reorderElements(doc, 'f1', new Set(['c']), 1)).toBe(doc);
	});

	it('keeps ids when pasting into another frame and makes new ones within the same frame', () => {
		const copied = [el('a'), el('b')];
		expect(elementsForPaste(copied, new Set(['x']), false).map((e) => e.id)).toEqual(['a', 'b']);
		const same = elementsForPaste(copied, new Set(['a', 'b']), true);
		expect(same.map((e) => e.id).some((id) => id === 'a' || id === 'b')).toBe(false);
		// Into another frame that already has one of the ids: only that one changes
		const mixed = elementsForPaste(copied, new Set(['a']), false);
		expect(mixed[0].id).not.toBe('a');
		expect(mixed[1].id).toBe('b');
	});
});

describe('frame patches and copies at the song edge', () => {
	it('removes keys patched to undefined (span and group)', () => {
		let doc = emptyStoryboard();
		doc = addFrame(doc, { ...createFrame({ time: 1, canvasX: 0, canvasY: 0 }), id: 'f1', group: 'shot 3', endTime: 2 });
		const next = updateFrame(doc, 'f1', { group: undefined, endTime: undefined });
		expect('group' in next.frames[0]).toBe(false);
		expect('endTime' in next.frames[0]).toBe(false);
	});

	it('cuts a copied span at the end of the song, and drops it if nothing is left', () => {
		let doc = emptyStoryboard();
		doc = addFrame(doc, { ...createFrame({ time: 20, canvasX: 0, canvasY: 0 }), id: 'f1', endTime: 25 });
		const cut = duplicateFrame(doc, 'f1', { time: 28, canvasX: 0, canvasY: 0 }, 30);
		expect(cut.doc.frames.find((f) => f.id === cut.id)!.endTime).toBe(30);
		const dropped = duplicateFrame(doc, 'f1', { time: 30, canvasX: 0, canvasY: 0 }, 30);
		expect('endTime' in dropped.doc.frames.find((f) => f.id === dropped.id)!).toBe(false);
	});
});
