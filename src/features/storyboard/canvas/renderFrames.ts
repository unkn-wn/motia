import type { BoardFormat, Frame } from '../types';
import { anchorPoint, CARD_HEADER, cardSize, FRAME_COLLAPSE_SCALE, frameTimeLabel, type TimeAxis } from './layout';

// Draws frame cards, connectors, anchor dots and span brackets in world space (the caller has applied the
// canvas transform). Styled like note cards. Called by the main canvas renderer, under sketches and notes.

type View = { minX: number; minY: number; maxX: number; maxY: number };

const CARD_BG = 'rgba(38, 38, 38, 1)';
const CARD_BORDER = 'rgba(82, 82, 82, 1)';
const SELECTED_BORDER = 'rgba(96, 165, 250, 1)';
const MUTED_TEXT = '#a3a3a3';
const TEXT = '#e5e5e5';
const ANCHOR = '#d4d4d4';

function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
	if (ctx.measureText(text).width <= maxWidth) return text;
	let lo = 0;
	let hi = text.length;
	while (lo < hi) {
		const mid = Math.ceil((lo + hi) / 2);
		if (ctx.measureText(text.slice(0, mid) + '…').width <= maxWidth) lo = mid;
		else hi = mid - 1;
	}
	return lo > 0 ? text.slice(0, lo) + '…' : '';
}

export function renderFrames(
	ctx: CanvasRenderingContext2D,
	p: {
		frames: Frame[];
		board: BoardFormat;
		axis: TimeAxis;
		scale: number;
		view: View;
		selectedIds?: ReadonlySet<string>;
		thumbnail: (frame: Frame) => CanvasImageSource | null;
	}
) {
	const { frames, board, axis, scale, view, selectedIds } = p;
	if (frames.length === 0) return;
	const collapsed = scale < FRAME_COLLAPSE_SCALE;
	const { w, h, thumbH } = cardSize(board);
	const horizontal = axis.orientation === 'horizontal';
	const visible: Frame[] = [];

	// Pass 1: connectors, spans and anchors (under the cards)
	for (const f of frames) {
		const a = anchorPoint(f.time, axis);
		const e = f.endTime !== undefined ? anchorPoint(f.endTime, axis) : a;
		const minX = Math.min(a.x, e.x, collapsed ? a.x : f.canvasX);
		const maxX = Math.max(a.x, e.x, collapsed ? a.x : f.canvasX + w);
		const minY = Math.min(a.y, e.y, collapsed ? a.y : f.canvasY);
		const maxY = Math.max(a.y, e.y, collapsed ? a.y : f.canvasY + h);
		if (maxX < view.minX || minX > view.maxX || maxY < view.minY || minY > view.maxY) continue;
		visible.push(f);

		if (!collapsed) {
			ctx.strokeStyle = '#6b7280';
			ctx.lineWidth = 1;
			ctx.setLineDash([3, 3]);
			ctx.globalAlpha = 0.5;
			ctx.beginPath();
			ctx.moveTo(a.x, a.y);
			ctx.lineTo(f.canvasX + w / 2, f.canvasY + h / 2);
			ctx.stroke();
			ctx.setLineDash([]);
			ctx.globalAlpha = 1;
		}

		if (f.endTime !== undefined) {
			// Bracket along the waveform edge from time to endTime, with end ticks pointing at the frames
			const tick = 8;
			ctx.strokeStyle = ANCHOR;
			ctx.lineWidth = 3;
			ctx.beginPath();
			ctx.moveTo(a.x, a.y);
			ctx.lineTo(e.x, e.y);
			if (horizontal) {
				ctx.moveTo(a.x, a.y);
				ctx.lineTo(a.x, a.y - tick);
				ctx.moveTo(e.x, e.y);
				ctx.lineTo(e.x, e.y - tick);
			} else {
				ctx.moveTo(a.x, a.y);
				ctx.lineTo(a.x - tick, a.y);
				ctx.moveTo(e.x, e.y);
				ctx.lineTo(e.x - tick, e.y);
			}
			ctx.stroke();
		}

		ctx.fillStyle = selectedIds?.has(f.id) ? SELECTED_BORDER : ANCHOR;
		ctx.strokeStyle = '#2d2d2d';
		ctx.lineWidth = 2;
		ctx.beginPath();
		ctx.arc(a.x, a.y, 5, 0, 2 * Math.PI);
		ctx.fill();
		ctx.stroke();
	}

	if (collapsed) return;

	// Pass 2: cards
	for (const f of visible) {
		const x = f.canvasX;
		const y = f.canvasY;
		const selected = selectedIds?.has(f.id) ?? false;

		ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
		ctx.beginPath();
		ctx.roundRect(x + 4, y + 4, w, h, 4);
		ctx.fill();

		ctx.fillStyle = CARD_BG;
		ctx.beginPath();
		ctx.roundRect(x, y, w, h, 4);
		ctx.fill();

		// Body: the thumbnail (frame background until it is ready)
		const thumb = p.thumbnail(f);
		ctx.save();
		ctx.beginPath();
		ctx.roundRect(x, y + CARD_HEADER, w, thumbH, [0, 0, 4, 4]);
		ctx.clip();
		if (thumb) {
			ctx.drawImage(thumb, x, y + CARD_HEADER, w, thumbH);
		} else {
			ctx.fillStyle = f.background;
			ctx.fillRect(x, y + CARD_HEADER, w, thumbH);
		}
		ctx.restore();

		ctx.strokeStyle = selected ? SELECTED_BORDER : CARD_BORDER;
		ctx.lineWidth = selected ? 2 : 1;
		ctx.beginPath();
		ctx.roundRect(x, y, w, h, 4);
		ctx.stroke();

		// Header: time or range, then the title (and the group tag, right-aligned)
		ctx.textAlign = 'left';
		ctx.textBaseline = 'alphabetic';
		ctx.font = '13px system-ui, -apple-system, sans-serif';
		const timeText = frameTimeLabel(f);
		ctx.fillStyle = MUTED_TEXT;
		ctx.fillText(timeText, x + 8, y + 19);
		const titleX = x + 8 + ctx.measureText(timeText).width + 8;
		let titleRight = x + w - 8;
		if (f.group) {
			const tag = fitText(ctx, f.group, 70);
			ctx.textAlign = 'right';
			ctx.fillText(tag, titleRight, y + 19);
			ctx.textAlign = 'left';
			titleRight -= ctx.measureText(tag).width + 8;
		}
		if (f.title) {
			ctx.fillStyle = TEXT;
			ctx.fillText(fitText(ctx, f.title, titleRight - titleX), titleX, y + 19);
		}
	}
}
