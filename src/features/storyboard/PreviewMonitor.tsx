import { useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { X } from 'lucide-react';
import { currentTimeStore } from '@components/AudioControls/state';
import { useStoryboard } from './StoryboardContext';
import { FrameSvg } from './render/FrameSvg';
import { useFrameRender } from './render/useFrameRender';
import { activeFrameAt, framesByTime } from './timeline';
import { frameTimeLabel } from './canvas/layout';

type Corner = 'tl' | 'tr' | 'bl' | 'br';

const DRAG_THRESHOLD_PX = 4;
// Clear of the title bar, the dock, the index rail (right edge, or above the playback bar) and the playback bar
const CORNER_CLASS: Record<Corner, string> = {
	tl: 'top-14 left-24',
	tr: 'top-28 right-10',
	bl: 'bottom-24 left-24',
	br: 'bottom-24 right-10',
};

/**
 * Floating preview of the frame on screen at the playhead (the latest frame with time ≤ playhead). It follows
 * playback, so the board can be watched as an animatic. Drag it by its header to any corner.
 */
export function PreviewMonitor({ onClose }: { onClose: () => void }) {
	const { storyboard } = useStoryboard();
	const ordered = useMemo(() => framesByTime(storyboard.frames), [storyboard.frames]);
	// Re-renders only when the active frame changes, not on every playback tick
	const activeId = useSyncExternalStore(currentTimeStore.subscribe, () => activeFrameAt(ordered, currentTimeStore.getSnapshot())?.id ?? null);
	const frame = activeId ? ordered.find((f) => f.id === activeId) : undefined;
	const lookups = useFrameRender();
	const [corner, setCorner] = useState<Corner>('br');
	const [drag, setDrag] = useState<{ dx: number; dy: number } | null>(null);
	const startRef = useRef<{ x: number; y: number } | null>(null);
	const { width, height } = storyboard.board;

	const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
		if ((e.target as HTMLElement).closest('button')) return;
		e.currentTarget.setPointerCapture(e.pointerId);
		startRef.current = { x: e.clientX, y: e.clientY };
		setDrag({ dx: 0, dy: 0 });
	};
	const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
		const s = startRef.current;
		if (s) setDrag({ dx: e.clientX - s.x, dy: e.clientY - s.y });
	};
	const onPointerUp = (e: React.PointerEvent<HTMLDivElement>, cancelled = false) => {
		const s = startRef.current;
		if (!s) return;
		startRef.current = null;
		setDrag(null);
		if (cancelled || Math.hypot(e.clientX - s.x, e.clientY - s.y) < DRAG_THRESHOLD_PX) return;
		// Snap to the corner of the screen quadrant where the monitor's centre was dropped
		const r = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
		const left = r.left + r.width / 2 < window.innerWidth / 2;
		const top = r.top + r.height / 2 < window.innerHeight / 2;
		setCorner(`${top ? 't' : 'b'}${left ? 'l' : 'r'}` as Corner);
	};

	return (
		<div
			className={`fixed z-40 ${CORNER_CLASS[corner]} rounded-xl border border-neutral-700/80 bg-neutral-900/95 shadow-xl overflow-hidden select-none`}
			style={{ width: 'min(280px, calc(100vw - 7rem))', transform: drag ? `translate(${drag.dx}px, ${drag.dy}px)` : undefined }}
			data-testid="preview-monitor"
			data-frame-id={frame?.id ?? ''}
			data-corner={corner}
			data-prevent-erase
		>
			<div
				className="flex items-center gap-2 px-2.5 py-1.5 text-xs text-neutral-400 cursor-grab active:cursor-grabbing touch-none"
				onPointerDown={onPointerDown}
				onPointerMove={onPointerMove}
				onPointerUp={(e) => onPointerUp(e)}
				onPointerCancel={(e) => onPointerUp(e, true)}
			>
				<span className="font-medium text-neutral-300">Preview</span>
				<span className="truncate">{frame ? `${frameTimeLabel(frame)}${frame.title ? ` · ${frame.title}` : ''}` : ''}</span>
				<button type="button" onClick={onClose} className="ml-auto p-0.5 rounded hover:bg-neutral-800 hover:text-white cursor-pointer" aria-label="Close preview" title="Close preview">
					<X className="w-3.5 h-3.5" />
				</button>
			</div>
			<div style={{ aspectRatio: `${width} / ${height}` }} className="bg-neutral-950">
				{frame ? (
					<FrameSvg frame={frame} board={storyboard.board} {...lookups} className="block w-full h-full" />
				) : (
					<div className="w-full h-full grid place-items-center text-xs text-neutral-500">No frame yet at the playhead</div>
				)}
			</div>
		</div>
	);
}
