import { describe, expect, it } from 'vitest';
import type { DrawingStroke, Note } from '@types';
import { compressDrawingAdaptive } from '@utils/drawingUtils';
import { buildNotesPayload, planStoryboardWrite, STORYBOARD_HOLD_BYTES } from './notesPayload';

const note: Note = { id: 'n1', time: 64.1, canvasX: 210, canvasY: 6410, content: 'borders tilt here ✓', color: 'blue', createdAt: new Date(0) };
const bytes = (s: string) => new TextEncoder().encode(s).length;

const strokeA: DrawingStroke = { points: [{ x: -300, y: 100 }, { x: -250, y: 140 }], color: '#9ca3af', strokeWidth: 2 };
const strokeB: DrawingStroke = { points: [{ x: 10, y: 10 }, { x: 40, y: 80 }, { x: 90, y: 20 }], color: '#9ca3af', strokeWidth: 2 };
const strokeC: DrawingStroke = { points: [{ x: 500, y: 5 }, { x: 520, y: 9 }], color: '#ff0000', strokeWidth: 4 };
const drawing = (id: string, d: Note['drawing']): Note => ({ ...note, id, content: '', color: 'gray', type: 'drawing', drawing: d });

describe('notes payload', () => {
	it('merges every sketch stroke (compressed array, compressed string, legacy strokes) into one compressed string', () => {
		const notes = [
			note,
			drawing('d1', { compressed: compressDrawingAdaptive([strokeA]).strokes, bounds: { width: 0, height: 0 } }),
			drawing('d2', { compressed: JSON.stringify(compressDrawingAdaptive([strokeB]).strokes), bounds: { width: 0, height: 0 } }),
			drawing('d3', { strokes: [strokeC], bounds: { width: 0, height: 0 } }),
		];
		const base = buildNotesPayload(notes);
		expect(base.compressed).toBe(JSON.stringify(compressDrawingAdaptive([strokeA, strokeB, strokeC]).strokes));
		expect(base.notes.map((n) => n.id)).toEqual(['n1']);
	});

	it('keeps text notes and stores an empty sketch as "[]"', () => {
		const base = buildNotesPayload([note]);
		expect(base.compressed).toBe('[]');
		expect(base.notes[0].content).toBe('borders tilt here ✓');
	});
});

describe('notes payload size budget', () => {
	it('counts notes + sketch + the stored storyboard string as UTF-8 bytes', () => {
		const base = buildNotesPayload([note]);
		const storyboard = JSON.stringify({ version: 1, title: 'é "quoted"' });
		const plan = planStoryboardWrite(base, storyboard);
		expect(plan.baseBytes).toBe(bytes(JSON.stringify(base)));
		expect(plan.bytes).toBe(bytes(JSON.stringify(base)) + bytes(storyboard));
		expect(plan.storyboardHeld).toBe(false);
	});

	it('holds the storyboard above the limit but still reports its size', () => {
		const base = buildNotesPayload([note]);
		const { bytes: size, storyboardHeld } = planStoryboardWrite(base, 'x'.repeat(STORYBOARD_HOLD_BYTES));
		expect(storyboardHeld).toBe(true);
		expect(size).toBeGreaterThan(STORYBOARD_HOLD_BYTES);
	});

	it('never holds when no storyboard is written', () => {
		const base = buildNotesPayload([note]);
		const plan = planStoryboardWrite(base, undefined);
		expect(plan.storyboardHeld).toBe(false);
		expect(plan.bytes).toBe(bytes(JSON.stringify(base)));
	});
});
