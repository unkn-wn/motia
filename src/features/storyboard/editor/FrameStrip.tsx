import { useEffect, useRef, useSyncExternalStore } from 'react';
import { Copy, Play, Plus } from 'lucide-react';
import { useAudioActions } from '@contexts/objects/AudioContextObject';
import { currentTimeStore, durationStore, isPlayingStore, waveformDataStore } from '@components/AudioControls/state';
import { FrameSvg } from '../render/FrameSvg';
import { useFrameRender } from '../render/useFrameRender';
import { formatFrameTime } from '../canvas/layout';
import { neighbours } from '../timeline';
import type { BoardFormat, Frame } from '../types';

const NEIGHBOUR_RADIUS = 3;
const RANGE_PADDING_S = 1;
const THUMB_WIDTH = 96;

const action =
	'inline-flex items-center gap-1.5 rounded-full bg-neutral-800/80 hover:bg-neutral-700 border border-neutral-700 px-2.5 py-1 text-xs text-neutral-200 cursor-pointer';

type Props = {
	frame: Frame;
	ordered: Frame[];
	board: BoardFormat;
	onOpen: (id: string) => void;
	onNewFromThis: () => void;
	onDuplicate: () => void;
};

/** Bottom strip of the frame editor: neighbouring frames, the waveform around them, and frame actions. */
export function FrameStrip({ frame, ordered, board, onOpen, onNewFromThis, onDuplicate }: Props) {
	// Stable actions and stores: the strip doesn't re-render on every playback tick
	const { seekToTime, playPause } = useAudioActions();
	const lookups = useFrameRender();
	const duration = useSyncExternalStore(durationStore.subscribe, durationStore.getSnapshot);
	const near = neighbours(ordered, frame.id, NEIGHBOUR_RADIUS);
	const first = near[0] ?? frame;
	const last = near[near.length - 1] ?? frame;
	const start = Math.max(0, first.time - RANGE_PADDING_S);
	const end = Math.min(duration || Infinity, Math.max(last.time, last.endTime ?? 0, frame.endTime ?? 0) + RANGE_PADDING_S);
	const span = Math.max(0.001, end - start);

	const playFromFrame = () => {
		seekToTime(frame.time);
		if (!isPlayingStore.getSnapshot()) playPause();
	};

	return (
		<div className="shrink-0 border-t border-neutral-800 bg-neutral-900 px-3 py-2 space-y-2" data-testid="frame-strip">
			<div className="flex items-end gap-2">
				<div className="flex min-w-0 flex-1 items-end gap-2 overflow-x-auto">
					{near.map((f) => (
						<button
							key={f.id}
							type="button"
							onClick={() => onOpen(f.id)}
							aria-current={f.id === frame.id}
							aria-label={`Frame at ${formatFrameTime(f.time)}${f.title ? `: ${f.title}` : ''}`}
							className={`shrink-0 rounded-md overflow-hidden border cursor-pointer ${f.id === frame.id ? 'border-blue-400 ring-1 ring-blue-400' : 'border-neutral-700 hover:border-neutral-500'}`}
							style={{ width: THUMB_WIDTH }}
						>
							<div style={{ aspectRatio: `${board.width} / ${board.height}` }}>
								<FrameSvg frame={f} board={board} {...lookups} className="block w-full h-full pointer-events-none" />
							</div>
							<div className="px-1 py-0.5 text-[10px] text-neutral-400 tabular-nums bg-neutral-800 text-left truncate">
								{formatFrameTime(f.time)}
								{f.group ? ` · ${f.group}` : ''}
							</div>
						</button>
					))}
				</div>
				<div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
					<button type="button" className={action} onClick={playFromFrame} title="Play from this frame">
						<Play className="w-3.5 h-3.5" /> play from frame
					</button>
					<button type="button" className={action} onClick={onNewFromThis} title="New frame from this one (same objects)">
						<Plus className="w-3.5 h-3.5" /> new frame from this
					</button>
					<button type="button" className={action} onClick={onDuplicate} title="Duplicate this frame">
						<Copy className="w-3.5 h-3.5" /> duplicate
					</button>
				</div>
			</div>
			<RangeWaveform
				start={start}
				span={span}
				duration={duration}
				ticks={near.map((f) => ({ id: f.id, time: f.time, current: f.id === frame.id }))}
				onSeek={seekToTime}
			/>
		</div>
	);
}

function RangeWaveform(props: {
	start: number;
	span: number;
	duration: number;
	ticks: Array<{ id: string; time: number; current: boolean }>;
	onSeek: (t: number) => void;
}) {
	const { start, span, duration, ticks, onSeek } = props;
	const waveformData = useSyncExternalStore(waveformDataStore.subscribe, waveformDataStore.getSnapshot);
	const canvasRef = useRef<HTMLCanvasElement>(null);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const draw = () => {
			const w = canvas.clientWidth;
			const h = canvas.clientHeight;
			const dpr = window.devicePixelRatio || 1;
			canvas.width = Math.max(1, Math.round(w * dpr));
			canvas.height = Math.max(1, Math.round(h * dpr));
			const ctx = canvas.getContext('2d');
			if (!ctx) return;
			ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
			ctx.clearRect(0, 0, w, h);
			if (duration <= 0 || waveformData.length === 0) return;
			ctx.fillStyle = '#404040';
			for (let x = 0; x < w; x += 3) {
				const t = start + (x / w) * span;
				const amp = Math.min(1, (waveformData[Math.min(waveformData.length - 1, Math.floor((t / duration) * waveformData.length))] || 0) * 1.8);
				const bar = Math.max(1, amp * h);
				ctx.fillRect(x, (h - bar) / 2, 2, bar);
			}
		};
		draw();
		const ro = new ResizeObserver(draw);
		ro.observe(canvas);
		return () => ro.disconnect();
	}, [start, span, duration, waveformData]);

	const toTime = (clientX: number, el: HTMLElement) => {
		const r = el.getBoundingClientRect();
		return start + ((clientX - r.left) / r.width) * span;
	};

	return (
		<div
			className="relative h-10 rounded-md bg-neutral-950 cursor-pointer"
			onClick={(e) => onSeek(Math.max(0, toTime(e.clientX, e.currentTarget)))}
			data-testid="strip-waveform"
			data-start={start}
			data-span={span}
		>
			<canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
			{ticks.map((t) => (
				<div
					key={t.id}
					className={`absolute top-0 bottom-0 w-0.5 ${t.current ? 'bg-blue-400' : 'bg-neutral-400/70'}`}
					style={{ left: `${((t.time - start) / span) * 100}%` }}
				/>
			))}
			<Playhead start={start} span={span} />
		</div>
	);
}

/** Only this re-renders while the song plays. */
function Playhead({ start, span }: { start: number; span: number }) {
	const t = useSyncExternalStore(currentTimeStore.subscribe, currentTimeStore.getSnapshot);
	const at = (t - start) / span;
	if (at < 0 || at > 1) return null;
	return <div className="absolute top-0 bottom-0 w-px bg-white pointer-events-none" style={{ left: `${at * 100}%` }} />;
}
