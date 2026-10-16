import { ASSET_EXTENSIONS, MOTIA_FORMAT, MOTIA_VERSION, type MotiaAsset, type MotiaJson, type MotiaNote, type MotiaStroke, type MotiaFrame } from './io/motiaJson';
import { SKETCH_NOTE_ID } from '@/lib/notesPayload';
import { FRAME_REF_MAX_DEPTH, type BoardFormat, type FrameElement, type Point, type StoryboardSymbol } from './types';

// Strict check of a `motia.json` (SPEC §7.4): an import file is untrusted input. Known types only, finite numbers,
// hex colours, capped strings, unique ids. The result is rebuilt from known fields only; anything else is dropped.

const LIMITS = {
	frames: 1000,
	elementsPerFrame: 2000,
	notes: 20_000,
	symbols: 1000,
	assets: 2000,
	points: 20_000,
	sketchStrokes: 50_000,
	idLength: 128,
	// Text and number caps sit well above anything the editor produces, so every export imports again
	shortText: 5_000,
	longText: 200_000,
	boardSide: 16_384,
	coordinate: 1e9,
	size: 1e6,
	time: 1e7,
	/** Elements one frame draws, counting what its frame references show (to their depth of 2) */
	renderedElements: 20_000,
};

type ValidationResult = { ok: true; value: MotiaJson } | { ok: false; errors: string[] };

const MAX_ERRORS = 50;
const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const ID = /^[\w.:-]+$/;
const RESERVED_IDS = new Set(['__proto__', 'prototype', 'constructor']);
// Paths inside the zip have fixed shapes; anything else (`..`, other folders) is refused
const FRAME_PATH = /^frames\/\d{3,}_\d+m\d{2}\.\d{3}\.(svg|png)$/;
const ASSET_PATH = new RegExp(`^assets/[\\w.:-]+\\.(${Object.values(ASSET_EXTENSIONS).join('|')})$`);
const AUDIO_PATH = /^audio\/[^/\\]+$/;
const NOTE_COLOR = /^(?:yellow|blue|green|pink|purple)$/;
const MIMES = new Set(Object.keys(ASSET_EXTENSIONS));
const ELEMENT_TYPES = new Set(['rect', 'ellipse', 'line', 'arrow', 'pen', 'text', 'box', 'frameRef']);

class Invalid extends Error {}

type Obj = Record<string, unknown>;

function createChecker() {
	const errors: string[] = [];
	const fail = (path: string, message: string): never => {
		errors.push(`${path}: ${message}`);
		throw new Invalid();
	};
	/** Runs a check; a failure is recorded and the item is skipped, so all problems are listed (up to a cap). */
	const attempt = <T>(fn: () => T): T | undefined => {
		if (errors.length >= MAX_ERRORS) return undefined;
		try {
			return fn();
		} catch (e) {
			if (e instanceof Invalid) return undefined;
			throw e;
		}
	};

	const obj = (v: unknown, path: string): Obj => (v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : fail(path, 'expected an object'));
	const arr = (v: unknown, path: string, max: number): unknown[] => {
		if (!Array.isArray(v)) return fail(path, 'expected a list');
		if (v.length > max) fail(path, `too many items (at most ${max})`);
		return v;
	};
	const num = (v: unknown, path: string, min: number, max: number): number => {
		if (typeof v !== 'number' || !Number.isFinite(v)) return fail(path, 'expected a number');
		if (v < min || v > max) fail(path, `out of range (${min} to ${max})`);
		return v;
	};
	const str = (v: unknown, path: string, max: number): string => {
		if (typeof v !== 'string') return fail(path, 'expected text');
		if (v.length > max) fail(path, `too long (at most ${max} characters)`);
		return v;
	};
	const id = (v: unknown, path: string): string => {
		const s = str(v, path, LIMITS.idLength);
		if (!ID.test(s) || RESERVED_IDS.has(s)) fail(path, 'not a valid id');
		return s;
	};
	const color = (v: unknown, path: string): string => {
		const s = str(v, path, 40);
		if (!HEX.test(s)) fail(path, 'expected a hex colour');
		return s;
	};
	const colorOrNull = (v: unknown, path: string): string | null => (v === null ? null : color(v, path));
	const optional = <T>(o: Obj, key: string, read: (v: unknown, path: string) => T, path: string): { [k: string]: T } =>
		o[key] === undefined ? {} : { [key]: read(o[key], `${path}.${key}`) };
	const unique = (ids: string[], path: string) => {
		const seen = new Set<string>();
		for (const x of ids) {
			if (seen.has(x)) fail(path, `duplicate id "${x}"`);
			seen.add(x);
		}
	};
	return { errors, fail, attempt, obj, arr, num, str, id, color, colorOrNull, optional, unique };
}

export function validateMotiaJson(input: unknown): ValidationResult {
	const c = createChecker();
	const { obj, arr, num, str, id, color, colorOrNull, optional, unique, fail, attempt } = c;
	const coord = (v: unknown, path: string) => num(v, path, -LIMITS.coordinate, LIMITS.coordinate);
	const zipPath = (v: unknown, path: string, shape: RegExp) => {
		const s = str(v, path, 300);
		// A name may hold dots ("Hey...Jude.mp3"); a `.` or `..` segment may not
		if (!shape.test(s) || s.split('/').some((seg) => seg === '.' || seg === '..')) fail(path, 'not a valid file path');
		return s;
	};
	const time = (v: unknown, path: string) => num(v, path, 0, LIMITS.time);

	const points = (v: unknown, path: string): Point[] =>
		arr(v, path, LIMITS.points).map((p, i) => {
			const pair = arr(p, `${path}[${i}]`, 2);
			if (pair.length !== 2) fail(`${path}[${i}]`, 'expected [x, y]');
			return [coord(pair[0], `${path}[${i}][0]`), coord(pair[1], `${path}[${i}][1]`)];
		});

	const element = (v: unknown, path: string): FrameElement => {
		const o = obj(v, path);
		const type = str(o.type, `${path}.type`, 20);
		if (!ELEMENT_TYPES.has(type)) fail(`${path}.type`, `unknown element type "${type}"`);
		const base = {
			id: id(o.id, `${path}.id`),
			...optional(o, 'label', (x, p) => str(x, p, LIMITS.shortText), path),
			...optional(o, 'note', (x, p) => str(x, p, LIMITS.longText), path),
			...optional(o, 'opacity', (x, p) => num(x, p, 0, 1), path),
		};
		const box = () => ({
			x: coord(o.x, `${path}.x`),
			y: coord(o.y, `${path}.y`),
			w: num(o.w, `${path}.w`, 0, LIMITS.coordinate),
			h: num(o.h, `${path}.h`, 0, LIMITS.coordinate),
			rotation: num(o.rotation, `${path}.rotation`, -LIMITS.coordinate, LIMITS.coordinate),
		});
		const stroke = () => ({ stroke: colorOrNull(o.stroke, `${path}.stroke`), strokeWidth: num(o.strokeWidth, `${path}.strokeWidth`, 0, LIMITS.size) });
		switch (type) {
			case 'rect':
				return { ...base, type, ...box(), ...stroke(), radius: num(o.radius, `${path}.radius`, 0, LIMITS.coordinate), fill: colorOrNull(o.fill, `${path}.fill`) };
			case 'ellipse':
				return { ...base, type, ...box(), ...stroke(), fill: colorOrNull(o.fill, `${path}.fill`) };
			case 'line':
			case 'arrow':
			case 'pen': {
				// At least one point: an element without any has no place or size (NaN bounds in the editor)
				const list = points(o.points, `${path}.points`);
				if (list.length === 0) fail(`${path}.points`, 'expected at least one point');
				return { ...base, type, ...stroke(), points: list };
			}
			case 'text':
				return {
					...base,
					type,
					...box(),
					text: str(o.text, `${path}.text`, LIMITS.longText),
					fontSize: num(o.fontSize, `${path}.fontSize`, 0, LIMITS.size),
					fill: color(o.fill, `${path}.fill`),
				};
			case 'box':
				return { ...base, type, ...box(), ...optional(o, 'symbolId', id, path), ...optional(o, 'assetId', id, path) };
			default:
				return { ...base, type: 'frameRef', ...box(), refFrameId: o.refFrameId === '' ? '' : id(o.refFrameId, `${path}.refFrameId`) };
		}
	};

	const frame = (v: unknown, path: string): MotiaFrame => {
		const o = obj(v, path);
		const elements = arr(o.elements, `${path}.elements`, LIMITS.elementsPerFrame).map((e, i) => element(e, `${path}.elements[${i}]`));
		unique(
			elements.map((e) => e.id),
			`${path}.elements`
		);
		const t = time(o.time, `${path}.time`);
		const out: MotiaFrame = {
			id: id(o.id, `${path}.id`),
			time: t,
			...optional(o, 'endTime', time, path),
			title: str(o.title, `${path}.title`, LIMITS.shortText),
			notes: str(o.notes, `${path}.notes`, LIMITS.longText),
			...optional(o, 'group', (x, p) => str(x, p, LIMITS.shortText), path),
			background: color(o.background, `${path}.background`),
			canvasX: coord(o.canvasX, `${path}.canvasX`),
			canvasY: coord(o.canvasY, `${path}.canvasY`),
			elements,
		};
		if (out.endTime !== undefined && out.endTime < t) fail(`${path}.endTime`, 'before the frame time');
		if (o.preview !== undefined) {
			const p = obj(o.preview, `${path}.preview`);
			out.preview = { svg: zipPath(p.svg, `${path}.preview.svg`, FRAME_PATH), png: zipPath(p.png, `${path}.preview.png`, FRAME_PATH) };
		}
		return out;
	};

	// Each section is checked on its own, so one bad item doesn't hide problems in others
	const list = <T>(v: unknown, path: string, max: number, read: (x: unknown, p: string) => T): T[] => {
		const items = attempt(() => arr(v, path, max)) ?? [];
		const out: T[] = [];
		items.forEach((x, i) => {
			const r = attempt(() => read(x, `${path}[${i}]`));
			if (r !== undefined) out.push(r);
		});
		return out;
	};

	const root = attempt(() => obj(input, 'motia.json'));
	if (!root) return { ok: false, errors: c.errors };
	if (root.format !== MOTIA_FORMAT) return { ok: false, errors: ['This is not a motia storyboard file.'] };
	if (typeof root.version !== 'number' || !Number.isInteger(root.version) || root.version < 1)
		return { ok: false, errors: ['version: expected a whole number'] };
	if (root.version > MOTIA_VERSION) return { ok: false, errors: ['This storyboard was made with a newer version of motia. Update the page and try again.'] };

	const exportedAt = attempt(() => str(root.exportedAt, 'exportedAt', 40)) ?? '';
	const project = attempt(() => {
		const p = obj(root.project, 'project');
		const orientation = p.orientation;
		if (orientation !== 'vertical' && orientation !== 'horizontal') fail('project.orientation', 'expected "vertical" or "horizontal"');
		let audio: MotiaAudioOut | undefined;
		if (p.audio !== undefined) {
			const a = obj(p.audio, 'project.audio');
			audio = {
				name: str(a.name, 'project.audio.name', LIMITS.shortText),
				durationSec: time(a.durationSec, 'project.audio.durationSec'),
				trimStart: time(a.trimStart, 'project.audio.trimStart'),
				trimEnd: time(a.trimEnd, 'project.audio.trimEnd'),
				...optional(a, 'file', (x, q) => zipPath(x, q, AUDIO_PATH), 'project.audio'),
			};
		}
		return { title: str(p.title, 'project.title', LIMITS.shortText), orientation: orientation as 'vertical' | 'horizontal', ...(audio ? { audio } : {}) };
	});
	const board = attempt((): BoardFormat => {
		const b = obj(root.board, 'board');
		return {
			width: num(b.width, 'board.width', 1, LIMITS.boardSide),
			height: num(b.height, 'board.height', 1, LIMITS.boardSide),
			...optional(b, 'fps', (x, q) => num(x, q, 1, 1000), 'board'),
			...optional(b, 'style', (x, q) => str(x, q, LIMITS.shortText), 'board'),
		};
	});
	const notes = list(root.notes, 'notes', LIMITS.notes, (v, path): MotiaNote => {
		const o = obj(v, path);
		const col = str(o.color, `${path}.color`, 40);
		if (!NOTE_COLOR.test(col) && !HEX.test(col)) fail(`${path}.color`, 'expected a note colour');
		// The canvas sketch is kept as one note with this id; a text note can't take it
		if (o.id === SKETCH_NOTE_ID) fail(`${path}.id`, 'not a valid id');
		return {
			id: id(o.id, `${path}.id`),
			time: time(o.time, `${path}.time`),
			content: str(o.content, `${path}.content`, LIMITS.longText),
			color: col,
			canvasX: coord(o.canvasX, `${path}.canvasX`),
			canvasY: coord(o.canvasY, `${path}.canvasY`),
		};
	});
	const frames = list(root.frames, 'frames', LIMITS.frames, frame);
	const symbols = list(root.symbols, 'symbols', LIMITS.symbols, (v, path): StoryboardSymbol => {
		const o = obj(v, path);
		return {
			id: id(o.id, `${path}.id`),
			label: str(o.label, `${path}.label`, LIMITS.shortText),
			...optional(o, 'note', (x, q) => str(x, q, LIMITS.longText), path),
			...optional(o, 'assetId', id, path),
		};
	});
	const assets = list(root.assets, 'assets', LIMITS.assets, (v, path): MotiaAsset => {
		const o = obj(v, path);
		const mime = str(o.mime, `${path}.mime`, 20);
		if (!MIMES.has(mime)) fail(`${path}.mime`, 'only PNG, JPEG, WebP and GIF images');
		return {
			id: id(o.id, `${path}.id`),
			mime,
			width: num(o.width, `${path}.width`, 1, LIMITS.boardSide),
			height: num(o.height, `${path}.height`, 1, LIMITS.boardSide),
			...optional(o, 'file', (x, q) => zipPath(x, q, ASSET_PATH), path),
		};
	});
	const strokes = attempt(() => {
		const s = obj(root.canvasSketch, 'canvasSketch');
		return list(s.strokes, 'canvasSketch.strokes', LIMITS.sketchStrokes, (v, path): MotiaStroke => {
			const o = obj(v, path);
			return { points: points(o.points, `${path}.points`), color: color(o.color, `${path}.color`), width: num(o.width, `${path}.width`, 0, LIMITS.size) };
		});
	});

	attempt(() => unique(frames.map((f) => f.id), 'frames'));
	attempt(() => unique(notes.map((n) => n.id), 'notes'));
	attempt(() => unique(symbols.map((s) => s.id), 'symbols'));
	attempt(() => unique(assets.map((a) => a.id), 'assets'));
	// Frame references multiply what a frame draws (a frame showing frames showing frames): keep that bounded
	const byId = new Map(frames.map((f) => [f.id, f]));
	const counted = new Map<string, number>();
	const rendered = (f: MotiaFrame, depth: number): number => {
		const key = `${depth}:${f.id}`;
		const known = counted.get(key);
		if (known !== undefined) return known;
		const n = f.elements.reduce((sum, el) => {
			const target = el.type === 'frameRef' && depth < FRAME_REF_MAX_DEPTH ? byId.get(el.refFrameId) : undefined;
			return Math.min(LIMITS.renderedElements + 1, sum + 1 + (target ? rendered(target, depth + 1) : 0));
		}, 0);
		counted.set(key, n);
		return n;
	};
	frames.forEach((f, i) => {
		if (rendered(f, 0) > LIMITS.renderedElements) attempt(() => fail(`frames[${i}]`, 'shows too many elements through frame references'));
	});

	if (c.errors.length > 0 || !project || !board || !strokes) return { ok: false, errors: c.errors };
	return {
		ok: true,
		value: { format: MOTIA_FORMAT, version: MOTIA_VERSION, exportedAt, project, board, notes, frames, symbols, assets, canvasSketch: { untimed: true, strokes } },
	};
}

type MotiaAudioOut = NonNullable<MotiaJson['project']['audio']>;
