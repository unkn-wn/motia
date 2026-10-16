import { describe, expect, it } from 'vitest';
import type { Note } from '@types';
import { buildMotiaJson, frameFileStem } from './io/motiaJson';
import { storyboardMarkdown } from './io/markdown';
import { validateMotiaJson } from './validate';
import { safeFileName } from './io/exportZip';
import type { StoryboardDoc } from './types';

const storyboard: StoryboardDoc = {
	version: 1,
	board: { width: 1920, height: 1080, fps: 30, style: 'hard hitting' },
	frames: [
		{
			id: 'f_late',
			time: 63,
			endTime: 65.457,
			title: 'Checkered | intro',
			notes: "camera snaps on 'over'\nand 'night'",
			group: 'shot 1',
			background: '#0b0b0b',
			canvasX: -470,
			canvasY: 6290,
			elements: [
				{ id: 'e1', type: 'rect', x: 0, y: 0, w: 1920, h: 300, rotation: 0, radius: 0, fill: '#e60012', stroke: null, strokeWidth: 0, label: 'top border', note: 'tilts on the hit' },
				{ id: 'e2', type: 'text', x: 540, y: 980, w: 1080, h: 200, rotation: -6, text: 'Taking overnight', fontSize: 120, fill: '#ffffff', label: 'hero' },
				{ id: 'e3', type: 'arrow', points: [[300, 900], [900, 600]], stroke: '#ffffff', strokeWidth: 8 },
				{ id: 'e4', type: 'box', x: 1500, y: 500, w: 400, h: 400, rotation: 0, symbolId: 's1' },
				{ id: 'e5', type: 'frameRef', x: 100, y: 100, w: 600, h: 300, rotation: 0, refFrameId: 'f_early', label: 'PREV SCENE' },
				{ id: 'e6', type: 'pen', points: [[10, 20], [14, 26]], stroke: '#9ca3af', strokeWidth: 4 },
				{ id: 'e7', type: 'box', x: 0, y: 0, w: 100, h: 100, rotation: 0, assetId: 'a1', opacity: 0.5 },
				{ id: 'e8', type: 'ellipse', x: 0, y: 0, w: 10, h: 10, rotation: 0, fill: null, stroke: '#fff', strokeWidth: 2 },
			],
		},
		{ id: 'f_early', time: 2.5, title: '', notes: '', background: '#171717', canvasX: 0, canvasY: 0, elements: [] },
	],
	symbols: [{ id: 's1', label: 'coin', note: 'gold casino coin', assetId: 'a1' }],
	assets: [
		{ id: 'a1', mime: 'image/png', width: 512, height: 512 },
		{ id: 'a2', mime: 'image/jpeg', width: 10, height: 10 },
	],
};

const notes: Note[] = [
	{ id: 'note_1_0.5', time: 64.1, content: 'borders | tilt here', color: 'blue', canvasX: 210, canvasY: 6410, createdAt: new Date(0) },
	{ id: 'note_2', time: 1, content: 'intro', color: 'yellow', canvasX: 0, canvasY: 0, createdAt: new Date(0) },
	{ id: 'drawing-global', time: 0, content: '', color: 'blue', canvasX: 0, canvasY: 0, createdAt: new Date(0), type: 'drawing', drawing: { compressed: '[]', bounds: { width: 0, height: 0 } } },
];

const exported = () =>
	buildMotiaJson(
		{
			title: 'Wild Side',
			orientation: 'vertical',
			audio: { name: 'wildside.wav', durationSec: 89.667, trimStart: 63, trimEnd: 78.2 },
			notes,
			sketch: [{ points: [{ x: -80, y: 6400 }, { x: -60, y: 6420 }], color: '#6b7079', strokeWidth: 2 }],
			storyboard,
			exportedAt: new Date('2026-10-13T20:00:00Z'),
		},
		new Set(['a1'])
	);

describe('motia.json', () => {
	it('is built in time order, with preview paths, sketch strokes and only text notes', () => {
		const doc = exported();
		expect(doc.frames.map((f) => f.id)).toEqual(['f_early', 'f_late']);
		expect(doc.frames[1].preview).toEqual({ svg: 'frames/002_1m03.000.svg', png: 'frames/002_1m03.000.png' });
		expect(doc.notes.map((n) => n.id)).toEqual(['note_1_0.5', 'note_2']);
		expect(doc.canvasSketch).toEqual({ untimed: true, strokes: [{ points: [[-80, 6400], [-60, 6420]], color: '#6b7079', width: 2 }] });
		expect(doc.assets).toEqual([
			{ id: 'a1', mime: 'image/png', width: 512, height: 512, file: 'assets/a1.png' },
			{ id: 'a2', mime: 'image/jpeg', width: 10, height: 10 },
		]);
		expect(frameFileStem(11, { ...storyboard.frames[1], time: 3725.5 })).toBe('012_62m05.500');
	});

	it('passes validation unchanged (our own export is accepted)', () => {
		const doc = exported();
		const result = validateMotiaJson(JSON.parse(JSON.stringify(doc)));
		expect(result).toEqual({ ok: true, value: doc });
	});
});

describe('validateMotiaJson rejects', () => {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the fixture is bent into invalid shapes
	const bad = (mutate: (d: Record<string, any>) => void) => {
		const d = JSON.parse(JSON.stringify(exported()));
		mutate(d);
		const r = validateMotiaJson(d);
		expect(r.ok).toBe(false);
		return r.ok ? [] : r.errors;
	};

	it('wrong types, NaN-like values, unknown element types and bad colours', () => {
		expect(bad((d) => (d.frames[0].time = '2.5'))).toEqual(['frames[0].time: expected a number']);
		expect(bad((d) => (d.frames[1].elements[0].x = null))).toEqual(['frames[1].elements[0].x: expected a number']);
		expect(bad((d) => (d.frames[1].elements[0].type = 'script'))[0]).toContain('unknown element type');
		expect(bad((d) => (d.frames[1].background = 'url(javascript:x)'))[0]).toContain('expected a hex colour');
		expect(bad((d) => (d.board.width = 1e9))[0]).toContain('out of range');
		// A line, arrow or pen without points has no place or size
		expect(bad((d) => (d.frames[1].elements[2].points = []))).toEqual(['frames[1].elements[2].points: expected at least one point']);
	});

	it('duplicate ids, non-raster assets, a newer version, a foreign file', () => {
		expect(bad((d) => (d.frames[1].id = 'f_early'))).toEqual(['frames: duplicate id "f_early"']);
		expect(bad((d) => (d.frames[1].elements[1].id = 'e1'))).toEqual(['frames[1].elements: duplicate id "e1"']);
		expect(bad((d) => (d.assets[0].mime = 'image/svg+xml'))[0]).toContain('only PNG, JPEG, WebP and GIF');
		expect(bad((d) => (d.version = 2))[0]).toContain('newer version of motia');
		expect(bad((d) => (d.format = 'other'))).toEqual(['This is not a motia storyboard file.']);
	});

	it('accepts dots inside names; refuses the sketch note id and frames that show too much through references', () => {
		const d = JSON.parse(JSON.stringify(exported()));
		d.project.audio.file = 'audio/Hey...Jude.mp3';
		expect(validateMotiaJson(d).ok).toBe(true);
		expect(bad((d) => (d.notes[0].id = 'drawing-global'))[0]).toContain('notes[0].id: not a valid id');
		// Three frames, each showing the next 200 times: 200 × 200 × 200 elements drawn
		const refs = (target: string) => Array.from({ length: 200 }, (_, i) => ({ id: `r${i}`, type: 'frameRef', x: 0, y: 0, w: 1, h: 1, rotation: 0, refFrameId: target }));
		expect(
			bad((d) => {
				d.frames[0].elements = refs(d.frames[1].id);
				d.frames[1].elements = refs('f_third');
				d.frames.push({ ...d.frames[1], id: 'f_third', elements: refs(d.frames[0].id), preview: undefined });
			}).some((e) => e.includes('shows too many elements'))
		).toBe(true);
	});

	it('file paths outside their folder and reserved ids', () => {
		expect(bad((d) => (d.assets[0].file = '../../evil.png'))[0]).toContain('not a valid file path');
		expect(bad((d) => (d.frames[0].preview.png = 'frames/../x.png'))[0]).toContain('not a valid file path');
		expect(bad((d) => (d.project.audio.file = 'audio/../x.wav'))[0]).toContain('not a valid file path');
		expect(bad((d) => (d.project.audio.file = 'audio/..'))[0]).toContain('not a valid file path');
		expect(bad((d) => (d.frames[0].id = '__proto__'))[0]).toContain('not a valid id');
	});

	it('lists several problems at once', () => {
		expect(
			bad((d) => {
				d.notes[0].time = -1;
				d.symbols[0].label = 5;
			})
		).toHaveLength(2);
	});

	it('drops unknown fields', () => {
		const d = JSON.parse(JSON.stringify(exported()));
		d.frames[0].onclick = 'x';
		d.frames[1].elements[0].html = '<b>';
		const r = validateMotiaJson(d);
		expect(r.ok && 'onclick' in r.value.frames[0]).toBe(false);
		expect(r.ok && 'html' in r.value.frames[1].elements[0]).toBe(false);
	});
});

describe('STORYBOARD.md', () => {
	it('lists frames and notes in time order, with the text verbatim', () => {
		const md = storyboardMarkdown(exported());
		const order = ['| 0:01.000 | Note |  | intro |', '| 0:02.500 | Frame 001 |', '| 1:03.000 → 1:05.457 | Frame 002 |', '| 1:04.100 | Note |'];
		const at = order.map((s) => md.indexOf(s));
		expect(at.every((i) => i >= 0)).toBe(true);
		expect([...at].sort((a, b) => a - b)).toEqual(at);
		// Verbatim: the frame's notes as written; in table cells only pipes and line breaks are escaped
		expect(md).toContain("camera snaps on 'over'\nand 'night'");
		expect(md).toContain('borders \\| tilt here');
		expect(md).toContain('| e1 | rect | top border |  | tilts on the hit |');
		expect(md).toContain('| e2 | text | hero | Taking overnight |  |');
		expect(md).toContain('| e4 | box (symbol s1) | coin |  |  |');
		// A box's own picture is marked (a symbol's is listed with the symbol)
		expect(md).toContain('| e7 | box (image) |  |  |  |');
		expect(md).toContain('| s1 | coin | gold casino coin | assets/a1.png |');
		expect(md).toContain('Board 1920×1080 · 30 fps · style: hard hitting');
	});
});

describe('safeFileName', () => {
	it('keeps the extension, drops separators and control characters, avoids reserved names', () => {
		expect(safeFileName('wild/side:mix.wav', 'song')).toBe('wild_side_mix.wav');
		expect(safeFileName('a\\b.wav', 'song')).toBe('a_b.wav');
		expect(safeFileName(`${'a'.repeat(200)}.wav`, 'song')).toBe(`${'a'.repeat(120)}.wav`);
		expect(safeFileName('CON.wav', 'song')).toBe('CON_.wav');
		expect(safeFileName(' ..', 'storyboard')).toBe('storyboard');
		// Nothing left of the name but its extension: the fallback keeps the extension
		expect(safeFileName('   .mp3', 'song')).toBe('song.mp3');
		expect(safeFileName('tab	here. ', 'x')).toBe('tab_here');
	});
});
