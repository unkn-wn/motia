import { test, expect, App } from './support/app';
import { mergeDoc, projectMetaPath, projectNotesPath, writeDoc } from './support/emulator';
import { addFrameAt, cardGrip, seekTo } from './support/frames';
import type { StoryboardDoc } from '../src/features/storyboard/types';

// M7: the index rail and Find replace the notes sidebar; notes are edited and recoloured on the canvas.

const rail = (app: App) => app.page.getByTestId('index-rail');
const mark = (app: App, id: string) => rail(app).locator(`[data-id="${id}"]`);

const NOTES = [
	{ id: 'n_intro', time: 3, content: 'intro builds', color: 'yellow', canvasX: 220, canvasY: 300 },
	{ id: 'n_tilt', time: 14.5, content: 'borders tilt here\nthen hold', color: 'blue', canvasX: 220, canvasY: 1500 },
];

const STORYBOARD: StoryboardDoc = {
	version: 1,
	board: { width: 1920, height: 1080 },
	symbols: [],
	assets: [],
	frames: [
		{ id: 'f_check', time: 8, endTime: 11, title: 'Checkered', notes: '', background: '#171717', canvasX: -520, canvasY: 800, elements: [] },
		{
			id: 'f_spiky',
			time: 20,
			title: 'Spiky',
			notes: 'tilt opposite ways',
			background: '#171717',
			canvasX: -520,
			canvasY: 2000,
			elements: [{ id: 'e_coin', type: 'box', x: 100, y: 100, w: 300, h: 300, rotation: 0, label: 'gold coin' }],
		},
	],
};

type Range = { start: number; end: number };
type Pt = { x: number; y: number };

/** A project with two notes and two frames, written as the app stores them, then loaded. */
async function openSeeded(app: App, orientation: 'vertical' | 'horizontal') {
	await app.signIn();
	await app.createProject();
	await app.chooseOrientation(orientation);
	await app.saveAndWaitForStoryboard((doc) => doc.frames.length === 0);
	const notes = NOTES.map((n) => ({ ...n, createdAt: '2026-01-01T00:00:00.000Z' }));
	await writeDoc(projectNotesPath(app.uid, app.projectId()), { notes, compressed: '[]', storyboard: JSON.stringify(STORYBOARD), version: 50 });
	await app.reload();
	await expect.poll(async () => (await app.storyboard()).frames.length).toBe(2);
	await expect(rail(app).locator('[data-rail-kind]')).toHaveCount(4);
	await app.settled();
}

/** Where a time sits on the rail's strip (page coordinates of its centre line), over the song range in use. */
async function railPoint(app: App, time: number, range?: Range): Promise<Pt> {
	const strip = (await app.page.getByTestId('rail-strip').boundingBox())!;
	const r = range ?? { start: 0, end: (await app.time()).duration };
	const f = (time - r.start) / (r.end - r.start);
	return app.orientation === 'horizontal'
		? { x: strip.x + f * strip.width, y: strip.y + strip.height / 2 }
		: { x: strip.x + strip.width / 2, y: strip.y + f * strip.height };
}

const centre = async (box: Promise<{ x: number; y: number; width: number; height: number } | null>): Promise<Pt> => {
	const b = (await box)!;
	return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};

const realErrors = (app: App) => app.errors.filter((e) => !/Failed to load resource/.test(e));

/** Distance along the rail between a mark's centre and where its time should be. */
async function markOffset(app: App, id: string, time: number, range?: Range) {
	const c = await centre(mark(app, id).boundingBox());
	const p = await railPoint(app, time, range);
	return Math.abs(app.orientation === 'horizontal' ? c.x - p.x : c.y - p.y);
}

type Box = { x: number; y: number; width: number; height: number };

/**
 * Shows a mark's preview: hover (desktop), or press and hold (touch; it shows while held, and release doesn't jump).
 * Returns its text and box. On touch both are recorded in the page the moment it appears, so a slow test runner can't
 * miss it.
 */
async function showPreview(app: App, id: string): Promise<{ text: string; box: Box }> {
	const preview = app.page.getByTestId('rail-preview');
	const p = await centre(mark(app, id).boundingBox());
	// Nothing previewed before (on desktop: the pointer off every mark)
	if (!app.touch) await app.page.mouse.move(5, 5);
	await expect(preview).toBeHidden();
	if (app.touch) {
		// The raw gesture doesn't check what is under the finger (Playwright's taps do): wait until it is the mark
		await expect
			.poll(() => app.page.evaluate(({ q, id }) => !!document.elementFromPoint(q.x, q.y)?.closest(`[data-id="${id}"]`), { q: p, id }))
			.toBe(true);
		const time = (await app.time()).current;
		await app.page.evaluate(() => {
			const w = window as unknown as { __preview?: { text: string; box: Box } | null; __previewWatch?: MutationObserver };
			w.__preview = null;
			w.__previewWatch?.disconnect();
			w.__previewWatch = new MutationObserver(() => {
				const el = document.querySelector<HTMLElement>('[data-testid="rail-preview"]');
				if (!el || w.__preview) return;
				const r = el.getBoundingClientRect();
				w.__preview = { text: el.innerText, box: { x: r.x, y: r.y, width: r.width, height: r.height } };
			});
			w.__previewWatch.observe(document.body, { childList: true, subtree: true, characterData: true });
		});
		await app.longPress(p, async () => {});
		const seen = await app.page.evaluate(() => {
			const w = window as unknown as { __preview?: { text: string; box: Box } | null; __previewWatch?: MutationObserver };
			w.__previewWatch?.disconnect();
			return w.__preview ?? null;
		});
		expect(seen, 'the preview showed while held').not.toBeNull();
		await expect(preview).toBeHidden();
		expect((await app.time()).current).toBeCloseTo(time, 1);
		return seen!;
	}
	await app.page.mouse.move(p.x, p.y);
	await expect(preview).toBeVisible();
	return { text: await preview.innerText(), box: (await preview.boundingBox())! };
}

const doubleClick = (app: App, p: Pt) => app.doubleTap(p);

/** How far the view's centre is from a world point, in screen pixels. */
async function centredOn(app: App, world: Pt) {
	const canvas = await app.canvasBox();
	const at = await app.toScreen(world);
	return Math.max(Math.abs(at.x - (canvas.x + canvas.width / 2)), Math.abs(at.y - (canvas.y + canvas.height / 2)));
}

const tiltNoteCentre = { x: NOTES[1].canvasX + 120, y: NOTES[1].canvasY + 20 };

for (const orientation of ['vertical', 'horizontal'] as const) {
	test.describe(orientation, () => {
		const horizontal = orientation === 'horizontal';
		const along = (p: Pt) => (horizontal ? p.x : p.y);

		test('rail: marks at their times; click jumps; dragging the window pans; a press on it seeks', async ({ app }) => {
			await openSeeded(app, orientation);

			// One mark per note and frame, centred on its time (±2 px); a span is a bar of its length
			for (const item of [...NOTES, ...STORYBOARD.frames])
				await expect.poll(() => markOffset(app, item.id, item.time), { message: item.id }).toBeLessThanOrEqual(2);
			const span = (await rail(app).locator('[data-rail-span="f_check"]').boundingBox())!;
			const spanPx = along(await railPoint(app, 11)) - along(await railPoint(app, 8));
			expect(Math.abs((horizontal ? span.width : span.height) - spanPx)).toBeLessThanOrEqual(2);

			// Click a mark: the playhead goes there and the item is centred in view
			await app.press(mark(app, 'n_tilt'));
			await expect.poll(async () => (await app.time()).current).toBeCloseTo(14.5, 1);
			expect(await centredOn(app, tiltNoteCentre)).toBeLessThanOrEqual(2);
			const expected = along(await railPoint(app, 14.5));
			await expect.poll(async () => Math.abs(along(await centre(app.page.getByTestId('rail-playhead').boundingBox())) - expected)).toBeLessThanOrEqual(2);

			// Drag the window along the rail: the canvas pans the same way, and the window follows
			const win = app.page.getByTestId('rail-window');
			// A point of the window with no mark on top (a mark under the pointer is a click on the mark)
			const freePoint = () =>
				app.page.evaluate((h) => {
					const w = document.querySelector('[data-testid="rail-window"]')!.getBoundingClientRect();
					for (let i = 0.5; i < 1; i += 0.05)
						for (const k of [i, 1 - i]) {
							const p = h ? { x: w.left + k * w.width, y: w.top + w.height / 2 } : { x: w.left + w.width / 2, y: w.top + k * w.height };
							if (document.elementFromPoint(p.x, p.y)?.getAttribute('data-testid') === 'rail-window') return p;
						}
					throw new Error('window covered by marks');
				}, horizontal);
			// The window's edges (one may sit clamped at an end of the rail)
			const edges = async () => {
				const b = (await win.boundingBox())!;
				return horizontal ? [b.x, b.x + b.width] : [b.y, b.y + b.height];
			};
			const from = await freePoint();
			const edgesBefore = await edges();
			const before = await app.transform();
			await app.drag(from, horizontal ? { x: from.x + 40, y: from.y } : { x: from.x, y: from.y + 40 });
			const after = await app.transform();
			if (horizontal) expect(after.offsetX).toBeLessThan(before.offsetX - 10);
			else expect(after.offsetY).toBeLessThan(before.offsetY - 10);
			const moves = (await edges()).map((v, i) => v - edgesBefore[i]);
			expect(Math.max(...moves.map((d) => -Math.abs(d - 40)))).toBeGreaterThanOrEqual(-3);
			await app.page.screenshot({ path: `test-results/m7-rail-${orientation}-${app.touch ? 'touch' : 'desktop'}.png` });

			// A press on the window that doesn't move seeks there, like the rest of the rail
			const press = await freePoint();
			const strip = (await app.page.getByTestId('rail-strip').boundingBox())!;
			const { duration } = await app.time();
			const pressTime = horizontal ? ((press.x - strip.x) / strip.width) * duration : ((press.y - strip.y) / strip.height) * duration;
			if (app.touch) await app.tap(press);
			else await app.page.mouse.click(press.x, press.y);
			await expect.poll(async () => (await app.time()).current).toBeCloseTo(pressTime, 0);
			expect(realErrors(app)).toEqual([]);
		});

		test('rail: previews; the active item is highlighted during playback; a trimmed song', async ({ app }) => {
			const { page } = app;
			await openSeeded(app, orientation);
			const preview = page.getByTestId('rail-preview');
			expect((await showPreview(app, 'n_tilt')).text).toContain('borders tilt here');
			const framePreview = (await showPreview(app, 'f_spiky')).text;
			expect(framePreview).toContain('Spiky');
			expect(framePreview).toContain('0:20.0');
			if (!app.touch) {
				await expect(preview.locator('svg[data-frame-id="f_spiky"]')).toHaveCount(1);
				await page.screenshot({ path: `test-results/m7-preview-${orientation}-desktop.png` });
			}

			// Seek before the first frame by clicking the empty rail, then play: the highlight moves onto it
			const before = await railPoint(app, 7);
			if (app.touch) await app.tap(before);
			else await page.mouse.click(before.x, before.y);
			await expect.poll(async () => (await app.time()).current).toBeCloseTo(7, 0);
			await expect(rail(app).locator('[data-active]')).toHaveAttribute('data-id', 'n_intro');
			await app.press(page.getByTitle('Play', { exact: true }));
			await expect(rail(app).locator('[data-active]')).toHaveAttribute('data-id', 'f_check', { timeout: 5000 });
			await app.press(page.getByTitle('Pause', { exact: true }));

			// A trimmed song (5 s to 21 s): the rail covers only that range; what lies outside isn't on it
			const meta = (await app.metaDoc())!;
			await mergeDoc(projectMetaPath(app.uid, app.projectId()), { audio: { ...(meta.audio as object), trimStart: 5, trimEnd: 21 } });
			await app.reload();
			const range = { start: 5, end: 21 };
			await expect(rail(app).locator('[data-rail-kind]')).toHaveCount(3);
			await expect(mark(app, 'n_intro')).toHaveCount(0);
			for (const item of [NOTES[1], ...STORYBOARD.frames])
				await expect.poll(() => markOffset(app, item.id, item.time, range), { message: item.id }).toBeLessThanOrEqual(2);
			// Near the rail's end the preview stays inside the canvas area
			const { box } = await showPreview(app, 'f_spiky');
			const canvas = await app.canvasBox();
			expect(box.x).toBeGreaterThanOrEqual(canvas.x);
			expect(box.x + box.width).toBeLessThanOrEqual(canvas.x + canvas.width);
			expect(box.y).toBeGreaterThanOrEqual(canvas.y);
			expect(box.y + box.height).toBeLessThanOrEqual(canvas.y + canvas.height);
			expect(realErrors(app)).toEqual([]);
		});

		test('find: notes, frame titles, frame notes and element labels; keys; Enter jumps', async ({ app }) => {
			const { page } = app;
			await openSeeded(app, orientation);
			const find = page.getByRole('dialog', { name: 'Find' });
			const input = find.getByRole('combobox');
			const results = find.getByRole('option');

			await page.keyboard.press('/');
			await expect(find).toBeVisible();
			// Typing in Find never reaches the canvas shortcuts (B rail, W frame, Space play)
			const time = (await app.time()).current;
			await page.keyboard.type('bw ');
			await expect(input).toHaveValue('bw ');
			await expect(rail(app)).toBeVisible();
			expect((await app.storyboard()).frames).toHaveLength(2);
			await page.waitForTimeout(300);
			expect((await app.time()).current).toBeCloseTo(time, 2);

			await input.fill('tilt');
			// Time order: the note's matching line, then the frame with its title and the matching frame note
			await expect(results).toHaveText([/0:14\.5\s*borders tilt here/, /0:20\.0\s*Spiky · tilt opposite ways/]);
			await page.screenshot({ path: `test-results/m7-find-${orientation}-${app.touch ? 'touch' : 'desktop'}.png` });
			await input.fill('GOLD');
			await expect(results).toHaveText([/Spiky · gold coin/]);
			await input.fill('checkered');
			await expect(results).toHaveText([/0:08\.0\s*Checkered/]);
			await page.keyboard.press('Escape');
			await expect(find).toBeHidden();

			// Ctrl+F opens it too; ↓ then Enter jumps to the second result (seek + centre)
			await page.keyboard.press('Control+f');
			await input.fill('i');
			await expect(results.first()).toHaveAttribute('aria-selected', 'true');
			await page.keyboard.press('ArrowDown');
			await expect(results.nth(1)).toHaveAttribute('aria-selected', 'true');
			await expect(input).toHaveAttribute('aria-activedescendant', (await results.nth(1).getAttribute('id'))!);
			const second = await results.nth(1).getAttribute('data-id');
			await page.keyboard.press('Enter');
			await expect(find).toBeHidden();
			const target = [...NOTES, ...STORYBOARD.frames].find((x) => x.id === second)!;
			await expect.poll(async () => (await app.time()).current).toBeCloseTo(target.time, 1);

			// The search icon at the top of the rail opens it as well
			await app.press(rail(app).getByRole('button', { name: 'Find' }));
			await expect(find).toBeVisible();
			expect(realErrors(app)).toEqual([]);
		});

		test('canvas: double-click edits a note or opens a frame while following; menu colour; B; Ctrl+F in the editor', async ({ app }) => {
			const { page } = app;
			await openSeeded(app, orientation);
			const noteGrip = () => app.toScreen({ x: NOTES[0].canvasX + 30, y: NOTES[0].canvasY + 14 });

			// Double-click (double-tap) a note: the inline editor
			await doubleClick(app, await noteGrip());
			const editor = page.getByPlaceholder('Edit note...');
			await expect(editor).toBeVisible();
			await editor.fill('intro builds slowly');
			await editor.press('Control+Enter');
			await expect.poll(async () => (await app.textNotes()).find((n) => n.id === 'n_intro')?.content).toBe('intro builds slowly');

			// Colour from the note's menu, then undo and redo (the first click seeked, so find the note again)
			await app.canvasMenu(await noteGrip(), 'green', 'menuitemradio');
			await expect.poll(async () => (await app.textNotes()).find((n) => n.id === 'n_intro')?.color).toBe('green');
			await expect(mark(app, 'n_intro').locator('span')).toHaveCSS('background-color', 'rgb(34, 197, 94)');
			await app.undo();
			await expect.poll(async () => (await app.textNotes()).find((n) => n.id === 'n_intro')?.color).toBe('yellow');
			await app.redo();
			await expect.poll(async () => (await app.textNotes()).find((n) => n.id === 'n_intro')?.color).toBe('green');

			// A frame card seconds away from the playhead, with the view following it: the first click seeks and the
			// view moves, yet the double-click opens that frame
			const f = await addFrameAt(app, 2);
			await seekTo(app, 0);
			// Follow the playhead again (a click on the canvas stops following)
			await app.press(page.getByTitle('Recenter to playhead'));
			const before = await app.transform();
			await doubleClick(app, await cardGrip(app, f.id));
			// In vertical the view moved between the clicks (it follows the playhead to the frame's time), so the
			// second click landed off the card's header
			if (!horizontal) expect((await app.transform()).offsetY).not.toBeCloseTo(before.offsetY, 0);
			await expect(page.getByRole('dialog', { name: 'Frame editor' })).toBeVisible();
			await expect.poll(() => page.evaluate(() => window.__motiaTest?.editingFrameId)).toBe(f.id);
			// With the frame editor open, Ctrl+F is not taken by Find
			await page.keyboard.press('Control+f');
			await expect(page.getByRole('dialog', { name: 'Find' })).toHaveCount(0);
			await app.press(page.getByRole('button', { name: 'Close frame editor' }));

			// B hides and shows the rail
			await page.keyboard.press('b');
			await expect(rail(app)).toHaveCount(0);
			await page.keyboard.press('b');
			await expect(rail(app)).toBeVisible();
			expect(realErrors(app)).toEqual([]);
		});

		test('without the song on this device: Find jumps and centres; double-click still edits a note', async ({ app, browser }, testInfo) => {
			await openSeeded(app, orientation);
			const use = testInfo.project.use;
			const other = new App(await browser.newPage({ viewport: use.viewport ?? undefined, hasTouch: use.hasTouch }), app.touch);
			await other.init();
			await other.signIn();
			await other.page.goto(`/project/${app.projectId()}`);
			await other.waitForBoard();
			other.orientation = orientation;
			const page = other.page;

			await page.keyboard.press('/');
			await page.getByRole('dialog', { name: 'Find' }).getByRole('combobox').fill('tilt');
			await page.keyboard.press('Enter');
			await expect.poll(() => centredOn(other, tiltNoteCentre)).toBeLessThanOrEqual(2);
			await doubleClick(other, await other.toScreen({ x: NOTES[1].canvasX + 30, y: NOTES[1].canvasY + 14 }));
			await expect(page.getByPlaceholder('Edit note...')).toBeVisible();
			expect(realErrors(other)).toEqual([]);
			await page.close();
		});
	});
}
