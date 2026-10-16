import { useEffect, type RefObject } from 'react';
import type { Note } from '@types';
import type { WaveformPlayerRef } from '@components/WaveformPlayer';
import { currentTimeStore, durationStore } from '@components/AudioControls/state';
import type { StoryboardDoc } from '@/features/storyboard/types';

// State for browser tests, on `window.__motiaTest`: read-only views, plus a way to create and delete
// frames before the canvas UI for them exists. Only active in emulator test mode (`vite --mode e2e`); in a normal
// build the flag is undefined and these are no-ops.
const enabled = import.meta.env.VITE_FIREBASE_EMULATOR === '1';

type Hooks = Record<string, unknown>;
const hooks = (): Hooks => {
	const w = window as unknown as { __motiaTest?: Hooks };
	w.__motiaTest ??= {};
	return w.__motiaTest;
};

type StoryboardHooks = {
	storyboard: StoryboardDoc;
	storyboardStatus: 'idle' | 'loaded' | 'unreadable';
	actions: {
		handleAddFrame: (time: number, canvasX: number, canvasY: number) => string;
		handleDeleteFrames: (ids: ReadonlySet<string>) => void;
	};
};

export function useTestHooks(
	playerRef: RefObject<WaveformPlayerRef | null>,
	notes: Note[],
	sb: StoryboardHooks,
	editor: { editingFrameId: string | null; openFrameEditor: (id: string) => void; closeFrameEditor: () => void }
): void {
	useEffect(() => {
		if (!enabled) return;
		const h = hooks();
		h.transform = () => playerRef.current?.getCanvasTransform() ?? null;
		h.time = () => ({ current: currentTimeStore.getSnapshot(), duration: durationStore.getSnapshot() });
		return () => {
			delete h.transform;
			delete h.time;
		};
	}, [playerRef]);

	useEffect(() => {
		if (!enabled) return;
		const h = hooks();
		h.notes = notes;
		return () => {
			delete h.notes;
		};
	}, [notes]);

	const {
		storyboard,
		storyboardStatus,
		actions: { handleAddFrame, handleDeleteFrames },
	} = sb;
	useEffect(() => {
		if (!enabled) return;
		const h = hooks();
		h.storyboard = storyboard;
		h.storyboardStatus = storyboardStatus;
		h.addFrame = handleAddFrame;
		h.deleteFrames = (ids: string[]) => handleDeleteFrames(new Set(ids));
		return () => {
			delete h.storyboard;
			delete h.storyboardStatus;
			delete h.addFrame;
			delete h.deleteFrames;
		};
	}, [storyboard, storyboardStatus, handleAddFrame, handleDeleteFrames]);

	const { editingFrameId, openFrameEditor, closeFrameEditor } = editor;
	useEffect(() => {
		if (!enabled) return;
		const h = hooks();
		h.editingFrameId = editingFrameId;
		h.openFrameEditor = openFrameEditor;
		h.closeFrameEditor = closeFrameEditor;
		return () => {
			delete h.editingFrameId;
			delete h.openFrameEditor;
			delete h.closeFrameEditor;
		};
	}, [editingFrameId, openFrameEditor, closeFrameEditor]);
}
