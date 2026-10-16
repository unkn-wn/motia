import { createContext, useContext } from 'react';
import type { useStoryboardState } from './useStoryboardState';
import type { StoryboardDoc } from './types';

// Storyboard actions for the canvas interactions, dock, frame editor and navigation. The value holds only stable
// actions and refs (plus the open project and frame), so a board edit — every move of a drag — doesn't re-render
// its consumers; read the doc itself through `useStoryboardDoc`, or `storyboardRef` inside handlers.
// The canvas renderer and hit tests get `frames`/`board` through WaveformPlayer props instead, so the
// WaveformPlayer context stays the single source for what is drawn.
export type StoryboardContextValue = ReturnType<typeof useStoryboardState>['actions'] & {
	/** The open project (images are stored per project on this device). */
	projectId: string | null;
	editingFrameId: string | null;
	openFrameEditor: (id: string) => void;
	closeFrameEditor: () => void;
	/** Where a new frame card for `time` goes on the main canvas (beside the waveform). */
	placeCard: (time: number) => { canvasX: number; canvasY: number };
};

export const StoryboardContext = createContext<StoryboardContextValue | null>(null);
export const StoryboardDocContext = createContext<StoryboardDoc | null>(null);

export function useStoryboard(): StoryboardContextValue {
	const ctx = useContext(StoryboardContext);
	if (!ctx) throw new Error('useStoryboard must be used within a StoryboardContext provider');
	return ctx;
}

/** The current board; re-renders the caller on every change. */
export function useStoryboardDoc(): StoryboardDoc {
	const doc = useContext(StoryboardDocContext);
	if (!doc) throw new Error('useStoryboardDoc must be used within a StoryboardDocContext provider');
	return doc;
}
