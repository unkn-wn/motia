import { test, expect, App } from './support/app';
import { addFrameAt, cardGrip, frameById } from './support/frames';
import { boardToScreen, draw, editingId, elements, expectElement, setField } from './support/editor';
import { makePng, svgFile } from './support/images';

// M5: boxes, frame references, images and symbols; images stay on the device.

const editor = (app: App) => app.page.getByRole('dialog', { name: 'Frame editor' });
const artboardSvg = (app: App) => app.page.getByTestId('artboard').locator('svg[data-frame-id]').first();
const png = (name: string, w: number, h: number, rgb: [number, number, number]) => ({ name, mimeType: 'image/png', buffer: makePng(w, h, rgb) });

async function openProject(app: App) {
	await app.signIn();
	await app.createProject();
	await app.chooseOrientation('vertical');
}

/** Runs `fn` on the app's `motia-assets` store; never creates the database (that would block the app's upgrade). */
async function withAssets<T>(app: App, fn: string): Promise<T | null> {
	return app.page.evaluate(async (body) => {
		if (!(await indexedDB.databases()).some((d) => d.name === 'motia-assets')) return null;
		const db = await new Promise<IDBDatabase>((resolve, reject) => {
			const req = indexedDB.open('motia-assets');
			req.onsuccess = () => resolve(req.result);
			req.onerror = () => reject(req.error);
		});
		try {
			const store = db.transaction('assets').objectStore('assets');
			return await new Function('store', body)(store);
		} finally {
			db.close();
		}
	}, fn);
}

const assetCount = async (app: App) =>
	(await withAssets<number>(app, `return new Promise((r) => { const c = store.count(); c.onsuccess = () => r(c.result); })`)) ?? 0;

/** The stored image's real pixel size and type (decoded from the bytes, not the metadata). */
const storedImage = (app: App, id: string) =>
	withAssets<{ width: number; height: number; type: string }>(
		app,
		`return new Promise((r) => { const g = store.get(${JSON.stringify(id)}); g.onsuccess = async () => {
			const bmp = await createImageBitmap(g.result.blob); r({ width: bmp.width, height: bmp.height, type: g.result.blob.type }); }; })`
	);

/** The `<image>` element's href really decodes, at this width. */
const imageHrefWidth = (app: App, selector: string) =>
	app.page.evaluate(async (sel) => {
		const href = document.querySelector(sel)!.getAttribute('href')!;
		return (await createImageBitmap(await (await fetch(href)).blob())).width;
	}, selector);

test('box: a dashed placeholder with its label; an attached image fills it', async ({ app }) => {
	await openProject(app);
	await addFrameAt(app, 5, { keepEditorOpen: true });
	const box = await draw(app, 'Box', { x: 600, y: 300 }, { x: 1000, y: 700 });
	await setField(app, 'label', 'coin');
	const node = artboardSvg(app).locator(`[data-id="${box.id}"]`);
	await expect(node.locator('rect[stroke-dasharray]')).toHaveCount(1);
	await expect(node).toContainText('coin');

	await app.page.getByTestId('file-Add image').setInputFiles(png('coin.png', 64, 64, [255, 200, 0]));
	await expectElement(app, box.id, (el) => typeof el.assetId === 'string');
	await expect(node.locator('image')).toHaveAttribute('preserveAspectRatio', 'xMidYMid slice');
	await expect(node).toContainText('coin');
});

test('frame reference: shows the previous frame, live; nesting stops at depth 2', async ({ app }) => {
	await openProject(app);
	const a = await addFrameAt(app, 5, { keepEditorOpen: true });
	const rect = await draw(app, 'Rectangle', { x: 100, y: 100 }, { x: 500, y: 400 });
	await app.page.keyboard.press('Escape');
	const b = await addFrameAt(app, 7, { keepEditorOpen: true });
	const ref = await draw(app, 'Frame reference', { x: 1000, y: 500 }, { x: 1800, y: 950 });
	expect((ref as { refFrameId: string }).refFrameId).toBe(a.id);
	const shown = artboardSvg(app).locator(`[data-id="${ref.id}"] [data-frame-id="${a.id}"]`);
	await expect(shown.locator(`[data-id="${rect.id}"]`)).toHaveCount(1);
	// The shown frame keeps its own background (the editor draws the outer frame's separately)
	await expect(shown.locator(':scope > rect').first()).toHaveAttribute('fill', a.background);

	// Live: an element added to frame A appears inside B's reference
	await app.press(app.page.getByRole('button', { name: 'Previous frame' }));
	await expect.poll(() => editingId(app)).toBe(a.id);
	const added = await draw(app, 'Ellipse', { x: 1200, y: 200 }, { x: 1500, y: 500 });
	// And A shows B in turn: a loop that must stop
	await draw(app, 'Frame reference', { x: 100, y: 600 }, { x: 600, y: 1000 });
	await expectElement(app, (await elements(app))[2].id, (el) => el.refFrameId === b.id);
	await app.press(app.page.getByRole('button', { name: 'Next frame' }));
	await expect.poll(() => editingId(app)).toBe(b.id);
	await expect(shown.locator(`[data-id="${added.id}"]`)).toHaveCount(1);
	// B shows A (depth 1), which shows B (depth 2), and no deeper
	await expect(artboardSvg(app).locator('[data-frame-id]')).toHaveCount(2);

	// The frame it shows is a choice among the other frames (select the reference again: switching frames clears
	// the selection)
	const c = await app.addFrameViaHook(9);
	await app.tap(await boardToScreen(app, { x: 1400, y: 725 }));
	const picker = app.page.getByTestId('inspector').locator('[name="refFrame"]');
	await expect(picker.locator(`option[value="${b.id}"]`)).toHaveCount(0);
	await picker.selectOption(c);
	await expectElement(app, ref.id, (el) => el.refFrameId === c);
});

test('image: file picker and drag-drop, raster only, downscaled to 2048 px, stored on the device', async ({ app }) => {
	const { page } = app;
	await openProject(app);
	await addFrameAt(app, 5, { keepEditorOpen: true });

	await page.getByTestId('file-Image').setInputFiles(png('wide.png', 3000, 1000, [0, 120, 255]));
	await expect.poll(async () => (await elements(app)).filter((e) => e.type === 'image').length).toBe(1);
	const img = (await elements(app))[0] as { assetId: string; w: number; h: number };
	const meta = (await app.storyboard()).assets.find((x) => x.id === img.assetId)!;
	expect(meta).toMatchObject({ mime: 'image/png', width: 2048, height: 683 });
	expect(await storedImage(app, img.assetId)).toEqual({ width: 2048, height: 683, type: 'image/png' });
	expect(img.w / img.h).toBeCloseTo(3, 1);
	expect(await assetCount(app)).toBe(1);
	await expect(artboardSvg(app).locator(`[data-id] image`)).toHaveCount(1);
	expect(await imageHrefWidth(app, '[data-testid="artboard"] svg[data-frame-id] [data-id] image')).toBe(2048);

	// Drag and drop a file onto the artboard
	const drop = await boardToScreen(app, { x: 1500, y: 800 });
	const bytes = [...makePng(40, 30, [0, 200, 0])];
	await page.evaluate(
		({ x, y, bytes }) => {
			const dt = new DataTransfer();
			dt.items.add(new File([new Uint8Array(bytes)], 'drop.png', { type: 'image/png' }));
			const target = document.elementFromPoint(x, y)!;
			for (const type of ['dragenter', 'dragover', 'drop']) target.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, dataTransfer: dt }));
		},
		{ x: drop.x, y: drop.y, bytes }
	);
	await expect.poll(async () => (await elements(app)).filter((e) => e.type === 'image').length).toBe(2);
	const dropped = (await elements(app))[1] as { x: number; y: number; w: number; h: number };
	expect(dropped.x + dropped.w / 2).toBeCloseTo(1500, -1);
	expect(dropped.y + dropped.h / 2).toBeCloseTo(800, -1);

	// SVG (and anything not PNG/JPEG/WebP/GIF by its bytes) is refused with a message, nothing added
	await page.getByTestId('file-Image').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: svgFile });
	await expect(editor(app).getByRole('alert')).toContainText('Only PNG, JPEG, WebP and GIF images can be used.');
	expect((await elements(app)).length).toBe(2);
	expect(await assetCount(app)).toBe(2);
});

test('symbols: save a box, place it, rename it, change its image for every instance', async ({ app }) => {
	const { page } = app;
	await openProject(app);
	await addFrameAt(app, 5, { keepEditorOpen: true });
	const box = await draw(app, 'Box', { x: 200, y: 200 }, { x: 500, y: 500 });
	await setField(app, 'label', 'coin');
	await app.press(page.getByRole('button', { name: 'Save as symbol' }));
	await expect.poll(async () => (await app.storyboard()).symbols.map((s) => s.label)).toEqual(['coin']);
	const symbolId = (await app.storyboard()).symbols[0].id;
	await expectElement(app, box.id, (el) => el.symbolId === symbolId && el.label === undefined);

	await app.press(page.getByRole('button', { name: 'Symbols' }));
	const popover = page.getByRole('dialog', { name: 'Symbols' });
	await app.press(popover.getByRole('button', { name: /place/ }));
	await expect.poll(async () => (await elements(app)).filter((e) => (e as { symbolId?: string }).symbolId === symbolId).length).toBe(2);

	// Rename: every instance shows the new name
	await app.press(page.getByRole('button', { name: 'Symbols' }));
	const name = popover.locator('[name="symbol-label"]');
	await name.fill('gold coin');
	await name.press('Enter');
	await expect.poll(async () => (await app.storyboard()).symbols[0].label).toBe('gold coin');
	const instances = artboardSvg(app).locator('[data-type="box"]');
	await expect(instances).toHaveCount(2);
	for (const i of [0, 1]) await expect(instances.nth(i)).toContainText('gold coin');

	// Change the symbol's image: both instances show it
	await page.getByTestId('file-Change image of gold coin').setInputFiles(png('gold.png', 50, 50, [255, 215, 0]));
	await expect.poll(async () => typeof (await app.storyboard()).symbols[0].assetId).toBe('string');
	await expect(instances.locator('image')).toHaveCount(2);
	await page.screenshot({ path: `test-results/m5-symbols-${app.touch ? 'touch' : 'desktop'}.png` });
});

test('images are local: the cloud copy holds no image bytes; another browser shows "Image missing"', async ({ app, browser }, testInfo) => {
	const { page } = app;
	await openProject(app);
	const f = await addFrameAt(app, 5, { keepEditorOpen: true });
	// Random pixels: about 190 KB that can't be compressed, so image bytes in any form would break the size limit
	await page.getByTestId('file-Image').setInputFiles({ name: 'photo.png', mimeType: 'image/png', buffer: makePng(256, 256, 'noise') });
	await expect.poll(async () => (await elements(app)).length).toBe(1);
	await app.press(page.getByRole('button', { name: 'Close frame editor' }));
	await expect.poll(async () => (await app.storedStoryboard())?.frames[0].elements.length).toBe(1);

	// The stored doc has the image's metadata only: no data URLs, no base64, small
	const stored = JSON.stringify(await app.notesDoc());
	expect(stored).not.toContain('data:');
	expect(stored).not.toMatch(/base64/i);
	expect(new TextEncoder().encode(stored).length).toBeLessThan(20_000);
	expect((await app.storedStoryboard())!.assets).toHaveLength(1);

	// Another browser (no local images, no local audio): the image shows as missing
	const use = testInfo.project.use;
	const other = new App(await browser.newPage({ viewport: use.viewport ?? undefined, hasTouch: use.hasTouch }), app.touch);
	await other.init();
	await other.signIn();
	await other.page.goto(`/project/${app.projectId()}`);
	await other.waitForBoard();
	other.orientation = app.orientation;
	const card = await frameById(other, f.id);
	expect(card.elements).toHaveLength(1);
	const grip = await cardGrip(other, f.id);
	await other.doubleTap(grip);
	await expect(other.page.getByRole('dialog', { name: 'Frame editor' })).toBeVisible();
	await expect(other.page.getByTestId('artboard')).toContainText('Image missing');
	await other.page.close();
});
