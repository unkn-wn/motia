import { beforeEach, describe, expect, it } from 'vitest';
import { HistoryManager } from './history';
import { addFrame, createFrame, emptyStoryboard, removeFrames, updateFrame } from '@/features/storyboard/model';
import type { StoryboardDoc } from '@/features/storyboard/types';
import type { Note } from '@types';

describe('history: storyboard entries', () => {
	let h: HistoryManager;
	let doc: StoryboardDoc;
	let notes: Note[];
	const set = (d: StoryboardDoc) => {
		doc = d;
	};
	// Mirrors useStoryboardState.commit: update state synchronously, then record the step
	const commit = (next: StoryboardDoc, label = 'Test') => {
		const prev = doc;
		set(next);
		h.pushStoryboard(prev, next, label);
	};

	beforeEach(() => {
		h = new HistoryManager();
		doc = emptyStoryboard();
		notes = [];
		h.registerStoryboardAccess(set);
		h.registerNotesAccess(
			() => notes,
			(n) => {
				notes = n;
			}
		);
		h.setProject('A');
	});

	it('undoes and redoes add, update and delete', () => {
		const frame = { ...createFrame({ time: 1, canvasX: 0, canvasY: 0 }), id: 'f1' };
		commit(addFrame(doc, frame));
		const added = doc;
		commit(updateFrame(doc, 'f1', { time: 2 }));
		const updated = doc;
		commit(removeFrames(doc, new Set(['f1'])));
		expect(doc.frames).toHaveLength(0);

		h.undo();
		expect(doc).toBe(updated);
		h.undo();
		expect(doc).toBe(added);
		expect(doc.frames[0].time).toBe(1);
		h.undo();
		expect(doc.frames).toHaveLength(0);
		expect(h.canUndo()).toBe(false);

		h.redo();
		h.redo();
		expect(doc).toBe(updated);
		h.redo();
		expect(doc.frames).toHaveLength(0);
	});

	it('records nothing for a no-op', () => {
		commit(doc);
		expect(h.canUndo()).toBe(false);
	});

	it('does not undo across projects', () => {
		commit(addFrame(doc, createFrame({ time: 1, canvasX: 0, canvasY: 0 })));
		h.setProject('B');
		const boardB = emptyStoryboard();
		set(boardB);
		expect(h.canUndo()).toBe(false);
		h.undo();
		expect(doc).toBe(boardB);
	});

	it('ignores an entry tagged with another project', () => {
		commit(addFrame(doc, createFrame({ time: 1, canvasX: 0, canvasY: 0 })));
		const after = doc;
		// An entry recorded for project A must do nothing once B is current, even if replayed
		const entry = (h as unknown as { stack: Array<{ undo: () => void }> }).stack[0];
		h.setProject('B');
		entry.undo();
		expect(doc).toBe(after);
	});

	it('makes one undo step of a batch (storyboard + notes)', () => {
		const note: Note = { id: 'n1', time: 0, canvasX: 0, canvasY: 0, content: '', color: 'blue', createdAt: new Date(0) };
		const before = doc;
		h.batch('MoveSelection', () => {
			commit(addFrame(doc, createFrame({ time: 1, canvasX: 0, canvasY: 0 })));
			notes = [note];
			h.pushAddNote(note);
		});
		expect(doc.frames).toHaveLength(1);
		h.undo();
		expect(doc).toBe(before);
		expect(notes).toHaveLength(0);
		expect(h.canUndo()).toBe(false);
		h.redo();
		expect(doc.frames).toHaveLength(1);
		expect(notes).toHaveLength(1);
	});

	it('keeps already-applied batch steps undoable when the batch throws', () => {
		const before = doc;
		expect(() =>
			h.batch('Broken', () => {
				commit(addFrame(doc, createFrame({ time: 1, canvasX: 0, canvasY: 0 })));
				throw new Error('boom');
			})
		).toThrow('boom');
		expect(doc.frames).toHaveLength(1);
		h.undo();
		expect(doc).toBe(before);
	});

	it('settles an open storyboard edit before undo and redo', () => {
		const calls: string[] = [];
		h.registerStoryboardAccess(set, () => calls.push('settle'));
		commit(addFrame(doc, createFrame({ time: 1, canvasX: 0, canvasY: 0 })));
		h.undo();
		h.redo();
		expect(calls).toEqual(['settle', 'settle']);
	});
});
