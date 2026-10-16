import { useCallback, useSyncExternalStore } from 'react';
import { useStoryboardDoc } from '../StoryboardContext';
import { assetObjectUrl, assetStore } from '../assets/assetStore';

/**
 * Lookups for live FrameSvg rendering (editor, strip, onion skin, monitor): frame references, symbols and images.
 * They change identity only when what they resolve changes, so memoized SVGs re-render only then. `resolveFrame`
 * changes with every board edit; FrameSvg ignores that change unless the frame shows other frames.
 */
export function useFrameRender() {
	const storyboard = useStoryboardDoc();
	const { frames, symbols } = storyboard;
	const assetVersion = useSyncExternalStore(assetStore.subscribe, assetStore.getVersion);
	const resolveFrame = useCallback((id: string) => frames.find((f) => f.id === id), [frames]);
	const resolveSymbol = useCallback((id: string) => symbols.find((s) => s.id === id), [symbols]);
	// eslint-disable-next-line react-hooks/exhaustive-deps -- a new resolver when images finish loading
	const assetUrl = useCallback((id: string) => assetObjectUrl(id), [assetVersion]);
	return { resolveFrame, resolveSymbol, assetUrl };
}
