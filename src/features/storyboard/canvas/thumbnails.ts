import { assetDataUrl } from '../assets/assetStore';
import { frameDependencies, frameImage, type RenderContext } from '../io/rasterize';
import type { BoardFormat, Frame, FrameElement } from '../types';
import { cardSize } from './layout';

// Frame thumbnails for the main canvas: FrameSvg → static SVG markup → decoded <img> → rasterized once into a
// small canvas. Cached on the frame's `elements` array (immutable, and unchanged when a card is only moved or
// retimed), then by frame: a duplicate shares its elements but can have another background, and one entry for both
// would be redrawn for each in turn, forever. An entry also records what else it was drawn from — board, background, the frames it references,
// the symbols it uses, and whether its images had loaded — and is redrawn when any of those change.

type Entry = { deps: unknown[]; canvas: HTMLCanvasElement | null; failedAt?: number };
const RETRY_MS = 5000;
const cache = new WeakMap<FrameElement[], Map<string, Entry>>();

let version = 0;
let bumpScheduled = false;
const listeners = new Set<() => void>();

function bump() {
	if (bumpScheduled) return;
	bumpScheduled = true;
	// Many thumbnails finishing together cause one redraw
	requestAnimationFrame(() => {
		bumpScheduled = false;
		version += 1;
		listeners.forEach((l) => l());
	});
}

export const thumbnailStore = {
	subscribe(listener: () => void) {
		listeners.add(listener);
		return () => {
			listeners.delete(listener);
		};
	},
	getVersion: () => version,
};

export type ThumbnailContext = RenderContext;

async function rasterize(frame: Frame, board: BoardFormat, ctx: ThumbnailContext, assets: string[]): Promise<HTMLCanvasElement> {
	const img = await frameImage(frame, board, ctx, assets);
	const { w, thumbH } = cardSize(board);
	const scale = Math.min(2, Math.max(1, Math.ceil(window.devicePixelRatio || 1)));
	const canvas = document.createElement('canvas');
	canvas.width = Math.round(w * scale);
	canvas.height = Math.round(thumbH * scale);
	canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height);
	return canvas;
}

const sameDeps = (a: unknown[], b: unknown[]) => a.length === b.length && a.every((v, i) => v === b[i]);

/**
 * The ready thumbnail, or null while it renders (a redraw follows through `thumbnailStore`). An empty frame has
 * none: the card shows its background, which is all there is.
 */
export function getFrameThumbnail(frame: Frame, board: BoardFormat, ctx: ThumbnailContext): HTMLCanvasElement | null {
	if (frame.elements.length === 0) return null;
	const { refs, assets, usesSymbols } = frameDependencies(frame, ctx);
	const base: unknown[] = [board, frame.background, ...refs.map((f) => f.elements), ...refs.map((f) => f.background), usesSymbols ? ctx.symbols : null];
	// Each image's URL: changes only when that image has loaded (or turned out missing)
	const withAssets = () => [...base, ...assets.map((id) => assetDataUrl(id))];
	const deps = withAssets();
	let byFrame = cache.get(frame.elements);
	if (!byFrame) {
		byFrame = new Map();
		cache.set(frame.elements, byFrame);
	}
	const existing = byFrame.get(frame.id);
	if (existing && sameDeps(existing.deps, deps)) {
		// A failed render is retried after a pause, not on every animation frame
		if (!(existing.failedAt && Date.now() - existing.failedAt > RETRY_MS)) return existing.canvas;
	}
	const entry: Entry = { deps, canvas: existing?.canvas ?? null };
	byFrame.set(frame.id, entry);
	rasterize(frame, board, ctx, assets)
		.then((canvas) => {
			entry.canvas = canvas;
			// Drawn with its images settled: their load doesn't call for another render
			entry.deps = withAssets();
			bump();
		})
		.catch((err) => {
			entry.failedAt = Date.now();
			console.warn('Frame thumbnail failed', err);
		});
	return entry.canvas;
}
