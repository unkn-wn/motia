import type { AssetMeta, BoardFormat, Frame, FrameElement, Point, StoryboardDoc, StoryboardSymbol } from './types';

// Pure, immutable operations on the storyboard. Inputs are never modified; unchanged parts keep their identity.

const DEFAULT_BOARD: BoardFormat = Object.freeze({ width: 1920, height: 1080 });
const DEFAULT_FRAME_BACKGROUND = '#171717';

export function newId(prefix: string): string {
	return prefix + crypto.randomUUID().replace(/-/g, '').slice(0, 12);
}

export function emptyStoryboard(): StoryboardDoc {
	return { version: 1, board: DEFAULT_BOARD, frames: [], symbols: [], assets: [] };
}

export function createFrame(opts: { time: number; canvasX: number; canvasY: number }): Frame {
	return {
		id: newId('f_'),
		time: opts.time,
		title: '',
		notes: '',
		background: DEFAULT_FRAME_BACKGROUND,
		canvasX: opts.canvasX,
		canvasY: opts.canvasY,
		elements: [],
	};
}

export function addFrame(doc: StoryboardDoc, frame: Frame): StoryboardDoc {
	return { ...doc, frames: [...doc.frames, frame] };
}

export type FramePatch = Partial<Omit<Frame, 'id' | 'elements'>>;

/** Applies a patch to one frame. A key set to undefined is removed (`endTime: undefined` clears the span). */
export function updateFrame(doc: StoryboardDoc, id: string, patch: FramePatch): StoryboardDoc {
	let changed = false;
	const frames = doc.frames.map((f) => {
		if (f.id !== id) return f;
		const keys = Object.keys(patch) as Array<keyof FramePatch>;
		if (keys.every((k) => (k in f ? f[k] === patch[k] : patch[k] === undefined))) return f;
		const next: Frame = { ...f, ...patch };
		// A key patched to undefined is removed (e.g. clearing the span or the group)
		for (const k of keys) if (patch[k] === undefined) delete next[k];
		changed = true;
		return next;
	});
	return changed ? { ...doc, frames } : doc;
}

export function removeFrames(doc: StoryboardDoc, ids: ReadonlySet<string>): StoryboardDoc {
	const frames = doc.frames.filter((f) => !ids.has(f.id));
	return frames.length === doc.frames.length ? doc : { ...doc, frames };
}

export function setBoard(doc: StoryboardDoc, board: BoardFormat): StoryboardDoc {
	return { ...doc, board };
}

/**
 * Copies a frame to a new time and card position. Element ids are kept: the same id in two frames means
 * "the same object, moved or changed". Returns the new doc and the copy's id.
 */
export function duplicateFrame(
	doc: StoryboardDoc,
	id: string,
	at: { time: number; canvasX: number; canvasY: number },
	/** The song's end: a copied span is cut there (and dropped if nothing is left). */
	maxTime = Infinity
): { doc: StoryboardDoc; id: string } {
	const source = doc.frames.find((f) => f.id === id);
	if (!source) return { doc, id };
	const copy: Frame = { ...source, id: newId('f_'), ...at };
	delete copy.endTime;
	if (source.endTime !== undefined) {
		const end = Math.min(maxTime, at.time + (source.endTime - source.time));
		if (end > at.time) copy.endTime = end;
	}
	return { doc: addFrame(doc, copy), id: copy.id };
}

/** Moves several cards at once (positions are absolute). */
export function setCardPositions(doc: StoryboardDoc, positions: ReadonlyMap<string, { x: number; y: number }>): StoryboardDoc {
	let changed = false;
	const frames = doc.frames.map((f) => {
		const p = positions.get(f.id);
		if (!p || (p.x === f.canvasX && p.y === f.canvasY)) return f;
		changed = true;
		return { ...f, canvasX: p.x, canvasY: p.y };
	});
	return changed ? { ...doc, frames } : doc;
}

// --- Elements (frame editor). Element ids are unique within a frame; the same id in two frames is the same object.

/** A patch to an element; callers only set fields that exist on its type. */
export type ElementPatch = Record<string, unknown>;

function mapFrameElements(doc: StoryboardDoc, frameId: string, fn: (els: FrameElement[]) => FrameElement[]): StoryboardDoc {
	let changed = false;
	const frames = doc.frames.map((f) => {
		if (f.id !== frameId) return f;
		const elements = fn(f.elements);
		if (elements === f.elements) return f;
		changed = true;
		return { ...f, elements };
	});
	return changed ? { ...doc, frames } : doc;
}

const GEOMETRY_KEYS = ['x', 'y', 'w', 'h', 'rotation', 'fontSize'] as const;
const tenth = (n: number) => Math.round(n * 10) / 10;

/**
 * Geometry to 0.1 board px (rotation and font size to 0.1): pointer maths gives values like 113.0000037273378,
 * which cost a third of a shape's stored size and mean nothing at any zoom. Unchanged elements keep their identity.
 */
function tidyGeometry(el: FrameElement): FrameElement {
	const src = el as unknown as Record<string, unknown>;
	let out: Record<string, unknown> | null = null;
	for (const key of GEOMETRY_KEYS) {
		const v = src[key];
		if (typeof v !== 'number' || tenth(v) === v) continue;
		out ??= { ...src };
		out[key] = tenth(v);
	}
	if (Array.isArray(src.points)) {
		const pts = src.points as Point[];
		if (pts.some(([x, y]) => tenth(x) !== x || tenth(y) !== y)) {
			out ??= { ...src };
			out.points = pts.map(([x, y]) => [tenth(x), tenth(y)] as Point);
		}
	}
	return (out ?? src) as unknown as FrameElement;
}

export function addElements(doc: StoryboardDoc, frameId: string, els: FrameElement[]): StoryboardDoc {
	return els.length ? mapFrameElements(doc, frameId, (cur) => [...cur, ...els.map(tidyGeometry)]) : doc;
}

/** Applies patches by element id; unchanged elements (and frames) keep their identity. */
export function patchElements(doc: StoryboardDoc, frameId: string, patches: ReadonlyMap<string, ElementPatch>): StoryboardDoc {
	return mapFrameElements(doc, frameId, (els) => {
		let changed = false;
		const next = els.map((el) => {
			const patch = patches.get(el.id);
			if (!patch) return el;
			const keys = Object.keys(patch);
			if (keys.every((k) => (el as Record<string, unknown>)[k] === patch[k])) return el;
			changed = true;
			const out = { ...el, ...patch } as Record<string, unknown>;
			for (const k of keys) if (patch[k] === undefined) delete out[k];
			return tidyGeometry(out as FrameElement);
		});
		return changed ? next : els;
	});
}

/** Replaces elements by id with already-computed versions (drags, transforms). */
export function replaceElements(doc: StoryboardDoc, frameId: string, replacements: ReadonlyMap<string, FrameElement>): StoryboardDoc {
	return mapFrameElements(doc, frameId, (els) => {
		let changed = false;
		const next = els.map((el) => {
			const r = replacements.get(el.id);
			if (!r || r === el) return el;
			changed = true;
			return tidyGeometry(r);
		});
		return changed ? next : els;
	});
}

export function removeElements(doc: StoryboardDoc, frameId: string, ids: ReadonlySet<string>): StoryboardDoc {
	return mapFrameElements(doc, frameId, (els) => {
		const next = els.filter((el) => !ids.has(el.id));
		return next.length === els.length ? els : next;
	});
}

/** Moves the given elements one step forward (+1, drawn later) or back (-1) in the stacking order. */
export function reorderElements(doc: StoryboardDoc, frameId: string, ids: ReadonlySet<string>, dir: 1 | -1): StoryboardDoc {
	return mapFrameElements(doc, frameId, (els) => {
		const next = [...els];
		const order = dir === 1 ? [...next.keys()].reverse() : [...next.keys()];
		let changed = false;
		for (const i of order) {
			const j = i + dir;
			if (!ids.has(next[i].id) || j < 0 || j >= next.length || ids.has(next[j].id)) continue;
			[next[i], next[j]] = [next[j], next[i]];
			changed = true;
		}
		return changed ? next : els;
	});
}

/**
 * Prepares copied elements for pasting into a frame. Into another frame they keep their ids (the same object
 * continues) unless an id is already used there; into the same frame they get new ids.
 */
export function elementsForPaste(copied: FrameElement[], targetIds: ReadonlySet<string>, sameFrame: boolean): FrameElement[] {
	return copied.map((el) => (sameFrame || targetIds.has(el.id) ? { ...el, id: newId('e_') } : el));
}

// --- Images and symbols

/** Records an image's metadata (the bytes stay on the device). */
export function addAsset(doc: StoryboardDoc, asset: AssetMeta): StoryboardDoc {
	return doc.assets.some((a) => a.id === asset.id) ? doc : { ...doc, assets: [...doc.assets, asset] };
}

export function addSymbol(doc: StoryboardDoc, symbol: StoryboardSymbol): StoryboardDoc {
	return { ...doc, symbols: [...doc.symbols, symbol] };
}

/** Patches a symbol; a key set to undefined is removed. */
export function updateSymbol(doc: StoryboardDoc, id: string, patch: Partial<Omit<StoryboardSymbol, 'id'>>): StoryboardDoc {
	let changed = false;
	const symbols = doc.symbols.map((s) => {
		if (s.id !== id) return s;
		const keys = Object.keys(patch) as Array<keyof typeof patch>;
		if (keys.every((k) => s[k] === patch[k])) return s;
		changed = true;
		const next = { ...s, ...patch };
		for (const k of keys) if (patch[k] === undefined) delete next[k];
		return next;
	});
	return changed ? { ...doc, symbols } : doc;
}
