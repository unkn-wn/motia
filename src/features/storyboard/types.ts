// Storyboard data model (SPEC §3, §7.2). Every object is immutable: produce new objects, never mutate.
// Frame space is board pixels, origin top-left, y down. Times are seconds on the untrimmed song.

export type Point = [number, number];

/** A frame reference shows its frame, which may show another, and no deeper. */
export const FRAME_REF_MAX_DEPTH = 2;

export type BoardFormat = {
	width: number;
	height: number;
	fps?: number;
	style?: string;
};

type ElementBase = {
	id: string;
	label?: string;
	note?: string;
	opacity?: number;
};

/** Unrotated box; `rotation` is degrees clockwise about the box centre. */
type BoxGeometry = {
	x: number;
	y: number;
	w: number;
	h: number;
	rotation: number;
};

type Stroke = {
	stroke: string | null;
	strokeWidth: number;
};

export type RectElement = ElementBase & BoxGeometry & Stroke & { type: 'rect'; radius: number; fill: string | null };
export type EllipseElement = ElementBase & BoxGeometry & Stroke & { type: 'ellipse'; fill: string | null };
export type LineElement = ElementBase & Stroke & { type: 'line'; points: Point[] };
export type ArrowElement = ElementBase & Stroke & { type: 'arrow'; points: Point[] };
export type PenElement = ElementBase & Stroke & { type: 'pen'; points: Point[] };
export type TextElement = ElementBase & BoxGeometry & { type: 'text'; text: string; fontSize: number; fill: string };
/**
 * A box: with a picture (its own `assetId`, or its symbol's), it shows the picture; without one, it is a dashed
 * placeholder showing its label ("logo", "coin"). It can be saved as a symbol, placed again by `symbolId`.
 */
export type BoxElement = ElementBase & BoxGeometry & { type: 'box'; symbolId?: string; assetId?: string };
/** Shows another frame inside it, live. */
export type FrameRefElement = ElementBase & BoxGeometry & { type: 'frameRef'; refFrameId: string };

export type FrameElement =
	| RectElement
	| EllipseElement
	| LineElement
	| ArrowElement
	| PenElement
	| TextElement
	| BoxElement
	| FrameRefElement;

export type Frame = {
	id: string;
	time: number;
	endTime?: number;
	title: string;
	notes: string;
	group?: string;
	background: string;
	/** Card position on the main canvas (world units). */
	canvasX: number;
	canvasY: number;
	elements: FrameElement[];
};

export type StoryboardSymbol = {
	id: string;
	label: string;
	note?: string;
	assetId?: string;
};

/** Metadata of an image kept in the local `motia-assets` IndexedDB; the bytes never go to Firestore. */
export type AssetMeta = {
	id: string;
	mime: string;
	width: number;
	height: number;
};

export type StoryboardDoc = {
	version: 1;
	board: BoardFormat;
	frames: Frame[];
	symbols: StoryboardSymbol[];
	assets: AssetMeta[];
};
