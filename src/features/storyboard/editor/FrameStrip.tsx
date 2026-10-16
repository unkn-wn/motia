import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Copy, Play, Plus } from 'lucide-react';
import { useAudioActions } from '@contexts/objects/AudioContextObject';
import { FrameSvg } from '../render/FrameSvg';
import { useFrameRender } from '../render/useFrameRender';
import { formatFrameTime } from '../canvas/layout';
import type { BoardFormat, Frame } from '../types';
import { Timeline } from './Timeline';

const THUMB_WIDTH = 96;

const action = 'inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-neutral-400 hover:text-white hover:bg-neutral-800 cursor-pointer';
const iconAction = 'grid h-9 w-9 shrink-0 place-items-center rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 cursor-pointer';

/** Play from the frame, new frame from it, duplicate: labelled, or icons only (small screens). */
function Actions({ iconOnly, onPlay, onNewFromThis, onDuplicate }: { iconOnly: boolean; onPlay: () => void; onNewFromThis: () => void; onDuplicate: () => void }) {
	const items = [
		{ label: 'preview', title: 'Preview: play from this frame, showing each frame as the song reaches it', icon: <Play className="w-3.5 h-3.5" />, run: onPlay },
		{ label: 'new frame from this', title: 'New frame from this one (same objects)', icon: <Plus className="w-3.5 h-3.5" />, run: onNewFromThis },
		{ label: 'duplicate', title: 'Duplicate this frame', icon: <Copy className="w-3.5 h-3.5" />, run: onDuplicate },
	];
	return (
		<>
			{items.map((a) => (
				<button key={a.label} type="button" className={iconOnly ? iconAction : action} onClick={a.run} title={a.title} aria-label={iconOnly ? a.label : undefined}>
					{a.icon}
					{iconOnly ? null : ` ${a.label}`}
				</button>
			))}
		</>
	);
}

type Props = {
	frame: Frame;
	ordered: Frame[];
	board: BoardFormat;
	onOpen: (id: string) => void;
	/** Plays from this frame, showing each frame as the song reaches it */
	onPreview: () => void;
	onNewFromThis: () => void;
	onDuplicate: () => void;
};

/** Bottom strip of the frame editor: neighbouring frames, the waveform around them, and frame actions. */
export function FrameStrip({ frame, ordered, board, onOpen, onPreview, onNewFromThis, onDuplicate }: Props) {
	// Stable actions and stores: the strip doesn't re-render on every playback tick
	const { seekToTime } = useAudioActions();
	const lookups = useFrameRender();
	// A frame pointed at on the timeline or among the thumbnails: highlighted in both
	const [hoverId, setHoverId] = useState<string | null>(null);

	// Every frame, in a row that keeps the open one in the middle
	const rowRef = useRef<HTMLDivElement>(null);
	const scrolled = useRef(false);
	useLayoutEffect(() => {
		const row = rowRef.current;
		const el = row?.querySelector<HTMLElement>('[aria-current="true"]');
		if (!row || !el) return;
		row.scrollTo({ left: el.offsetLeft - (row.clientWidth - el.offsetWidth) / 2, behavior: scrolled.current ? 'smooth' : 'auto' });
		scrolled.current = true;
	}, [frame.id]);
	// A thumbnail draws its frame once it has come near view (a long board doesn't draw every frame at once)
	const [seen, setSeen] = useState<ReadonlySet<string>>(() => new Set());
	const thumbIds = ordered.map((f) => f.id).join(' ');
	useEffect(() => {
		const row = rowRef.current;
		if (!row) return;
		const io = new IntersectionObserver(
			(entries) => {
				const ids = entries.filter((e) => e.isIntersecting).map((e) => (e.target as HTMLElement).dataset.thumb!);
				if (ids.length) setSeen((prev) => (ids.every((id) => prev.has(id)) ? prev : new Set([...prev, ...ids])));
			},
			{ root: row, rootMargin: '0px 400px' }
		);
		row.querySelectorAll('[data-thumb]').forEach((el) => io.observe(el));
		return () => io.disconnect();
	}, [thumbIds]);

	const actions = { onPlay: onPreview, onNewFromThis, onDuplicate };

	// Small screens: one row, the surrounding waveform and the actions as icons (the header has prev/next frame)
	return (
		<div className="shrink-0 border-t border-neutral-800 bg-neutral-900 px-3 py-2 space-y-2 compact:space-y-0 compact:py-1.5 compact:flex compact:items-center compact:gap-2" data-testid="frame-strip">
			<div className="flex items-end gap-2 compact:hidden">
				{/* Padded so the rings aren't clipped by the scrolling row */}
				<div ref={rowRef} className="relative flex min-w-0 flex-1 items-end gap-2 overflow-x-auto p-1">
					{ordered.map((f) => (
						<button
							key={f.id}
							type="button"
							data-thumb={f.id}
							// The open frame: back to its start
							onClick={() => (f.id === frame.id ? seekToTime(f.time) : onOpen(f.id))}
							title={f.id === frame.id ? "Go to this frame's start" : undefined}
							aria-current={f.id === frame.id}
							aria-label={`Frame at ${formatFrameTime(f.time)}${f.title ? `: ${f.title}` : ''}`}
							onMouseEnter={() => setHoverId(f.id)}
							onMouseLeave={() => setHoverId(null)}
							className={`shrink-0 rounded-md overflow-hidden cursor-pointer ${
								f.id === frame.id ? 'ring-2 ring-blue-500' : f.id === hoverId ? 'ring-2 ring-neutral-300' : 'ring-1 ring-white/10 opacity-70 hover:opacity-100'
							}`}
							style={{ width: THUMB_WIDTH }}
						>
							<div style={{ aspectRatio: `${board.width} / ${board.height}` }}>
								{seen.has(f.id) || f.id === frame.id ? (
									<FrameSvg frame={f} board={board} {...lookups} className="block w-full h-full pointer-events-none" />
								) : (
									<div className="h-full w-full" style={{ background: f.background }} />
								)}
							</div>
							<div className="px-1 py-0.5 text-[10px] text-neutral-400 tabular-nums bg-neutral-800 text-left truncate">
								{formatFrameTime(f.time)}
								{f.group ? ` · ${f.group}` : ''}
							</div>
						</button>
					))}
				</div>
				<div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
					<Actions iconOnly={false} {...actions} />
				</div>
			</div>
			<div className="min-w-0 compact:flex-1">
				<Timeline frames={ordered} currentId={frame.id} hoverId={hoverId} onHover={setHoverId} onOpen={onOpen} />
			</div>
			<div className="hidden compact:flex shrink-0 items-center gap-1.5">
				<Actions iconOnly {...actions} />
			</div>
		</div>
	);
}
