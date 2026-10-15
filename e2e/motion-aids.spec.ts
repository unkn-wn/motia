import { test, expect, type App } from './support/app';
import { addFrameAt, frameById, frames, seekTo } from './support/frames';
import { boardToScreen, draw, dragOnBoard, editingId, elements, setField } from './support/editor';
import type { Frame } from '../src/features/storyboard/types';

// M4: duplicate with kept ids, onion skin, the frame strip, the group tag, and the preview monitor.

const editor = (app: App) => app.page.getByRole('dialog', { name: 'Frame editor' });
const strip = (app: App) => app.page.getByTestId('frame-strip');
const CARD_W = 240;
const CARD_H = 28 + 240 * (1080 / 1920);

async function openProject(app: App) {
	await app.signIn();
	await app.createProject();
	await app.chooseOrientation('vertical');
}

const overlaps = (a: Frame, b: Frame) =>
	a.canvasX < b.canvasX + CARD_W && b.canvasX < a.canvasX + CARD_W && a.canvasY < b.canvasY + CARD_H && b.canvasY < a.canvasY + CARD_H;

test('duplicate keeps element ids; editing a copy leaves the others unchanged; copies get their own place', async ({ app }) => {
	await openProject(app);
	const f = await addFrameAt(app, 5, { keepEditorOpen: true });
	const rect = await draw(app, 'Rectangle', { x: 300, y: 300 }, { x: 600, y: 500 });
	const x0 = (rect as { x: number }).x;

	await app.press(strip(app).getByRole('button', { name: /duplicate/ }));
	await expect.poll(async () => (await frames(app)).length).toBe(2);
	const copy = (await frames(app)).find((x) => x.id !== f.id)!;
	expect(copy.time).toBeCloseTo(5.5, 6);
	expect(copy.elements.map((e) => e.id)).toEqual([rect.id]);
	// Duplicate stays on the current frame
	expect(await editingId(app)).toBe(f.id);

	// "New frame from this" opens the new frame, same objects
	await app.press(strip(app).getByRole('button', { name: /new frame from this/ }));
	await expect.poll(() => editingId(app)).not.toBe(f.id);
	const fromThis = (await editingId(app))!;
	expect(fromThis).not.toBe(copy.id);
	expect((await elements(app)).map((e) => e.id)).toEqual([rect.id]);

	// Move the element in the new frame: the source and the first copy keep theirs where it was
	await dragOnBoard(app, { x: 450, y: 400 }, { x: 650, y: 500 });
	await expect.poll(async () => ((await elements(app))[0] as { x: number }).x).toBeGreaterThan(x0 + 100);
	expect(((await frameById(app, f.id)).elements[0] as { x: number }).x).toBeCloseTo(x0, 6);
	expect(((await frameById(app, copy.id)).elements[0] as { x: number }).x).toBeCloseTo(x0, 6);

	// The three cards don't sit on top of each other on the canvas
	const all = await frames(app);
	for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) expect(overlaps(all[i], all[j])).toBe(false);
});

test('onion skin ghosts the previous frame by time (and optionally the next) at 30 %, not selectable', async ({ app }) => {
	await openProject(app);
	// Created out of time order: the 8 s frame first
	const late = await addFrameAt(app, 8, { keepEditorOpen: true });
	const lateRect = await draw(app, 'Ellipse', { x: 1300, y: 600 }, { x: 1600, y: 900 });
	await app.page.keyboard.press('Escape');
	const early = await addFrameAt(app, 5, { keepEditorOpen: true });
	const earlyRect = await draw(app, 'Rectangle', { x: 100, y: 100 }, { x: 400, y: 300 });
	await app.page.keyboard.press('Escape');
	const middle = await addFrameAt(app, 6.5, { keepEditorOpen: true });
	// Something of this frame's own, elsewhere
	await draw(app, 'Rectangle', { x: 900, y: 100 }, { x: 1000, y: 200 });

	const onion = editor(app).getByTestId('onion-skin');
	await expect(onion).toHaveCount(0);
	await app.press(editor(app).getByRole('button', { name: /onion/ }));
	await expect(onion).toHaveCount(1);
	await expect(onion).toHaveCSS('opacity', '0.3');
	// The previous frame by time is the 5 s one, not the one created just before
	await expect(onion.locator(`[data-id="${earlyRect.id}"]`)).toHaveCount(1);
	await expect(onion.locator(`[data-id="${lateRect.id}"]`)).toHaveCount(0);

	// Not interactive: a tap on the ghost selects nothing, a drag over it changes nothing
	await app.tap(await boardToScreen(app, { x: 250, y: 200 }));
	await expect(app.page.getByTestId('inspector')).toHaveAttribute('aria-label', 'Frame properties');
	await dragOnBoard(app, { x: 250, y: 200 }, { x: 450, y: 300 });
	expect(((await frameById(app, early.id)).elements[0] as { x: number }).x).toBe((earlyRect as { x: number }).x);

	// + next adds the 8 s frame
	await app.press(editor(app).getByRole('button', { name: '+ next' }));
	await expect(onion).toHaveCount(2);
	await expect(editor(app).locator(`[data-testid="onion-skin"] [data-id="${lateRect.id}"]`)).toHaveCount(1);
	expect(await editingId(app)).toBe(middle.id);
	expect(late.id).not.toBe(early.id);
});

test('frame strip: neighbours switch frames, the waveform seeks, play from frame plays from the frame', async ({ app }) => {
	await openProject(app);
	const a = await addFrameAt(app, 3);
	const b = await addFrameAt(app, 6);
	await addFrameAt(app, 9, { keepEditorOpen: true });

	const thumbs = strip(app).getByRole('button', { name: /^Frame at/ });
	await expect(thumbs).toHaveCount(3);
	await app.press(thumbs.nth(1));
	await expect.poll(() => editingId(app)).toBe(b.id);
	await expect(thumbs.nth(1)).toHaveAttribute('aria-current', 'true');
	await app.press(thumbs.nth(0));
	await expect.poll(() => editingId(app)).toBe(a.id);

	// Click the strip waveform: seeks within the shown range
	const wave = strip(app).getByTestId('strip-waveform');
	const start = Number(await wave.getAttribute('data-start'));
	const span = Number(await wave.getAttribute('data-span'));
	const box = (await wave.boundingBox())!;
	await app.tap({ x: box.x + box.width * 0.8, y: box.y + box.height / 2 });
	await expect.poll(async () => (await app.time()).current).toBeCloseTo(start + span * 0.8, 0);
	expect(start + span * 0.8).toBeGreaterThan(a.time + 1);

	// Play from frame: jumps back to the frame, then plays on
	await app.press(strip(app).getByRole('button', { name: /play from frame/ }));
	await expect.poll(async () => (await app.time()).current).toBeLessThan(a.time + 0.5);
	await expect.poll(async () => (await app.time()).current).toBeGreaterThan(a.time + 0.2);
	await app.page.keyboard.press(' ');
});

test('the group tag is free text (trimmed), shown in the strip', async ({ app }) => {
	await openProject(app);
	const f = await addFrameAt(app, 5, { keepEditorOpen: true });
	await setField(app, 'frame-group', '  shot 3  ');
	await expect.poll(async () => (await frameById(app, f.id)).group).toBe('shot 3');
	await expect(strip(app).getByRole('button', { name: /^Frame at/ }).first()).toContainText('shot 3');
	await expect(app.page.getByTestId('inspector').locator('[name="frame-group"]')).toHaveValue('shot 3');
	await setField(app, 'frame-group', '');
	await expect.poll(async () => 'group' in (await frameById(app, f.id))).toBe(false);
});

test('preview monitor: off by default, switches within one animation frame of each frame time, moves to a corner', async ({ app }) => {
	const { page } = app;
	await openProject(app);
	const f1 = await addFrameAt(app, 1);
	const f2 = await addFrameAt(app, 2);
	const monitor = page.getByTestId('preview-monitor');
	await expect(monitor).toHaveCount(0);
	await app.press(page.getByTitle('Show preview'));
	await expect(monitor).toBeVisible();

	await seekTo(app, 0.5);
	await expect(monitor).toHaveAttribute('data-frame-id', '');
	await seekTo(app, 1.5);
	await expect(monitor).toHaveAttribute('data-frame-id', f1.id);

	// During playback, sample (playhead, shown frame) every animation frame
	await seekTo(app, 0.6);
	await page.evaluate(() => {
		const el = document.querySelector('[data-testid="preview-monitor"]')!;
		const samples: Array<[number, string]> = [];
		(window as unknown as { __samples: typeof samples }).__samples = samples;
		const tick = () => {
			samples.push([window.__motiaTest!.time!().current, el.getAttribute('data-frame-id') ?? '']);
			if (samples.length < 600) requestAnimationFrame(tick);
		};
		requestAnimationFrame(tick);
	});
	await page.keyboard.press(' ');
	await expect.poll(async () => (await app.time()).current, { timeout: 5000 }).toBeGreaterThan(2.3);
	await page.keyboard.press(' ');
	const samples = await page.evaluate(() => (window as unknown as { __samples: Array<[number, string]> }).__samples);
	const expected = (t: number) => (t >= 2 ? f2.id : t >= 1 ? f1.id : '');
	// Never ahead of time, and at most one animation frame behind the playhead
	for (let i = 0; i < samples.length; i++) {
		const [t, shown] = samples[i];
		if (shown === expected(t)) continue;
		const prev = samples[i - 1];
		expect(prev && expected(prev[0]) === shown, `at ${t.toFixed(3)} s showed ${shown || 'none'}`).toBe(true);
	}
	expect(samples.some(([, s]) => s === f1.id)).toBe(true);
	expect(samples.some(([, s]) => s === f2.id)).toBe(true);

	// A click on the header doesn't move it; a drag to the top-left quadrant snaps it there
	const header = monitor.getByText('Preview', { exact: true });
	const hb = (await header.boundingBox())!;
	await app.tap({ x: hb.x + 10, y: hb.y + 5 });
	await expect(monitor).toHaveAttribute('data-corner', 'br');
	await app.drag({ x: hb.x + 10, y: hb.y + 5 }, { x: 150, y: 150 });
	await expect(monitor).toHaveAttribute('data-corner', 'tl');

	// Covered by the frame editor while it is open
	await app.page.keyboard.press('w');
	await expect(editor(app)).toBeVisible();
	await expect(monitor).toHaveCount(0);
	await app.page.keyboard.press('Escape');
	await expect(monitor).toBeVisible();
	await app.press(page.getByRole('button', { name: 'Close preview' }));
	await expect(monitor).toHaveCount(0);
});
