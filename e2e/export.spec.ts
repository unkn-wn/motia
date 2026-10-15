import { mkdir, writeFile } from 'node:fs/promises';
import { strFromU8 } from 'fflate';
import { test, expect, type App } from './support/app';
import { mergeDoc, projectNotesPath, writeDoc } from './support/emulator';
import { addFrameAt } from './support/frames';
import { draw, setField } from './support/editor';
import { makePng } from './support/images';
import { exportZip } from './support/export';
import { compressDrawingAdaptive } from '../src/utils/drawingUtils';
import { validateMotiaJson } from '../src/features/storyboard/validate';
import type { MotiaJson } from '../src/features/storyboard/io/motiaJson';
import { framesByTime } from '../src/features/storyboard/timeline';

// M6: Export downloads `<title>.motia.zip` with every SPEC §7.1 file; no automation wording anywhere in it.

const FORBIDDEN = /\b(AI|agents?|LLM|GPT|Claude|automat\w*)\b/i;

/** The colour of one pixel of a PNG, decoded in the page. */
const pixel = (app: App, png: Uint8Array, x: number, y: number) =>
	app.page.evaluate(
		async ({ b64, x, y }) => {
			const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
			const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
			const c = new OffscreenCanvas(bmp.width, bmp.height);
			const g = c.getContext('2d')!;
			g.drawImage(bmp, 0, 0);
			return [...g.getImageData(x, y, 1, 1).data.slice(0, 3)];
		},
		{ b64: Buffer.from(png).toString('base64'), x, y }
	);

const pngSize = (bytes: Uint8Array) => {
	const v = new DataView(bytes.buffer, bytes.byteOffset);
	return { width: v.getUint32(16), height: v.getUint32(20) };
};

test('export: every file of the zip, frames at board size, readable text, no automation wording', async ({ app }, testInfo) => {
	const { page } = app;
	await app.signIn();
	await app.createProject();
	await app.chooseOrientation('vertical');
	// A text note and a canvas sketch, stored as the app stores them
	await expect.poll(async () => !!(await app.notesDoc()), { timeout: 10_000 }).toBe(true);
	const sketch = compressDrawingAdaptive([{ points: [{ x: -300, y: 100 }, { x: -250, y: 140 }], color: '#9ca3af', strokeWidth: 2 }]).strokes;
	const note = { id: 'note_1', time: 6.5, canvasX: 210, canvasY: 320, content: 'borders | tilt here', color: 'pink', createdAt: '2026-01-01T00:00:00.000Z' };
	await writeDoc(projectNotesPath(app.uid, app.projectId()), { notes: [note], compressed: JSON.stringify(sketch), version: 3 });
	await app.reload();
	await expect.poll(async () => (await app.textNotes()).length).toBe(1);

	// Two frames, made out of time order: a labelled rect, then (earlier) a box holding an image
	const late = await addFrameAt(app, 8, { keepEditorOpen: true });
	const rect = await draw(app, 'Rectangle', { x: 100, y: 100 }, { x: 700, y: 500 });
	await setField(app, 'label', 'hero');
	await app.press(page.getByRole('button', { name: 'Close frame editor' }));
	const early = await addFrameAt(app, 5, { keepEditorOpen: true });
	const box = await draw(app, 'Box', { x: 800, y: 300 }, { x: 1200, y: 700 });
	await page.getByTestId('file-Add image').setInputFiles({ name: 'coin.png', mimeType: 'image/png', buffer: makePng(64, 64, [255, 200, 0]) });
	await expect.poll(async () => typeof ((await app.storyboard()).frames.find((f) => f.id === early.id)?.elements[0] as { assetId?: string })?.assetId).toBe('string');
	await app.press(page.getByRole('button', { name: 'Close frame editor' }));
	const doc = await app.storyboard();
	const assetId = doc.assets[0].id;

	const { name, files } = await exportZip(app);
	expect(name).toMatch(/\.motia\.zip$/);
	const names = Object.keys(files).sort();
	expect(names).toEqual(
		[
			'motia.json',
			'README.md',
			'STORYBOARD.md',
			'sheet.png',
			'frames/001_0m05.000.svg',
			'frames/001_0m05.000.png',
			'frames/002_0m08.000.svg',
			'frames/002_0m08.000.png',
			`assets/${assetId}.png`,
		].sort()
	);

	// motia.json: complete and accepted by the importer's check
	const json = JSON.parse(strFromU8(files['motia.json'])) as MotiaJson;
	expect(validateMotiaJson(json).ok).toBe(true);
	expect(json.frames.map((f) => f.id)).toEqual([early.id, late.id]);
	// Lossless: every frame as stored, in time order (plus the paths of its pictures), and the sketch as drawn
	expect(json.frames.map(({ preview, ...f }) => (void preview, f))).toEqual(framesByTime(doc.frames));
	expect(json.symbols).toEqual(doc.symbols);
	expect(json.board).toEqual(doc.board);
	expect(json.canvasSketch).toEqual({ untimed: true, strokes: [{ points: [[-300, 100], [-250, 140]], color: '#9ca3af', width: 2 }] });
	expect(json.notes).toEqual([{ id: 'note_1', time: 6.5, content: 'borders | tilt here', color: 'pink', canvasX: 210, canvasY: 320 }]);
	expect(json.canvasSketch.strokes).toHaveLength(1);
	expect(json.assets).toEqual([{ ...doc.assets[0], file: `assets/${assetId}.png` }]);
	expect(json.project.audio).toMatchObject({ name: 'e2e.wav', trimStart: 0 });
	expect(json.project.audio!.durationSec).toBeGreaterThan(0);
	expect(json.project.audio!.trimEnd).toBe(json.project.audio!.durationSec);
	expect(json.project.audio?.file).toBeUndefined();

	// Frames: PNGs at board resolution; SVGs carry ids and labels, and point at the exported image
	for (const n of names.filter((x) => x.startsWith('frames/') && x.endsWith('.png'))) expect(pngSize(files[n])).toEqual({ width: doc.board.width, height: doc.board.height });
	const lateSvg = strFromU8(files['frames/002_0m08.000.svg']);
	expect(lateSvg).toContain(`data-id="${rect.id}"`);
	expect(lateSvg).toContain('data-label="hero"');
	const earlySvg = strFromU8(files['frames/001_0m05.000.svg']);
	expect(earlySvg).toContain(`data-id="${box.id}"`);
	expect(earlySvg).toContain(`href="../assets/${assetId}.png"`);
	expect(pngSize(files['sheet.png']).width).toBeGreaterThan(0);
	// The PNG really shows the frame: the box's image at its centre, the background beside it
	// (the box draws a faint wash over its image)
	const near = (got: number[], want: number[]) => got.every((v, i) => Math.abs(v - want[i]) <= 12);
	expect(near(await pixel(app, files['frames/001_0m05.000.png'], 1000, 500), [255, 200, 0])).toBe(true);
	expect(near(await pixel(app, files['frames/001_0m05.000.png'], 100, 900), [0x17, 0x17, 0x17])).toBe(true);

	// README: the export's own explanation (SPEC §7.3)
	const readme = strFromU8(files['README.md']).replace(/\s+/g, ' ');
	for (const line of [
		'This folder is a complete motia storyboard.',
		'`motia.json` holds every frame, note and setting.',
		'Times are in seconds from the start of the song.',
		'To open this storyboard in motia again, choose **Import storyboard** on the Projects page.',
	])
		expect(readme).toContain(line);

	// Text: time ordered, verbatim, and free of automation wording
	const md = strFromU8(files['STORYBOARD.md']);
	expect(md.indexOf('| Frame 001')).toBeLessThan(md.indexOf('borders \\| tilt here'));
	expect(md.indexOf('borders \\| tilt here')).toBeLessThan(md.indexOf('| Frame 002'));
	for (const n of names.filter((x) => /\.(json|md|svg)$/.test(x))) expect(strFromU8(files[n]), n).not.toMatch(FORBIDDEN);

	// For the manual look: the frames and the sheet
	await mkdir('test-results', { recursive: true });
	for (const n of ['sheet.png', 'frames/001_0m05.000.png', 'frames/002_0m08.000.png'])
		await writeFile(`test-results/m6-${testInfo.project.name}-${n.replace('/', '-')}`, files[n]);

	// Include audio file (off by default): the song goes in, and motia.json points at it
	const withAudio = await exportZip(app, { includeAudio: true, screenshot: `test-results/m6-titlebar-${app.touch ? 'touch' : 'desktop'}.png` });
	expect(Object.keys(withAudio.files)).toContain('audio/e2e.wav');
	expect(JSON.parse(strFromU8(withAudio.files['motia.json'])).project.audio.file).toBe('audio/e2e.wav');
});

test('export: a board that could not be read is not exported', async ({ app }) => {
	await app.signIn();
	await app.createProject();
	await app.chooseOrientation('vertical');
	await expect(app.page.getByRole('button', { name: 'Export', exact: true })).toBeVisible();
	await app.saveAndWaitForStoryboard((doc) => doc.frames.length === 0);
	await mergeDoc(projectNotesPath(app.uid, app.projectId()), { storyboard: '{not json' });
	await app.page.reload();
	await expect(app.page.getByRole('status').filter({ hasText: "This board couldn't be read" })).toBeVisible();
	// The file would look like an empty board, so there is no Export (the save status explains the board)
	await expect(app.page.getByRole('button', { name: 'Export', exact: true })).toHaveCount(0);
});
