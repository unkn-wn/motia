import { describe, expect, it } from 'vitest';
import { addFrame, createFrame, emptyStoryboard } from '../model';
import type { Frame, StoryboardDoc } from '../types';
import {
	anchorPoint,
	cardSize,
	defaultCardPosition,
	dragFrame,
	findFrameTarget,
	formatFrameTime,
	frameTimeLabel,
	framesInRect,
	type FrameDrag,
	type TimeAxis,
} from './layout';

const vertical: TimeAxis = { orientation: 'vertical', length: 3000, duration: 30 };
const horizontal: TimeAxis = { orientation: 'horizontal', length: 3000, duration: 30 };
const board = { width: 1920, height: 1080 };

const frame = (id: string, time: number, canvasX: number, canvasY: number, endTime?: number): Frame => ({
	...createFrame({ time, canvasX, canvasY }),
	id,
	...(endTime !== undefined ? { endTime } : {}),
});
const docOf = (...frames: Frame[]): StoryboardDoc => frames.reduce(addFrame, emptyStoryboard());
const dragOf = (f: Frame, kind: FrameDrag['kind']): FrameDrag => ({
	kind,
	id: f.id,
	initialCanvasX: f.canvasX,
	initialCanvasY: f.canvasY,
	initialTime: f.time,
	initialEndTime: f.endTime,
});

describe('frame card layout', () => {
	it('sizes cards 240 wide with the board aspect plus a header', () => {
		expect(cardSize(board)).toEqual({ w: 240, h: 28 + 135, thumbH: 135 });
		expect(cardSize({ width: 1080, height: 1920 }).thumbH).toBeCloseTo(426.67, 1);
	});

	it('puts anchors on the waveform edge facing the frames', () => {
		expect(anchorPoint(15, vertical)).toEqual({ x: -60, y: 1500 });
		expect(anchorPoint(15, horizontal)).toEqual({ x: 1500, y: -60 });
	});

	it('places a new card beside the waveform, centred on its time', () => {
		const { h } = cardSize(board);
		expect(defaultCardPosition(10, [], board, vertical)).toEqual({ canvasX: -60 - 110 - 240, canvasY: 1000 - h / 2 });
		expect(defaultCardPosition(10, [], board, horizontal)).toEqual({ canvasX: 1000 - 120, canvasY: -60 - 60 - h });
	});

	it('stacks a new card past the cards it would overlap', () => {
		const { h } = cardSize(board);
		const a = defaultCardPosition(10, [], board, vertical);
		const first = frame('a', 10, a.canvasX, a.canvasY);
		const b = defaultCardPosition(10.2, [first], board, vertical);
		expect(b.canvasX).toBe(a.canvasX);
		expect(b.canvasY).toBe(a.canvasY + h + 16);
		const hz = defaultCardPosition(10, [], board, horizontal);
		const c = defaultCardPosition(10, [frame('h', 10, hz.canvasX, hz.canvasY)], board, horizontal);
		expect(c.canvasX).toBe(hz.canvasX + 240 + 16);
	});

	it('formats times and ranges', () => {
		expect(formatFrameTime(65.9)).toBe('1:05.9');
		expect(formatFrameTime(59.96)).toBe('1:00.0');
		expect(formatFrameTime(3)).toBe('0:03.0');
		expect(frameTimeLabel({ time: 63, endTime: 65.4 })).toBe('1:03.0 → 1:05.4');
		expect(frameTimeLabel({ time: 63 })).toBe('1:03.0');
	});
});

describe('frame hit testing', () => {
	const f = frame('f1', 10, -410, 900, 12);

	it('finds the card, the anchor dot and the end tick', () => {
		expect(findFrameTarget({ x: -300, y: 950 }, [f], board, vertical, 1)?.kind).toBe('card');
		expect(findFrameTarget({ x: -60, y: 1000 }, [f], board, vertical, 1)?.kind).toBe('anchor');
		expect(findFrameTarget({ x: -55, y: 1205 }, [f], board, vertical, 1)?.kind).toBe('endTick');
		expect(findFrameTarget({ x: 0, y: 500 }, [f], board, vertical, 1)).toBeNull();
	});

	it('uses a screen-space radius for handles', () => {
		// 15 world units away: outside 10 px at scale 1, inside at scale 0.5 (radius 20 world units)
		expect(findFrameTarget({ x: -60, y: 1015 }, [f], board, vertical, 1)).toBeNull();
		expect(findFrameTarget({ x: -60, y: 1015 }, [f], board, vertical, 0.5)?.kind).toBe('anchor');
	});

	it('ignores collapsed cards but keeps anchors grabbable', () => {
		expect(findFrameTarget({ x: -300, y: 950 }, [f], board, vertical, 0.1)).toBeNull();
		expect(findFrameTarget({ x: -60, y: 1000 }, [f], board, vertical, 0.1)?.kind).toBe('anchor');
	});

	it('picks the topmost (last) card', () => {
		const g = frame('f2', 11, -400, 910);
		expect(findFrameTarget({ x: -300, y: 950 }, [f, g], board, vertical, 1)?.frame.id).toBe('f2');
	});

	it('selects cards that intersect a box in any drag direction', () => {
		expect(framesInRect({ x: -200, y: 1000, w: -50, h: -50 }, [f], board)).toEqual(new Set(['f1']));
		expect(framesInRect({ x: 0, y: 0, w: 10, h: 10 }, [f], board).size).toBe(0);
	});
});

describe('frame dragging', () => {
	it('moves a card without changing its time', () => {
		const f = frame('f1', 10, -410, 900);
		const next = dragFrame(docOf(f), dragOf(f, 'card'), 30, -20, vertical, 1).frames[0];
		expect(next).toMatchObject({ canvasX: -380, canvasY: 880, time: 10 });
	});

	it('retimes through the anchor and keeps the span length', () => {
		const f = frame('f1', 10, -410, 900, 12);
		const next = dragFrame(docOf(f), dragOf(f, 'anchor'), 999, 150, vertical, 1).frames[0];
		expect(next.time).toBeCloseTo(11.5, 6);
		expect(next.endTime).toBeCloseTo(13.5, 6);
		expect(next.canvasX).toBe(-410);
		const hz = dragFrame(docOf(f), dragOf(f, 'anchor'), -100, 999, horizontal, 1).frames[0];
		expect(hz.time).toBeCloseTo(9, 6);
	});

	it('clamps a retime to the song, span included', () => {
		const f = frame('f1', 29, -410, 900, 29.5);
		const next = dragFrame(docOf(f), dragOf(f, 'anchor'), 0, 500, vertical, 1).frames[0];
		expect(next.time).toBeCloseTo(29.5, 6);
		expect(next.endTime).toBeCloseTo(30, 6);
		expect(dragFrame(docOf(f), dragOf(f, 'anchor'), 0, -5000, vertical, 1).frames[0].time).toBe(0);
	});

	it('changes the end through the end tick, and clears it when dropped on the start', () => {
		const f = frame('f1', 10, -410, 900, 12);
		expect(dragFrame(docOf(f), dragOf(f, 'endTick'), 0, 100, vertical, 1).frames[0].endTime).toBeCloseTo(13, 6);
		const cleared = dragFrame(docOf(f), dragOf(f, 'endTick'), 0, -198, vertical, 1).frames[0];
		expect('endTime' in cleared).toBe(false);
		// Never before the start
		expect(dragFrame(docOf(f), dragOf(f, 'endTick'), 0, -5000, vertical, 1).frames[0].endTime).toBeUndefined();
	});

	it('does not touch the input doc', () => {
		const f = frame('f1', 10, -410, 900);
		const doc = docOf(f);
		dragFrame(doc, dragOf(f, 'anchor'), 0, 100, vertical, 1);
		expect(doc.frames[0].time).toBe(10);
	});
});
