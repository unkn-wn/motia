import { createElement } from 'react';
import { FrameSvg } from '../render/FrameSvg';
import { assetDataUrl, whenAssetSettled } from '../assets/assetStore';
import { formatPreciseTime } from '../time';
import { FRAME_REF_MAX_DEPTH, type BoardFormat, type Frame, type StoryboardSymbol } from '../types';

// Static rendering of frames (canvas thumbnails, export): FrameSvg → SVG markup → decoded image → canvas/PNG.
// react-dom/server is loaded on first use, so the main bundle doesn't carry it.

export type RenderContext = { frames: Frame[]; symbols: StoryboardSymbol[] };
type AssetUrl = (assetId: string) => string | null | undefined;

/** Frames this one shows through frame references (to the render depth), and the images it uses. */
export function frameDependencies(frame: Frame, ctx: RenderContext) {
	const refs: Frame[] = [];
	const assets = new Set<string>();
	let usesSymbols = false;
	const visit = (f: Frame, depth: number) => {
		for (const el of f.elements) {
			if (el.type === 'box') {
				const symbol = el.symbolId ? ctx.symbols.find((s) => s.id === el.symbolId) : undefined;
				if (el.symbolId) usesSymbols = true;
				const assetId = symbol ? symbol.assetId : el.assetId;
				if (assetId) assets.add(assetId);
			}
			if (el.type === 'frameRef' && depth < FRAME_REF_MAX_DEPTH) {
				const target = ctx.frames.find((x) => x.id === el.refFrameId);
				if (target) {
					refs.push(target);
					visit(target, depth + 1);
				}
			}
		}
	};
	visit(frame, 0);
	return { refs, assets: [...assets], usesSymbols };
}

/** The frame as standalone SVG markup, images from `assetUrl`. */
export async function frameMarkup(frame: Frame, board: BoardFormat, ctx: RenderContext, assetUrl: AssetUrl): Promise<string> {
	const { renderToStaticMarkup } = await import('react-dom/server');
	return renderToStaticMarkup(
		createElement(FrameSvg, {
			frame,
			board,
			resolveFrame: (id: string) => ctx.frames.find((f) => f.id === id),
			resolveSymbol: (id: string) => ctx.symbols.find((s) => s.id === id),
			assetUrl,
		})
	);
}

/**
 * The frame as a decoded image, its images inlined as data URLs (an SVG loaded as an image can't fetch blob: URLs).
 * Waits for the images to load first; missing ones show as "Image missing".
 */
export async function frameImage(frame: Frame, board: BoardFormat, ctx: RenderContext, assets = frameDependencies(frame, ctx).assets): Promise<HTMLImageElement> {
	await Promise.all(assets.map(whenAssetSettled));
	const svg = await frameMarkup(frame, board, ctx, assetDataUrl);
	const img = new Image();
	img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
	await img.decode();
	return img;
}

export const canvasPng = (canvas: HTMLCanvasElement) =>
	new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG encoding failed'))), 'image/png'));

// Contact sheet: every frame in time order with its number, time and title
const SHEET_MAX_SIDE = 8192;
/** Browsers refuse bigger canvases (Safari first) */
const SHEET_MAX_PIXELS = 16_000_000;
const CELL_W = 480;
const PAD = 24;
const CAPTION_H = 40;

export function createContactSheet(board: BoardFormat, count: number) {
	const cols = Math.max(1, Math.min(count, Math.ceil(Math.sqrt(count))));
	const rows = Math.max(1, Math.ceil(count / cols));
	const cellH = (CELL_W * board.height) / board.width;
	const width = PAD + cols * (CELL_W + PAD);
	const height = PAD + rows * (cellH + CAPTION_H + PAD);
	const scale = Math.min(1, SHEET_MAX_SIDE / width, SHEET_MAX_SIDE / height, Math.sqrt(SHEET_MAX_PIXELS / (width * height)));
	const canvas = document.createElement('canvas');
	canvas.width = Math.max(1, Math.round(width * scale));
	canvas.height = Math.max(1, Math.round(height * scale));
	const ctx = canvas.getContext('2d')!;
	ctx.scale(scale, scale);
	ctx.fillStyle = '#0a0a0a';
	ctx.fillRect(0, 0, width, height);
	return {
		draw(index: number, frame: Frame, image: CanvasImageSource) {
			const x = PAD + (index % cols) * (CELL_W + PAD);
			const y = PAD + Math.floor(index / cols) * (cellH + CAPTION_H + PAD);
			ctx.drawImage(image, x, y, CELL_W, cellH);
			ctx.strokeStyle = '#404040';
			ctx.lineWidth = 1;
			ctx.strokeRect(x + 0.5, y + 0.5, CELL_W - 1, cellH - 1);
			ctx.fillStyle = '#e5e5e5';
			ctx.font = '600 16px system-ui, sans-serif';
			ctx.textBaseline = 'top';
			const time = frame.endTime !== undefined ? `${formatPreciseTime(frame.time)} → ${formatPreciseTime(frame.endTime)}` : formatPreciseTime(frame.time);
			const caption = `${String(index + 1).padStart(3, '0')}  ${time}${frame.title ? `  ${frame.title}` : ''}`;
			ctx.save();
			ctx.beginPath();
			ctx.rect(x, y + cellH, CELL_W, CAPTION_H);
			ctx.clip();
			ctx.fillText(caption, x, y + cellH + 12);
			ctx.restore();
		},
		toPng: () => canvasPng(canvas),
	};
}
