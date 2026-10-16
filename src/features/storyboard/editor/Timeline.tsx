import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useAudioActions } from '@contexts/objects/AudioContextObject';
import { currentTimeStore, durationStore, trimStore, waveformDataStore } from '@components/AudioControls/state';
import { formatFrameTime } from '../canvas/layout';
import type { Frame } from '../types';

// The frame editor's timeline: the song around the playhead, which stays in the middle (it follows playback, like
// a video editor's centred playhead). A lane on top shows each frame from its start to its end; a frame without an
// end is shown faintly until the next frame starts (it stays on screen until then). The waveform below shows where
// frames start and, for this frame, its span. Drawn on a canvas from the time store, so playback costs no re-renders.
// Only the song's range in use (its trim) is drawn.
//
// Click: seek there. Drag (mouse or finger): scrub — the song moves under the playhead. Wheel: scrub; Alt/Ctrl +
// wheel (or a trackpad pinch): zoom. Click a frame in the lane: open it (this frame: seek to its start).

const LANE_H = 16;
const GAP = 3;
const DEFAULT_SPAN_S = 8;
const MIN_SPAN_S = 1;
const DRAG_PX = 3;
/** How close (px) to a frame's start line counts as on it. */
const LINE_HIT_PX = 5;

const C = {
	bar: '#525252',
	barOut: '#262626',
	lane: 'rgba(82,82,82,0.45)',
	laneHover: 'rgba(163,163,163,0.45)',
	laneCurrent: 'rgba(59,130,246,0.55)',
	/** A frame without an end: on screen until the next one */
	laneOpen: 'rgba(82,82,82,0.2)',
	laneOpenCurrent: 'rgba(59,130,246,0.2)',
	line: 'rgba(163,163,163,0.7)',
	lineHover: '#e5e5e5',
	current: '#3b82f6',
	currentShade: 'rgba(59,130,246,0.14)',
	label: '#d4d4d4',
	playhead: '#ffffff',
};

/** End of a frame's time on screen: the next frame's start (or the song's end). */
const shownUntil = (frames: Frame[], i: number, duration: number) => frames[i + 1]?.time ?? (duration > 0 ? duration : frames[i].time + 1);
/** A frame's band in the lane: its span, or (no end) its time on screen; `open` for the latter. */
const band = (frames: Frame[], i: number, duration: number) => {
	const f = frames[i];
	return f.endTime !== undefined ? { start: f.time, end: f.endTime, open: false } : { start: f.time, end: shownUntil(frames, i, duration), open: true };
};

type Props = {
	/** All frames in time order */
	frames: Frame[];
	currentId: string;
	hoverId: string | null;
	onHover: (id: string | null) => void;
	onOpen: (id: string) => void;
};

export function Timeline({ frames, currentId, hoverId, onHover, onOpen }: Props) {
	const { seekToTime } = useAudioActions();
	const rootRef = useRef<HTMLDivElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const jumpRef = useRef<HTMLButtonElement>(null);
	const [span, setSpan] = useState(DEFAULT_SPAN_S);
	// What drawing and the handlers read, current without re-rendering
	const live = useRef({ frames, currentId, hoverId, span });
	useLayoutEffect(() => {
		live.current = { frames, currentId, hoverId, span };
	});

	/** Time ↔ x for the current view (the playhead in the middle). */
	const view = useCallback(() => {
		const w = canvasRef.current?.clientWidth ?? 0;
		const { span } = live.current;
		const center = currentTimeStore.getSnapshot();
		const pps = w > 0 ? w / span : 1;
		return { w, pps, center, x: (t: number) => w / 2 + (t - center) * pps, time: (x: number) => center + (x - w / 2) / pps };
	}, []);

	const draw = useCallback(() => {
		const canvas = canvasRef.current;
		const root = rootRef.current;
		if (!canvas || !root) return;
		const w = canvas.clientWidth;
		const h = canvas.clientHeight;
		const dpr = window.devicePixelRatio || 1;
		if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
			canvas.width = Math.max(1, Math.round(w * dpr));
			canvas.height = Math.max(1, Math.round(h * dpr));
		}
		const ctx = canvas.getContext('2d');
		if (!ctx) return;
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		ctx.clearRect(0, 0, w, h);
		const { frames, currentId, hoverId, span } = live.current;
		const { x, center } = view();
		root.dataset.start = String(center - span / 2);
		root.dataset.span = String(span);
		const duration = durationStore.getSnapshot();
		const data = waveformDataStore.getSnapshot();
		const wy = LANE_H + GAP;
		const wh = h - wy;

		// Waveform: one bar per 3 px, anchored to song time so the bars slide with it (not resampled per column),
		// within the song's range in use
		if (duration > 0 && data.length > 0) {
			const [trimStart, trimEnd] = trimStore.getSnapshot();
			const from = Math.max(0, trimStart);
			const to = trimEnd > 0 ? Math.min(duration, trimEnd) : duration;
			const pps = w / span;
			const bin = 3 / pps;
			ctx.fillStyle = C.bar;
			const first = Math.ceil(Math.max(from, center - span / 2 - bin) / bin);
			const last = Math.floor(Math.min(to, center + span / 2 + bin) / bin);
			for (let k = first; k <= last; k++) {
				const t = k * bin;
				const amp = Math.min(1, (data[Math.min(data.length - 1, Math.floor((t / duration) * data.length))] || 0) * 1.8);
				const bar = Math.max(1, amp * (wh - 4));
				ctx.fillRect(x(t), wy + (wh - bar) / 2, 2, bar);
			}
		}

		ctx.font = '10px system-ui, sans-serif';
		ctx.textBaseline = 'middle';
		let current: { a: number; b: number } | null = null;
		frames.forEach((f, i) => {
			const { end, open } = band(frames, i, duration);
			const a = x(f.time);
			const b = x(end);
			const isCurrent = f.id === currentId;
			const isHover = f.id === hoverId;
			if (isCurrent) current = { a, b };
			if (b < 0 || a > w) return;

			// Lane: the frame's span (or, faint, its time on screen), labelled
			ctx.fillStyle = open ? (isCurrent ? C.laneOpenCurrent : isHover ? C.laneHover : C.laneOpen) : isCurrent ? C.laneCurrent : isHover ? C.laneHover : C.lane;
			ctx.beginPath();
			ctx.roundRect(a + 1, 0, Math.max(2, b - a - 2), LANE_H, 3);
			ctx.fill();
			if (b - a > 34) {
				ctx.save();
				ctx.beginPath();
				ctx.rect(a + 1, 0, b - a - 2, LANE_H);
				ctx.clip();
				ctx.fillStyle = C.label;
				ctx.fillText(f.title || formatFrameTime(f.time), Math.max(a, 0) + 5, LANE_H / 2);
				ctx.restore();
			}
			// This frame's span, shaded on the waveform, with its end
			if (isCurrent && !open) {
				ctx.fillStyle = C.currentShade;
				ctx.fillRect(a, wy, b - a, wh);
				ctx.fillStyle = C.current;
				for (let y = wy; y < h; y += 6) ctx.fillRect(b - 1, y, 2, 3);
			}
			// Start line through the waveform
			ctx.fillStyle = isCurrent ? C.current : isHover ? C.lineHover : C.line;
			ctx.fillRect(a - (isCurrent ? 1 : 0.5), wy, isCurrent ? 2 : 1, wh);
		});

		// Playhead, with its time
		ctx.fillStyle = C.playhead;
		ctx.fillRect(Math.round(w / 2) - 0.5, 0, 1, h);
		const label = formatFrameTime(center);
		const lw = ctx.measureText(label).width + 8;
		ctx.fillStyle = 'rgba(10,10,10,0.8)';
		ctx.fillRect(w / 2 + 3, h - 14, lw, 13);
		ctx.fillStyle = C.playhead;
		ctx.fillText(label, w / 2 + 7, h - 7.5);

		// This frame out of view: a chip at that side jumps to it
		const jump = jumpRef.current;
		if (jump) {
			const c = current as { a: number; b: number } | null;
			const side = !c ? null : c.b < 0 ? 'left' : c.a > w ? 'right' : null;
			jump.style.display = side ? '' : 'none';
			if (side) {
				jump.style.left = side === 'left' ? '4px' : '';
				jump.style.right = side === 'right' ? '4px' : '';
				jump.textContent = side === 'left' ? '‹ this frame' : 'this frame ›';
			}
		}
	}, [view]);

	// Redraw on time, song and size changes, and after each render (frames, hover, zoom)
	useLayoutEffect(draw);
	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const ro = new ResizeObserver(draw);
		ro.observe(canvas);
		const unsubscribe = [currentTimeStore.subscribe(draw), durationStore.subscribe(draw), waveformDataStore.subscribe(draw), trimStore.subscribe(draw)];
		return () => {
			ro.disconnect();
			unsubscribe.forEach((u) => u());
		};
	}, [draw]);

	/** The frame under a point: its lane band, or (on the waveform) its start line. */
	const hitTest = useCallback(
		(px: number, py: number): Frame | null => {
			const { frames } = live.current;
			const { x } = view();
			const duration = durationStore.getSnapshot();
			if (py <= LANE_H + GAP) {
				// Bands can overlap (a span past the next frame's start): the later one is drawn on top
				for (let j = frames.length - 1; j >= 0; j--) {
					const { start, end } = band(frames, j, duration);
					if (px >= x(start) && px < Math.max(x(end), x(start) + 4)) return frames[j];
				}
				return null;
			}
			let best: Frame | null = null;
			let bestD = LINE_HIT_PX;
			for (const f of frames) {
				const d = Math.abs(x(f.time) - px);
				if (d <= bestD) {
					best = f;
					bestD = d;
				}
			}
			return best;
		},
		[view]
	);

	// Wheel: scrub; Alt/Ctrl + wheel (and trackpad pinches, which arrive as Ctrl + wheel): zoom. Non-passive, so
	// the page doesn't scroll or zoom instead.
	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const onWheel = (e: WheelEvent) => {
			e.preventDefault();
			const duration = durationStore.getSnapshot();
			if (e.altKey || e.ctrlKey) {
				const max = Math.max(MIN_SPAN_S * 2, duration || DEFAULT_SPAN_S);
				setSpan((s) => Math.max(MIN_SPAN_S, Math.min(max, s * Math.exp(e.deltaY * 0.002))));
				return;
			}
			const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
			const { pps, center } = view();
			seekToTime(Math.max(0, center + d / pps));
		};
		canvas.addEventListener('wheel', onWheel, { passive: false });
		return () => canvas.removeEventListener('wheel', onWheel);
	}, [seekToTime, view]);

	const drag = useRef<{ x0: number; t0: number; moved: boolean; laneId: string | null } | null>(null);
	const local = (e: React.PointerEvent) => {
		const r = e.currentTarget.getBoundingClientRect();
		return { px: e.clientX - r.left, py: e.clientY - r.top };
	};

	return (
		<div ref={rootRef} className="relative" data-testid="strip-waveform">
			<canvas
				ref={canvasRef}
				className="block h-12 w-full touch-none select-none rounded-md bg-neutral-950 cursor-ew-resize"
				onPointerDown={(e) => {
					if (e.button !== 0) return;
					e.currentTarget.setPointerCapture(e.pointerId);
					const { px, py } = local(e);
					drag.current = { x0: px, t0: currentTimeStore.getSnapshot(), moved: false, laneId: py <= LANE_H + GAP ? (hitTest(px, py)?.id ?? null) : null };
				}}
				onPointerMove={(e) => {
					const { px, py } = local(e);
					const d = drag.current;
					if (d) {
						if (!d.moved && Math.abs(px - d.x0) < DRAG_PX) return;
						d.moved = true;
						// The song moves with the pointer, under the playhead
						seekToTime(Math.max(0, d.t0 - (px - d.x0) / view().pps));
						return;
					}
					if (e.pointerType !== 'mouse') return;
					const hit = hitTest(px, py);
					e.currentTarget.style.cursor = hit && py <= LANE_H + GAP ? 'pointer' : '';
					if ((hit?.id ?? null) !== live.current.hoverId) onHover(hit?.id ?? null);
				}}
				onPointerUp={(e) => {
					const d = drag.current;
					drag.current = null;
					if (!d || d.moved) return;
					if (d.laneId) {
						const f = live.current.frames.find((x) => x.id === d.laneId);
						if (d.laneId === live.current.currentId) {
							if (f) seekToTime(f.time);
						} else onOpen(d.laneId);
						return;
					}
					seekToTime(Math.max(0, view().time(local(e).px)));
				}}
				onPointerCancel={() => {
					drag.current = null;
				}}
				onPointerLeave={(e) => {
					if (e.pointerType === 'mouse' && live.current.hoverId) onHover(null);
				}}
			/>
			<button
				ref={jumpRef}
				type="button"
				style={{ display: 'none' }}
				className="absolute top-0 h-4 rounded px-1.5 text-[10px] leading-4 text-blue-200 bg-blue-600/60 hover:bg-blue-600 cursor-pointer"
				onClick={() => {
					const f = live.current.frames.find((x) => x.id === live.current.currentId);
					if (f) seekToTime(f.time);
				}}
			/>
		</div>
	);
}
