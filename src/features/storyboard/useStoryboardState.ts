import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { history } from '@utils/history';
import { addFrame, createFrame, duplicateFrame, emptyStoryboard, removeFrames, updateFrame, type FramePatch } from './model';
import { parseStoryboard } from './storage';
import type { StoryboardDoc } from './types';

/**
 * Storyboard state and actions (mirrors useNotesState). Every action updates `storyboardRef` synchronously and
 * pushes one whole-doc history entry, so undo/redo and rapid successive actions never see a stale doc.
 */
export function useStoryboardState() {
	const [storyboard, setStoryboardState] = useState<StoryboardDoc>(emptyStoryboard);
	const storyboardRef = useRef(storyboard);
	// The doc as loaded and its status: 'idle' before a project loads, 'unreadable' if the stored value could not
	// be read. Only a 'loaded' board is ever saved, so an unreadable stored value is never overwritten.
	const [loaded, setLoaded] = useState<{ doc: StoryboardDoc; status: 'idle' | 'loaded' | 'unreadable' }>(() => ({
		doc: storyboard,
		status: 'idle',
	}));

	const setStoryboard = useCallback((doc: StoryboardDoc) => {
		storyboardRef.current = doc;
		setStoryboardState(doc);
	}, []);

	// Live edits (drags): state updates on every move from the start snapshot, one history entry at the end.
	// `onAbort` says what an interrupted edit does: a card drag keeps what was dragged ('commit'); a select-move
	// goes back ('revert'), because its strokes only move on release.
	const liveRef = useRef<{ start: StoryboardDoc; onAbort: 'commit' | 'revert'; label: string; token: number } | null>(null);
	const tokenRef = useRef(0);
	const endLiveEdit = useCallback((label?: string) => {
		const live = liveRef.current;
		liveRef.current = null;
		if (live) history.pushStoryboard(live.start, storyboardRef.current, label ?? live.label);
	}, []);
	const cancelLiveEdit = useCallback(() => {
		const live = liveRef.current;
		liveRef.current = null;
		if (live) setStoryboard(live.start);
	}, [setStoryboard]);
	/** Ends an open live edit before anything else changes the board (another action, undo/redo, a tool switch). */
	const abortLiveEdit = useCallback(() => {
		if (liveRef.current?.onAbort === 'revert') cancelLiveEdit();
		else endLiveEdit();
	}, [cancelLiveEdit, endLiveEdit]);
	/** Starts a live edit (settling any open one first). The token tells a caller whether its edit is still open. */
	const beginLiveEdit = useCallback(
		(onAbort: 'commit' | 'revert' = 'commit', label = 'MoveFrame') => {
			abortLiveEdit();
			tokenRef.current += 1;
			liveRef.current = { start: storyboardRef.current, onAbort, label, token: tokenRef.current };
			return tokenRef.current;
		},
		[abortLiveEdit]
	);
	const isLiveEditOpen = useCallback((token: number) => liveRef.current?.token === token, []);
	const liveUpdate = useCallback(
		(update: (doc: StoryboardDoc) => StoryboardDoc) => {
			if (!liveRef.current) return;
			setStoryboard(update(liveRef.current.start));
		},
		[setStoryboard]
	);

	useEffect(() => {
		history.registerStoryboardAccess(setStoryboard, abortLiveEdit);
	}, [setStoryboard, abortLiveEdit]);

	/**
	 * Replaces the board with a stored value (`undefined` = none stored, an empty board). Not an undo step; the
	 * history is cleared because its snapshots belong to the state being replaced.
	 */
	const loadStoryboard = useCallback(
		(raw: string | undefined) => {
			const { doc, readable } = parseStoryboard(raw);
			if (!readable) console.error('Storyboard data could not be read; it will not be overwritten.');
			// A drag left open belongs to the board being replaced: settling it later would write that board back
			liveRef.current = null;
			setStoryboard(doc);
			setLoaded({ doc, status: readable ? 'loaded' : 'unreadable' });
			history.clear();
		},
		[setStoryboard]
	);

	/** An empty board that is not saved anywhere until a project loads. */
	const resetStoryboard = useCallback(() => {
		const doc = emptyStoryboard();
		liveRef.current = null;
		setStoryboard(doc);
		setLoaded({ doc, status: 'idle' });
	}, [setStoryboard]);

	const commit = useCallback(
		(next: StoryboardDoc, label: string) => {
			abortLiveEdit();
			const prev = storyboardRef.current;
			if (next === prev) return;
			setStoryboard(next);
			history.pushStoryboard(prev, next, label);
		},
		[setStoryboard, abortLiveEdit]
	);

	const handleAddFrame = useCallback(
		(time: number, canvasX: number, canvasY: number) => {
			const frame = createFrame({ time, canvasX, canvasY });
			commit(addFrame(storyboardRef.current, frame), 'AddFrame');
			return frame.id;
		},
		[commit]
	);

	const handleUpdateFrame = useCallback(
		(id: string, patch: FramePatch, label = 'UpdateFrame') => {
			commit(updateFrame(storyboardRef.current, id, patch), label);
		},
		[commit]
	);

	const handleDeleteFrames = useCallback(
		(ids: ReadonlySet<string>) => {
			commit(removeFrames(storyboardRef.current, ids), 'DeleteFrames');
		},
		[commit]
	);

	const handleDuplicateFrame = useCallback(
		(id: string, at: { time: number; canvasX: number; canvasY: number }, maxTime?: number) => {
			const result = duplicateFrame(storyboardRef.current, id, at, maxTime || Infinity);
			commit(result.doc, 'DuplicateFrame');
			return result.id;
		},
		[commit]
	);

	// What autosave writes: the board once a readable one has loaded (even an empty one), else nothing
	const storyboardToSave = loaded.status === 'loaded' ? storyboard : undefined;

	// Stable actions and refs (the storyboard context): they never change, so nothing re-renders for them
	const actions = useMemo(
		() => ({
			storyboardRef,
			loadStoryboard,
			resetStoryboard,
			commit,
			handleAddFrame,
			handleUpdateFrame,
			handleDeleteFrames,
			handleDuplicateFrame,
			beginLiveEdit,
			liveUpdate,
			endLiveEdit,
			cancelLiveEdit,
			abortLiveEdit,
			isLiveEditOpen,
		}),
		[
			loadStoryboard,
			resetStoryboard,
			commit,
			handleAddFrame,
			handleUpdateFrame,
			handleDeleteFrames,
			handleDuplicateFrame,
			beginLiveEdit,
			liveUpdate,
			endLiveEdit,
			cancelLiveEdit,
			abortLiveEdit,
			isLiveEditOpen,
		]
	);

	return {
		storyboard,
		storyboardToSave,
		storyboardStatus: loaded.status,
		changedSinceLoad: storyboard !== loaded.doc,
		actions,
	};
}
