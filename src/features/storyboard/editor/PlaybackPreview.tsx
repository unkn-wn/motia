import { useSyncExternalStore } from 'react';
import { currentTimeStore } from '@components/AudioControls/state';
import { FrameSvg } from '../render/FrameSvg';
import { useFrameRender } from '../render/useFrameRender';
import { activeFrameAt } from '../timeline';
import { frameTimeLabel } from '../canvas/layout';
import type { BoardFormat, Frame } from '../types';

/**
 * The frame editor's preview: over the board, the frame on screen at the playhead (as the floating monitor shows
 * it), while the song plays. A press anywhere on it stops the preview.
 */
export function PlaybackPreview({ ordered, board, onStop }: { ordered: Frame[]; board: BoardFormat; onStop: () => void }) {
	// Re-renders only when the frame on screen changes, not on every playback tick
	const activeId = useSyncExternalStore(currentTimeStore.subscribe, () => activeFrameAt(ordered, currentTimeStore.getSnapshot())?.id ?? null);
	const frame = activeId ? ordered.find((f) => f.id === activeId) : undefined;
	const lookups = useFrameRender();
	return (
		<div
			role="button"
			tabIndex={-1}
			aria-label="Stop preview"
			data-testid="playback-preview"
			data-frame-id={frame?.id ?? ''}
			onPointerDown={(e) => {
				e.stopPropagation();
				onStop();
			}}
			className="absolute inset-0 z-30 flex items-center justify-center bg-neutral-950 p-6 cursor-pointer"
			// The frame fits the area whatever its shape: sized from the area's own width and height
			style={{ containerType: 'size' }}
		>
			{frame ? (
				<div className="shadow-2xl ring-1 ring-neutral-700" style={{ width: `min(100cqw, 100cqh * ${board.width / board.height})`, aspectRatio: `${board.width} / ${board.height}` }}>
					<FrameSvg frame={frame} board={board} {...lookups} className="block h-full w-full" />
				</div>
			) : (
				<span className="text-sm text-neutral-500">No frame yet at this time</span>
			)}
			<div className="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 rounded-full bg-neutral-900/90 px-3 py-1 text-xs text-neutral-300">
				Preview{frame ? ` · ${frame.title || frameTimeLabel(frame)}` : ''} · tap or Space to stop
			</div>
		</div>
	);
}
