import { memo, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Search } from 'lucide-react';
import { useWaveformContext } from '@contexts/objects/WaveformContextObject';
import { useAudioActions } from '@contexts/objects/AudioContextObject';
import { currentTimeStore, durationStore, trimStore } from '@components/AudioControls/state';
import { timeAxisOf } from '@components/WaveformPlayer/hooks/frameCanvas';
import { axisToTime, formatFrameTime } from '@/features/storyboard/canvas/layout';
import { FrameSvg } from '@/features/storyboard/render/FrameSvg';
import { useFrameRender } from '@/features/storyboard/render/useFrameRender';
import type { BoardFormat, Frame } from '@/features/storyboard/types';
import { getColorCode } from '@utils/colorUtils';
import { activeItemAt, buildIndex, type IndexItem } from './searchIndex';

// Index rail (SPEC §6.1): the trimmed song along the canvas edge, with note dots, frame ticks (spans as bars), the
// part of the canvas in view and the playhead. Hover (or press and hold) previews; click jumps; dragging the
// window pans; a click elsewhere on the rail (the window included) seeks. It never edits.

const HOLD_MS = 400;
const PREVIEW_W = 200;
/** A vertical preview's height is at most about this (header + a 16:9 picture); used to keep it inside the rail */
const PREVIEW_H = 150;
/** Along the rail, a mark answers to this much around its start; spans are drawn but not clickable */
const MARK_HIT = 12;
const DRAG_START_PX = 3;
const TOUCH_MIN = 24;

type Range = { start: number; end: number };
const fraction = (t: number, r: Range) => Math.min(1, Math.max(0, (t - r.start) / (r.end - r.start)));

export const IndexRail = memo(function IndexRail({ onOpenFind }: { onOpenFind: () => void }) {
	const { notes, frames, board, orientation = 'vertical', transform, setTransform, setIsFollowingPlayhead, canvasRef, jumpTo } = useWaveformContext();
	const { seekToTime } = useAudioActions();
	const duration = useSyncExternalStore(durationStore.subscribe, durationStore.getSnapshot);
	const [trimStart, trimEnd] = useSyncExternalStore(trimStore.subscribe, trimStore.getSnapshot);
	const range = useMemo<Range>(() => ({ start: trimStart, end: trimEnd > 0 ? trimEnd : duration }), [trimStart, trimEnd, duration]);
	const horizontal = orientation === 'horizontal';
	// Only what lies in the song range in use (a span reaching into it counts)
	const items = useMemo(
		() => buildIndex(notes, frames, board).filter((i) => (i.endTime ?? i.time) >= range.start && i.time <= range.end),
		[notes, frames, board, range]
	);

	// Rail length and canvas size, kept current
	const stripRef = useRef<HTMLDivElement>(null);
	const [length, setLength] = useState(0);
	const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
	const hasRange = range.end > range.start;
	useEffect(() => {
		const strip = stripRef.current;
		const canvas = canvasRef.current;
		if (!strip || !canvas) return;
		const measure = () => {
			const s = strip.getBoundingClientRect();
			setLength(horizontal ? s.width : s.height);
			const c = canvas.getBoundingClientRect();
			setCanvasSize({ width: c.width, height: c.height });
		};
		measure();
		const ro = new ResizeObserver(measure);
		ro.observe(strip);
		ro.observe(canvas);
		return () => ro.disconnect();
	}, [canvasRef, horizontal, hasRange]);

	// The canvas in view, as a time range
	const axis = useMemo(() => (duration > 0 && canvasSize.width > 0 ? timeAxisOf(canvasSize, duration, orientation) : null), [canvasSize, duration, orientation]);
	const view = useMemo<Range | null>(() => {
		if (!axis) return null;
		const s = transform.scale;
		return horizontal
			? { start: axisToTime((-canvasSize.width / 2 - transform.offsetX) / s, axis), end: axisToTime((canvasSize.width / 2 - transform.offsetX) / s, axis) }
			: { start: axisToTime(-transform.offsetY / s, axis), end: axisToTime((canvasSize.height - transform.offsetY) / s, axis) };
	}, [transform, canvasSize, axis, horizontal]);

	// Rail position (px from the rail's start) ↔ song time
	const timeAtPx = useCallback((px: number) => range.start + (length > 0 ? px / length : 0) * (range.end - range.start), [range, length]);
	const pointerPx = (e: { clientX: number; clientY: number }) => {
		const r = stripRef.current!.getBoundingClientRect();
		return horizontal ? e.clientX - r.left : e.clientY - r.top;
	};

	// Drag the window to pan the canvas along time; a press that doesn't move seeks, like the rest of the rail
	const windowDrag = useRef<{ startPx: number; px: number; moved: boolean } | null>(null);
	const onWindowDown = (e: React.PointerEvent) => {
		e.stopPropagation();
		(e.currentTarget as Element).setPointerCapture?.(e.pointerId);
		const px = pointerPx(e);
		windowDrag.current = { startPx: px, px, moved: false };
	};
	const onWindowMove = (e: React.PointerEvent) => {
		const drag = windowDrag.current;
		if (!drag || !axis || length <= 0) return;
		const px = pointerPx(e);
		if (!drag.moved && Math.abs(px - drag.startPx) < DRAG_START_PX) return;
		if (!drag.moved) setIsFollowingPlayhead(false);
		drag.moved = true;
		const dt = ((px - drag.px) / length) * (range.end - range.start);
		drag.px = px;
		const dWorld = (dt / axis.duration) * axis.length;
		setTransform((prev) => (horizontal ? { ...prev, offsetX: prev.offsetX - dWorld * prev.scale } : { ...prev, offsetY: prev.offsetY - dWorld * prev.scale }));
	};
	const onWindowUp = (e: React.PointerEvent) => {
		const drag = windowDrag.current;
		windowDrag.current = null;
		if (drag && !drag.moved) seekToTime(timeAtPx(pointerPx(e)));
	};
	const onWindowCancel = () => {
		windowDrag.current = null;
	};

	// The hovered (or held) mark; follows the item's latest state and goes when the item does
	const [previewKey, setPreviewKey] = useState<string | null>(null);
	const preview = previewKey ? items.find((i) => `${i.kind}-${i.id}` === previewKey) : undefined;
	const onPreview = useCallback((item: IndexItem | null) => setPreviewKey(item ? `${item.kind}-${item.id}` : null), []);
	const previewFrame = preview?.kind === 'frame' ? frames.find((f) => f.id === preview.id) : undefined;

	// Nothing to show without a song range (no audio loaded and no saved trim); Find still works
	if (!hasRange) return null;

	const along = (t: number) => fraction(t, range) * length;
	const windowSize = view ? Math.max(4, along(view.end) - along(view.start)) : 0;
	const windowBox = { start: view ? along(view.start) : 0, size: windowSize, pad: Math.max(0, (TOUCH_MIN - windowSize) / 2) };
	const posStyle = (start: number, size: number) => (horizontal ? { left: start, width: size } : { top: start, height: size });

	return (
		<div
			data-testid="index-rail"
			data-prevent-erase
			onContextMenu={(e) => e.preventDefault()}
			className={`absolute z-20 flex select-none touch-none ${horizontal ? 'left-20 right-4 bottom-2 h-6 flex-row items-center' : 'right-1 top-14 bottom-3 w-6 flex-col items-center'}`}
		>
			<button
				type="button"
				onClick={onOpenFind}
				aria-label="Find"
				title="Find (/)"
				className="h-6 w-6 shrink-0 grid place-items-center rounded-md text-neutral-500 hover:text-neutral-200 hover:bg-neutral-800/60 cursor-pointer"
			>
				<Search className="w-3.5 h-3.5" />
			</button>
			{/* Hit area 24 px across; the drawn strip is 8 px */}
			<div
				ref={stripRef}
				data-testid="rail-strip"
				className={`relative flex-1 ${horizontal ? 'h-6 mx-1' : 'w-6 my-1'} cursor-pointer`}
				onClick={(e) => {
					if (e.target === e.currentTarget && length > 0) seekToTime(timeAtPx(pointerPx(e)));
				}}
			>
				<div className={`pointer-events-none absolute rounded-full bg-neutral-700/70 ${horizontal ? 'inset-x-0 top-2 h-2' : 'inset-y-0 left-2 w-2'}`} />
				{length > 0 ? <Spans items={items} range={range} length={length} horizontal={horizontal} /> : null}
				{view && length > 0 ? (
					<div
						data-testid="rail-window"
						onPointerDown={onWindowDown}
						onPointerMove={onWindowMove}
						onPointerUp={onWindowUp}
						onPointerCancel={onWindowCancel}
						// Touch area at least 24 px both ways (across: the whole rail); the drawn window keeps its true size
						className={`absolute cursor-grab ${horizontal ? 'inset-y-0' : 'inset-x-0'}`}
						style={posStyle(windowBox.start - windowBox.pad, windowBox.size + 2 * windowBox.pad)}
					>
						<div
							className={`pointer-events-none absolute rounded-sm bg-neutral-300/15 border border-neutral-400/60 ${horizontal ? 'top-1 h-4' : 'left-1 w-4'}`}
							style={posStyle(windowBox.pad, windowBox.size)}
						/>
					</div>
				) : null}
				{length > 0 ? <Marks items={items} range={range} length={length} horizontal={horizontal} onJump={jumpTo} onPreview={onPreview} /> : null}
				{length > 0 ? <Playhead range={range} length={length} horizontal={horizontal} /> : null}
				{preview && length > 0 ? (
					<Preview item={preview} frame={previewFrame} board={board} horizontal={horizontal} offset={along(preview.time)} railLength={length} />
				) : null}
			</div>
		</div>
	);
});

type MarksProps = {
	items: IndexItem[];
	range: Range;
	length: number;
	horizontal: boolean;
	onJump: (time: number, at?: { x: number; y: number }) => void;
	onPreview: (item: IndexItem | null) => void;
};

/** Span bars, drawn under the window and the marks; not interactive (the rail under them stays usable). */
const Spans = memo(function Spans({ items, range, length, horizontal }: Omit<MarksProps, 'onJump' | 'onPreview'>) {
	return (
		<>
			{items
				.filter((i) => i.endTime !== undefined)
				.map((item) => {
					const a = fraction(item.time, range) * length;
					const b = fraction(item.endTime!, range) * length;
					return (
						<span
							key={item.id}
							data-rail-span={item.id}
							className={`pointer-events-none absolute rounded-[2px] bg-neutral-300/80 ${horizontal ? 'top-[9px] h-1.5' : 'left-[9px] w-1.5'}`}
							style={horizontal ? { left: a, width: Math.max(3, b - a) } : { top: a, height: Math.max(3, b - a) }}
						/>
					);
				})}
		</>
	);
});

/** The marks; re-rendered when the list, the layout or the item active at the playhead changes. */
const Marks = memo(function Marks({ items, range, length, horizontal, onJump, onPreview }: MarksProps) {
	const activeId = useSyncExternalStore(currentTimeStore.subscribe, () => activeItemAt(items, currentTimeStore.getSnapshot())?.id ?? null);
	const hold = useRef<{ timer: number; held: boolean } | null>(null);
	useEffect(() => () => {
		if (hold.current) window.clearTimeout(hold.current.timer);
	}, []);

	return (
		<>
			{items.map((item) => {
				const at = fraction(item.time, range) * length;
				const active = item.id === activeId;
				const box = horizontal ? { left: at - MARK_HIT / 2, width: MARK_HIT } : { top: at - MARK_HIT / 2, height: MARK_HIT };
				return (
					<button
						key={`${item.kind}-${item.id}`}
						type="button"
						data-rail-kind={item.kind}
						data-id={item.id}
						data-time={item.time}
						data-active={active || undefined}
						aria-label={`${item.kind === 'note' ? 'Note' : 'Frame'} at ${formatFrameTime(item.time)}`}
						className={`absolute grid place-items-center cursor-pointer ${horizontal ? 'top-0 h-6' : 'left-0 w-6'}`}
						style={box}
						onPointerEnter={(e) => {
							if (e.pointerType === 'mouse') onPreview(item);
						}}
						onPointerLeave={(e) => {
							if (e.pointerType === 'mouse') onPreview(null);
						}}
						onPointerDown={(e) => {
							e.stopPropagation();
							if (hold.current) window.clearTimeout(hold.current.timer);
							hold.current = null;
							if (e.pointerType === 'mouse') return;
							// Press and hold: preview while held, and no jump on release
							const state = { held: false, timer: 0 };
							state.timer = window.setTimeout(() => {
								state.held = true;
								onPreview(item);
							}, HOLD_MS);
							hold.current = state;
						}}
						onPointerUp={() => {
							if (!hold.current) return;
							window.clearTimeout(hold.current.timer);
							if (hold.current.held) onPreview(null);
						}}
						onPointerCancel={() => {
							if (hold.current) window.clearTimeout(hold.current.timer);
							hold.current = null;
							onPreview(null);
						}}
						// A long press may reach the browser's context menu before the hold timer: that is the hold too
						onContextMenu={(e) => {
							e.preventDefault();
							const state = hold.current;
							if (!state || state.held) return;
							window.clearTimeout(state.timer);
							state.held = true;
							onPreview(item);
						}}
						onClick={() => {
							const held = hold.current?.held;
							hold.current = null;
							if (held) return;
							onJump(item.time, item.at);
						}}
					>
						{item.kind === 'note' ? (
							<span
								className={`block rounded-full ${active ? 'h-3 w-3 ring-2 ring-white/80' : 'h-2 w-2'}`}
								style={{ backgroundColor: getColorCode(item.color ?? 'blue') }}
							/>
						) : (
							<span className={`block rounded-[2px] ${active ? 'bg-white ring-2 ring-white/60' : 'bg-neutral-300'} ${horizontal ? 'h-3 w-[3px]' : 'w-3 h-[3px]'}`} />
						)}
					</button>
				);
			})}
		</>
	);
});

/** Re-renders only when the playhead moves a whole pixel on the rail. */
const Playhead = memo(function Playhead({ range, length, horizontal }: { range: Range; length: number; horizontal: boolean }) {
	const px = useSyncExternalStore(currentTimeStore.subscribe, () => Math.round(fraction(currentTimeStore.getSnapshot(), range) * length));
	return (
		<div
			data-testid="rail-playhead"
			className={`pointer-events-none absolute bg-white/90 ${horizontal ? 'top-0.5 h-5 w-0.5' : 'left-0.5 w-5 h-0.5'}`}
			style={horizontal ? { left: px } : { top: px }}
		/>
	);
});

type PreviewProps = { item: IndexItem; frame: Frame | undefined; board: BoardFormat; horizontal: boolean; offset: number; railLength: number };

/** What a mark stands for: a note's first lines, or a frame's time, title and picture. Kept inside the rail's span. */
const Preview = memo(function Preview({ item, frame, board, horizontal, offset, railLength }: PreviewProps) {
	const { resolveFrame, resolveSymbol, assetUrl } = useFrameRender();
	const clamp = (v: number, size: number) => Math.max(0, Math.min(v, Math.max(0, railLength - size)));
	const place = horizontal ? { left: clamp(offset - PREVIEW_W / 2, PREVIEW_W), bottom: 32 } : { top: clamp(offset - 20, PREVIEW_H), right: 32 };
	return (
		<div
			role="tooltip"
			data-testid="rail-preview"
			className="pointer-events-none absolute z-30 rounded-lg border border-neutral-700 bg-neutral-900/95 p-2 text-xs text-neutral-200 shadow-xl"
			style={{ ...place, width: PREVIEW_W }}
		>
			<div className="flex gap-2 text-neutral-400 tabular-nums">
				<span>{formatFrameTime(item.time)}</span>
				{frame?.title ? <span className="truncate text-neutral-200">{frame.title}</span> : null}
			</div>
			{frame ? (
				<div className="mt-1 overflow-hidden rounded-sm border border-neutral-800">
					<FrameSvg frame={frame} board={board} resolveFrame={resolveFrame} resolveSymbol={resolveSymbol} assetUrl={assetUrl} className="block h-auto w-full" />
				</div>
			) : (
				<p className="mt-1 line-clamp-3 whitespace-pre-line break-words">{item.title}</p>
			)}
		</div>
	);
});
