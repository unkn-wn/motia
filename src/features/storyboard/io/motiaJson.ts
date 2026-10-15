import type { DrawingStroke, Note } from '@types';
import { formatPreciseTime } from '../time';
import { framesByTime } from '../timeline';
import type { AssetMeta, BoardFormat, Frame, Point, StoryboardDoc, StoryboardSymbol } from '../types';

// `motia.json`, format version 1 (SPEC §7.2): the complete project, lossless. Import reads only this file, assets/
// and audio/.

export const MOTIA_FORMAT = 'motia-storyboard';
export const MOTIA_VERSION = 1;

export type MotiaAudio = { name: string; durationSec: number; trimStart: number; trimEnd: number; file?: string };
export type MotiaNote = { id: string; time: number; content: string; color: string; canvasX: number; canvasY: number };
export type MotiaFrame = Frame & { preview?: { svg: string; png: string } };
export type MotiaAsset = AssetMeta & { file?: string };
export type MotiaStroke = { points: Point[]; color: string; width: number };

export type MotiaJson = {
	format: typeof MOTIA_FORMAT;
	version: typeof MOTIA_VERSION;
	exportedAt: string;
	project: { title: string; orientation: 'vertical' | 'horizontal'; audio?: MotiaAudio };
	board: BoardFormat;
	notes: MotiaNote[];
	frames: MotiaFrame[];
	symbols: StoryboardSymbol[];
	assets: MotiaAsset[];
	/** Freehand strokes drawn on the canvas, outside frames; not tied to a time. */
	canvasSketch: { untimed: true; strokes: MotiaStroke[] };
};

export type ExportSource = {
	title: string;
	orientation: 'vertical' | 'horizontal';
	audio?: MotiaAudio;
	notes: Note[];
	sketch: DrawingStroke[];
	storyboard: StoryboardDoc;
	exportedAt: Date;
};

/** `003_1m03.000`: the frame's place in time order and its time. */
export function frameFileStem(index: number, frame: Frame): string {
	return `${String(index + 1).padStart(3, '0')}_${formatPreciseTime(frame.time).replace(':', 'm')}`;
}

export const ASSET_EXTENSIONS: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' };

export const assetFileName = (asset: AssetMeta) => `assets/${asset.id}.${ASSET_EXTENSIONS[asset.mime] ?? 'bin'}`;

/**
 * The export's JSON. Frames are in time order, each with the paths of its SVG and PNG; an asset has a `file` only
 * when its image is on this device (`presentAssets`).
 */
export function buildMotiaJson(src: ExportSource, presentAssets: ReadonlySet<string>): MotiaJson {
	const ordered = framesByTime(src.storyboard.frames);
	return {
		format: MOTIA_FORMAT,
		version: MOTIA_VERSION,
		exportedAt: src.exportedAt.toISOString(),
		project: { title: src.title, orientation: src.orientation, ...(src.audio ? { audio: src.audio } : {}) },
		board: src.storyboard.board,
		notes: src.notes
			// The same notes as are saved: everything but the canvas sketch
			.filter((n) => n.type !== 'drawing' || !n.drawing)
			.map((n) => ({ id: n.id, time: n.time, content: n.content, color: n.color, canvasX: n.canvasX, canvasY: n.canvasY })),
		frames: ordered.map((f, i) => {
			const stem = frameFileStem(i, f);
			return { ...f, preview: { svg: `frames/${stem}.svg`, png: `frames/${stem}.png` } };
		}),
		symbols: src.storyboard.symbols,
		assets: src.storyboard.assets.map((a) => (presentAssets.has(a.id) ? { ...a, file: assetFileName(a) } : a)),
		canvasSketch: {
			untimed: true,
			strokes: src.sketch.map((s) => ({ points: s.points.map((p): Point => [p.x, p.y]), color: s.color, width: s.strokeWidth })),
		},
	};
}
