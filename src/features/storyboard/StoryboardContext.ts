import { createContext, useContext } from 'react';
import type { useStoryboardState } from './useStoryboardState';

// Storyboard state and actions for the canvas interactions, dock, frame editor and (later) navigation.
// The canvas renderer and hit tests get `frames`/`board` through WaveformPlayer props instead, so the
// WaveformPlayer context stays the single source for what is drawn.
export type StoryboardContextValue = ReturnType<typeof useStoryboardState> & {
	/** The open project (images are stored per project on this device). */
	projectId: string | null;
	editingFrameId: string | null;
	openFrameEditor: (id: string) => void;
	closeFrameEditor: () => void;
	/** Where a new frame card for `time` goes on the main canvas (beside the waveform). */
	placeCard: (time: number) => { canvasX: number; canvasY: number };
};

export const StoryboardContext = createContext<StoryboardContextValue | null>(null);

export function useStoryboard(): StoryboardContextValue {
	const ctx = useContext(StoryboardContext);
	if (!ctx) throw new Error('useStoryboard must be used within a StoryboardContext provider');
	return ctx;
}
