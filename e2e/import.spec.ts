import { strFromU8, strToU8, zipSync, type Zippable } from 'fflate';
import { test, expect, type App } from './support/app';
import { mergeDoc, notesDocsMentioning, projectIds, projectMetaPath, projectNotesPath, readDoc, writeDoc } from './support/emulator';
import { exportZip } from './support/export';
import { makePng, svgFile } from './support/images';
import { compressDrawingAdaptive } from '../src/utils/drawingUtils';
import type { MotiaJson } from '../src/features/storyboard/io/motiaJson';
import type { StoryboardDoc } from '../src/features/storyboard/types';

// M8: a `.motia.zip` (or a bare `motia.json`) becomes a new project; a bad file is refused with nothing written.

const RELINK = 'Audio not found on this device. Relink to enable playback.';

const NOTES = [
	{ id: 'n_intro', time: 3, content: 'intro builds', color: 'yellow', canvasX: 220, canvasY: 300, createdAt: '2026-01-01T00:00:00.000Z' },
	{ id: 'n_tilt', time: 14.5, content: 'borders | tilt\nthen hold', color: 'pink', canvasX: 220, canvasY: 1500, createdAt: '2026-01-01T00:00:00.000Z' },
];

const STORYBOARD: StoryboardDoc = {
	version: 1,
	board: { width: 1280, height: 720, fps: 30, style: 'hard hitting' },
	symbols: [{ id: 's_coin', label: 'coin', note: 'gold casino coin' }],
	assets: [],
	frames: [
		{
			id: 'f_check',
			time: 8,
			endTime: 11,
			title: 'Checkered',
			notes: 'snap on the hit',
			group: 'shot 1',
			background: '#101010',
			canvasX: -400,
			canvasY: 400,
			elements: [
				{ id: 'e_bar', type: 'rect', x: 0, y: 0, w: 1280, h: 120, rotation: 0, radius: 8, fill: '#e60012', stroke: null, strokeWidth: 0, label: 'top border' },
				{ id: 'e_hero', type: 'text', x: 200, y: 300, w: 800, h: 120, rotation: -6, text: 'TAKING OVER', fontSize: 96, fill: '#ffffff' },
				{ id: 'e_coin', type: 'box', x: 900, y: 400, w: 200, h: 200, rotation: 0, symbolId: 's_coin' },
				{ id: 'e_path', type: 'arrow', points: [[100, 600], [600, 500]], stroke: '#ffffff', strokeWidth: 6 },
			],
		},
		{
			id: 'f_spiky',
			time: 20,
			title: 'Spiky',
			notes: '',
			background: '#171717',
			canvasX: -520,
			canvasY: 2000,
			elements: [{ id: 'e_prev', type: 'frameRef', x: 40, y: 40, w: 400, h: 225, rotation: 0, refFrameId: 'f_check', label: 'PREV SCENE' }],
		},
	],
};

/** Project A: notes, a canvas sketch, frames (span, group, symbol, frame ref), a trim, and an image from this device. */
async function seedProjectA(app: App) {
	await app.signIn();
	await app.createProject();
	await app.chooseOrientation('vertical');
	await app.saveAndWaitForStoryboard((doc) => doc.frames.length === 0);
	const sketch = compressDrawingAdaptive([{ points: [{ x: -300, y: 100 }, { x: -250, y: 140 }, { x: -200, y: 160 }], color: '#9ca3af', strokeWidth: 2 }]).strokes;
	await writeDoc(projectNotesPath(app.uid, app.projectId()), { notes: NOTES, compressed: JSON.stringify(sketch), storyboard: JSON.stringify(STORYBOARD), version: 50 });
	const meta = (await app.metaDoc())!;
	await mergeDoc(projectMetaPath(app.uid, app.projectId()), { audio: { ...(meta.audio as object), trimStart: 2, trimEnd: 25 } });
	await app.reload();
	await expect.poll(async () => (await app.storyboard()).frames.length).toBe(2);

	// An image in the first frame (stored on this device); the editor is opened directly (opening it is tested elsewhere)
	await app.page.evaluate(() => window.__motiaTest!.openFrameEditor!('f_check'));
	await expect(app.page.getByRole('dialog', { name: 'Frame editor' })).toBeVisible();
	await app.page.getByTestId('file-Image').setInputFiles({ name: 'coin.png', mimeType: 'image/png', buffer: makePng(80, 60, [255, 200, 0]) });
	await expect.poll(async () => (await app.storyboard()).assets.length).toBe(1);
	await app.press(app.page.getByRole('button', { name: 'Close frame editor' }));
	await app.saveAndWaitForStoryboard((doc) => doc.assets.length === 1);
}

/** Imports a file from the Projects page; resolves when its project is open. */
async function importOnProjectsPage(app: App, file: { name: string; mimeType: string; buffer: Buffer }) {
	await app.page.goto('/projects');
	await app.page.getByTestId('import-input').setInputFiles(file);
}

const withoutExportTime = (j: MotiaJson) => ({ ...j, exportedAt: '' });

async function assetCount(app: App) {
	return app.page.evaluate(async () => {
		if (!(await indexedDB.databases()).some((d) => d.name === 'motia-assets')) return 0;
		const db = await new Promise<IDBDatabase>((resolve, reject) => {
			const req = indexedDB.open('motia-assets');
			req.onsuccess = () => resolve(req.result);
			req.onerror = () => reject(req.error);
		});
		try {
			return await new Promise<number>((resolve) => {
				const c = db.transaction('assets').objectStore('assets').count();
				c.onsuccess = () => resolve(c.result);
			});
		} finally {
			db.close();
		}
	});
}

test('round trip: export A → import → B is A again (with the song and the image)', async ({ app }) => {
	const { page } = app;
	await seedProjectA(app);
	const a = await exportZip(app, { includeAudio: true });
	const jsonA = JSON.parse(strFromU8(a.files['motia.json'])) as MotiaJson;
	const idA = app.projectId();

	await importOnProjectsPage(app, { name: 'Wild Side.motia.zip', mimeType: 'application/zip', buffer: Buffer.from(a.bytes) });
	await page.waitForURL((url) => /\/project\/[^/]+$/.test(url.pathname) && !url.pathname.endsWith(idA));
	await app.waitForAudio();
	await app.waitForBoard();
	await expect(page.getByText(RELINK)).toHaveCount(0);

	// B, exported, is A: same notes, frames, symbols, board, image, sketch, title, orientation, song and trim. Only the
	// image ids are new (images are filed on the device by id, and A's stay A's)
	const b = await exportZip(app, { includeAudio: true });
	const jsonB = JSON.parse(strFromU8(b.files['motia.json'])) as MotiaJson;
	const idsA = jsonA.assets.map((x) => x.id);
	const idsB = jsonB.assets.map((x) => x.id);
	expect(idsB).toHaveLength(idsA.length);
	for (const [i, id] of idsB.entries()) expect(id).not.toBe(idsA[i]);
	const asA = (text: string) => idsB.reduce((t, id, i) => t.split(id).join(idsA[i]), text);
	expect(withoutExportTime(JSON.parse(asA(strFromU8(b.files['motia.json']))))).toEqual(withoutExportTime(jsonA));
	expect(b.files[jsonB.assets[0].file!]).toEqual(a.files[jsonA.assets[0].file!]);
	expect(Object.keys(b.files).map(asA).sort()).toEqual(Object.keys(a.files).sort());
	expect(app.projectId()).not.toBe(idA);
	// On this device A's image is still filed under A, and B has its own copy
	const owner = (assetId: string) =>
		page.evaluate(
			(id) =>
				new Promise<string | null>((resolve) => {
					const req = indexedDB.open('motia-assets');
					req.onsuccess = () => {
						const get = req.result.transaction('assets').objectStore('assets').get(id);
						get.onsuccess = () => {
							req.result.close();
							resolve((get.result as { projectId?: string } | undefined)?.projectId ?? null);
						};
					};
				}),
			assetId
		);
	expect(await owner(idsA[0])).toBe(idA);
	expect(await owner(idsB[0])).toBe(app.projectId());
});

test('a bare motia.json imports; without the song the relink banner shows', async ({ app }) => {
	const { page } = app;
	await seedProjectA(app);
	const a = await exportZip(app);
	const idA = app.projectId();
	await importOnProjectsPage(app, { name: 'motia.json', mimeType: 'application/json', buffer: Buffer.from(a.files['motia.json']) });
	await page.waitForURL((url) => /\/project\/[^/]+$/.test(url.pathname) && !url.pathname.endsWith(idA));
	await expect(page.getByText(RELINK)).toBeVisible();
	await expect.poll(async () => (await app.storyboard()).frames.map((f) => f.id)).toEqual(['f_check', 'f_spiky']);
	expect((await app.textNotes()).map((n) => n.content)).toEqual(NOTES.map((n) => n.content));
});

test('refused, with nothing written: wrong types, NaN, oversize, an SVG image, a zip bomb, duplicate ids, a newer version', async ({ app }) => {
	const { page } = app;
	await seedProjectA(app);
	const a = await exportZip(app);
	// A title of its own: other tests add projects to the shared account meanwhile, so "nothing written" means no
	// project with this title appears
	const marker = `refused-${Date.now()}`;
	const base = JSON.parse(strFromU8(a.files['motia.json']));
	base.project.title = marker;
	base.notes[1].content = marker;
	const json = JSON.stringify(base, null, 2);
	const before = new Set(await projectIds(app.uid));
	const assetsBefore = await assetCount(app);

	const zip = (files: Zippable) => Buffer.from(zipSync(files, { level: 1 }));
	const withJson = (text: string, extra: Zippable = {}) => zip({ ...a.files, 'motia.json': strToU8(text), ...extra });
	// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the export is bent into invalid shapes
	const edit = (fn: (j: Record<string, any>) => void) => {
		const j = JSON.parse(json);
		fn(j);
		return JSON.stringify(j);
	};
	const assetFile = JSON.parse(json).assets[0].file as string;
	const cases: Array<[string, Buffer, RegExp]> = [
		['wrong types', withJson(edit((j) => (j.frames[0].time = 'soon'))), /frames\[0\]\.time: expected a number/],
		// JSON has no NaN; an overflowing number is the way a non-finite value arrives
		['NaN', withJson(json.replace('"time": 3,', '"time": 1e999,')), /notes\[0\]\.time: expected a number/],
		['oversize', zip(Object.fromEntries(Array.from({ length: 2001 }, (_, i) => [`x/${i}.txt`, strToU8('x')]))), /too large to import/],
		['an SVG image', withJson(json, { [assetFile]: new Uint8Array(svgFile) }), /not a PNG, JPEG, WebP or GIF image/],
		['a zip bomb', zip({ 'motia.json': strToU8(json), 'assets/huge.png': new Uint8Array(201 * 1024 * 1024) }), /too large to import/],
		['duplicate ids', withJson(edit((j) => (j.frames[1].id = j.frames[0].id))), /duplicate id "f_check"/],
		['a newer version', withJson(edit((j) => (j.version = 2))), /newer version of motia/],
	];
	for (const [what, buffer, message] of cases) {
		await importOnProjectsPage(app, { name: `${what}.motia.zip`, mimeType: 'application/zip', buffer });
		const dialog = page.getByRole('dialog', { name: "This storyboard can't be imported" });
		await expect(dialog, what).toBeVisible();
		await expect(dialog.getByTestId('import-errors'), what).toContainText(message);
		if (what === 'duplicate ids') await page.screenshot({ path: `test-results/m8-errors-${app.touch ? 'touch' : 'desktop'}.png` });
		await dialog.getByRole('button', { name: 'Close' }).click();
		expect(page.url(), what).toMatch(/\/projects$/);
	}
	const added = (await projectIds(app.uid)).filter((id) => !before.has(id));
	const titles = await Promise.all(added.map(async (id) => (await readDoc(projectMetaPath(app.uid, id)))?.title));
	expect(titles).not.toContain(marker);
	// Not even a notes doc without its project (written before a refusal)
	expect(await notesDocsMentioning(marker)).toEqual([]);
	expect(await assetCount(app)).toBe(assetsBefore);
});

test('a guest imports from the landing page', async ({ app }) => {
	const { page } = app;
	await seedProjectA(app);
	const a = await exportZip(app);
	const json = Buffer.from(a.files['motia.json']);

	// A visitor in a fresh browser, not signed in
	const visitor = await page.context().browser()!.newContext({ viewport: page.viewportSize() ?? undefined });
	const guestPage = await visitor.newPage();
	await guestPage.route(/googletagmanager\.com|google-analytics\.com/, (r) => r.abort());
	await guestPage.goto('/');
	await guestPage.getByTestId('import-input').setInputFiles({ name: 'motia.json', mimeType: 'application/json', buffer: json });
	await guestPage.waitForURL(/\/project\/[^/]+$/);
	await expect.poll(() => guestPage.evaluate(() => window.__motiaTest?.storyboard?.frames.length)).toBe(2);
	// It belongs to the visitor's guest session, not to an account
	const pid = new URL(guestPage.url()).pathname.split('/').pop()!;
	expect(await readDoc(projectMetaPath(app.uid, pid))).toBeNull();
	await expect(guestPage.getByText(RELINK)).toBeVisible();
	await visitor.close();
});

test('dropping a .motia.zip on the Projects page imports it', async ({ app }) => {
	const { page } = app;
	await seedProjectA(app);
	const a = await exportZip(app);
	const idA = app.projectId();
	await page.goto('/projects');
	await expect(page.getByRole('button', { name: 'Import storyboard' })).toBeVisible();
	await page.evaluate((bytes) => {
		const dt = new DataTransfer();
		dt.items.add(new File([new Uint8Array(bytes)], 'Wild Side.motia.zip', { type: 'application/zip' }));
		for (const type of ['dragenter', 'dragover', 'drop']) window.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt }));
	}, [...a.bytes]);
	await page.waitForURL((url) => /\/project\/[^/]+$/.test(url.pathname) && !url.pathname.endsWith(idA));
	await expect.poll(async () => (await app.storyboard()).frames.map((f) => f.id)).toEqual(['f_check', 'f_spiky']);
});
