import { test, expect, type App, type Pt } from './support/app';
import { addFrameAt, anchorOnScreen, axis, cardGrip, frameById, frames, seekTo } from './support/frames';
import { boundsOf, strokesOf } from './support/strokes';
import type { Frame } from '../src/features/storyboard/types';
import { boardToScreen, draw } from './support/editor';

// M2: frames on the main canvas, in both orientations, with mouse (desktop) and touch.

const CARD_H = 28 + 240 * (1080 / 1920);

const editingFrameId = (app: App) => app.page.evaluate(() => window.__motiaTest?.editingFrameId ?? null);

async function closeEditor(app: App) {
	await app.page.evaluate(() => window.__motiaTest!.closeFrameEditor!());
	await expect.poll(() => editingFrameId(app)).toBeNull();
}

/** Polls a frame until `check` holds (state settles a render after input). */
async function expectFrame(app: App, id: string, check: (f: Frame) => boolean) {
	await expect.poll(async () => check(await frameById(app, id))).toBe(true);
}

/** Counts requestAnimationFrame calls over one second. */
function rafCallsOverOneSecond(app: App) {
	return app.page.evaluate(
		() =>
			new Promise<number>((resolve) => {
				let n = 0;
				const original = window.requestAnimationFrame;
				window.requestAnimationFrame = (cb) => {
					n += 1;
					return original(cb);
				};
				setTimeout(() => {
					window.requestAnimationFrame = original;
					resolve(n);
				}, 1000);
			})
	);
}

for (const orientation of ['vertical', 'horizontal'] as const) {
	test.describe(`${orientation}`, () => {
		const along = (p: Pt, d: number) => (orientation === 'horizontal' ? { x: p.x + d, y: p.y } : { x: p.x, y: p.y + d });

		test.beforeEach(async ({ app }) => {
			await app.signIn();
			await app.createProject();
			await app.chooseOrientation(orientation);
		});

		test('add a frame with the dock button and with W', async ({ app }) => {
			const first = await addFrameAt(app, 5, { keepEditorOpen: true });
			expect(first.time).toBeCloseTo(5, 1);
			expect(await editingFrameId(app)).toBe(first.id);
			await closeEditor(app);

			await app.page.keyboard.press('w');
			await expect.poll(async () => (await frames(app)).length).toBe(2);
			const second = (await frames(app))[1];
			expect(second.time).toBe(first.time);
			expect(await editingFrameId(app)).toBe(second.id);
			// Same time → stacked past the first card instead of on top of it
			if (orientation === 'vertical') {
				expect(second.canvasX).toBe(first.canvasX);
				expect(second.canvasY).toBeGreaterThan(first.canvasY);
			} else {
				expect(second.canvasY).toBe(first.canvasY);
				expect(second.canvasX).toBeGreaterThan(first.canvasX);
			}
			await app.page.screenshot({ path: `test-results/m2-${orientation}-${app.touch ? 'touch' : 'desktop'}.png` });
		});

		test('drag a card: it moves, its time does not; undo/redo', async ({ app }) => {
			const f = await addFrameAt(app, 5);
			const { scale } = await app.transform();
			const grip = await cardGrip(app, f.id);
			await app.drag(grip, { x: grip.x - 90, y: grip.y + 60 });
			const moved = await frameById(app, f.id);
			expect(moved.canvasX - f.canvasX).toBeCloseTo(-90 / scale, 0);
			expect(moved.canvasY - f.canvasY).toBeCloseTo(60 / scale, 0);
			expect(moved.time).toBe(f.time);

			await app.undo();
			await expectFrame(app, f.id, (x) => x.canvasX === f.canvasX && x.canvasY === f.canvasY);
			await app.redo();
			await expectFrame(app, f.id, (x) => x.canvasX === moved.canvasX && x.canvasY === moved.canvasY);
		});

		test('drag the anchor dot: retimes by the dragged distance; undo/redo', async ({ app }) => {
			const f = await addFrameAt(app, 5);
			const a = await axis(app);
			const { scale } = await app.transform();
			const dot = await anchorOnScreen(app, f.time);
			await app.drag(dot, along(dot, 120));
			const retimed = await frameById(app, f.id);
			expect(Math.abs(retimed.time - (f.time + 120 / scale / a.perSecond))).toBeLessThanOrEqual(1 / 30);
			expect(retimed).toMatchObject({ canvasX: f.canvasX, canvasY: f.canvasY });

			await app.undo();
			await expectFrame(app, f.id, (x) => x.time === f.time);
			await app.redo();
			await expectFrame(app, f.id, (x) => x.time === retimed.time);
		});

		test('span: set end, drag the end tick, drop it on the start, clear end; each undo/redo', async ({ app }) => {
			const f = await addFrameAt(app, 5);
			await seekTo(app, 7);
			await app.canvasMenu(await cardGrip(app, f.id), 'Set end to playhead');
			await expectFrame(app, f.id, (x) => Math.abs((x.endTime ?? 0) - 7) < 0.05);
			const end = (await frameById(app, f.id)).endTime!;
			await app.undo();
			await expectFrame(app, f.id, (x) => x.endTime === undefined);
			await app.redo();
			await expectFrame(app, f.id, (x) => x.endTime === end);

			const a = await axis(app);
			const { scale } = await app.transform();
			const tick = await anchorOnScreen(app, end);
			await app.drag(tick, along(tick, 60));
			const longer = (await frameById(app, f.id)).endTime!;
			expect(Math.abs(longer - (end + 60 / scale / a.perSecond))).toBeLessThanOrEqual(1 / 30);
			expect((await frameById(app, f.id)).time).toBe(f.time);
			await app.undo();
			await expectFrame(app, f.id, (x) => x.endTime === end);
			await app.redo();
			await expectFrame(app, f.id, (x) => x.endTime === longer);

			// Dropping the end tick on the start clears the span
			await app.drag(await anchorOnScreen(app, longer), along(await anchorOnScreen(app, f.time), 1));
			await expectFrame(app, f.id, (x) => x.endTime === undefined);
			await app.undo();
			await expectFrame(app, f.id, (x) => x.endTime === longer);
			await app.redo();
			await expectFrame(app, f.id, (x) => x.endTime === undefined);
			await app.undo();

			await app.canvasMenu(await cardGrip(app, f.id), 'Clear end');
			await expectFrame(app, f.id, (x) => x.endTime === undefined);
			await app.undo();
			await expectFrame(app, f.id, (x) => x.endTime === longer);
			await app.redo();
			await expectFrame(app, f.id, (x) => x.endTime === undefined);
		});

		test('click or tap a card or its anchor to seek; double-click/tap a card opens the editor', async ({ app }) => {
			const f = await addFrameAt(app, 5);
			// The canvas follows the playhead; 1.5 s later the card is still in view
			await seekTo(app, 6.5);
			await app.tap(await cardGrip(app, f.id));
			await expect.poll(async () => (await app.time()).current).toBeCloseTo(f.time, 1);
			await seekTo(app, 6.5);
			await app.tap(await anchorOnScreen(app, f.time));
			await expect.poll(async () => (await app.time()).current).toBeCloseTo(f.time, 1);
			expect(await editingFrameId(app)).toBeNull();

			const grip = await cardGrip(app, f.id);
			await app.doubleTap(grip);
			await expect.poll(() => editingFrameId(app)).toBe(f.id);
		});

		test('frame menu: open, duplicate, set start, delete; each undoable', async ({ app }) => {
			const f = await addFrameAt(app, 5);
			await seekTo(app, 3);

			await app.canvasMenu(await cardGrip(app, f.id), 'Open');
			await expect.poll(() => editingFrameId(app)).toBe(f.id);
			await closeEditor(app);

			// Duplicate goes to time + 0.5 s (the playhead is earlier)
			await app.canvasMenu(await cardGrip(app, f.id), 'Duplicate');
			await expect.poll(async () => (await frames(app)).length).toBe(2);
			const copy = (await frames(app))[1];
			expect(copy.id).not.toBe(f.id);
			expect(copy.time).toBeCloseTo(f.time + 0.5, 6);
			await app.undo();
			await expect.poll(async () => (await frames(app)).length).toBe(1);

			await app.canvasMenu(await cardGrip(app, f.id), 'Set start to playhead');
			await expectFrame(app, f.id, (x) => Math.abs(x.time - 3) < 0.05);
			await app.undo();
			await expectFrame(app, f.id, (x) => x.time === f.time);

			await app.canvasMenu(await cardGrip(app, f.id), 'Delete');
			await expect.poll(async () => (await frames(app)).length).toBe(0);
			await app.undo();
			await expect.poll(async () => (await frames(app)).map((x) => x.id)).toEqual([f.id]);
		});

		test('select tool: a card and a stroke move together in one undo step, and delete together', async ({ app }) => {
			const { page } = app;
			const f = await addFrameAt(app, 5);
			// A pen stroke just outside the card (below it in vertical, left of it in horizontal)
			const side = orientation === 'vertical' ? { x: f.canvasX + 20, y: f.canvasY + CARD_H + 30 } : { x: f.canvasX - 60, y: f.canvasY + 20 };
			await app.press(page.getByTitle(/Enter drawing mode/));
			await app.drag(await app.toScreen(side), await app.toScreen({ x: side.x + 30, y: side.y + 30 }));
			await expect.poll(async () => strokesOf(await app.notes()).length).toBe(1);
			const strokeBefore = boundsOf(strokesOf(await app.notes())[0]);

			await app.press(page.getByTitle(/Selection tool/));
			const from = await app.toScreen({ x: Math.min(f.canvasX, side.x) - 20, y: Math.min(f.canvasY, side.y) - 20 });
			const to = await app.toScreen({ x: Math.max(f.canvasX + 240, side.x + 30) + 20, y: Math.max(f.canvasY + CARD_H, side.y + 30) + 20 });
			await app.drag(from, to);

			const { scale } = await app.transform();
			const inside = await app.toScreen({ x: f.canvasX + 120, y: f.canvasY + CARD_H / 2 });
			await app.drag(inside, { x: inside.x + 40, y: inside.y + 30 });
			await expect.poll(async () => (await frameById(app, f.id)).canvasX - f.canvasX).toBeCloseTo(40 / scale, 0);
			expect(boundsOf(strokesOf(await app.notes())[0]).minX - strokeBefore.minX).toBeCloseTo(40 / scale, 0);

			// One undo brings both back
			await app.undo();
			await expectFrame(app, f.id, (x) => x.canvasX === f.canvasX && x.canvasY === f.canvasY);
			expect(boundsOf(strokesOf(await app.notes())[0]).minX).toBeCloseTo(strokeBefore.minX, 3);
			await app.redo();
			await expectFrame(app, f.id, (x) => x.canvasX !== f.canvasX);

			// Delete removes both, one undo restores both
			await app.drag(from, to);
			if (app.touch) {
				await app.tap(await app.toScreen({ x: f.canvasX + 40 / scale + 120, y: f.canvasY + 30 / scale + CARD_H / 2 }));
				await app.press(page.getByRole('button', { name: 'Delete selection' }));
			} else {
				await page.keyboard.press('Delete');
			}
			await expect.poll(async () => (await frames(app)).length).toBe(0);
			expect(strokesOf(await app.notes())).toHaveLength(0);
			await app.undo();
			await expect.poll(async () => (await frames(app)).length).toBe(1);
			expect(strokesOf(await app.notes())).toHaveLength(1);
		});

		test('select tool: clicking outside deselects cards, so Delete removes nothing', async ({ app }) => {
			const { page } = app;
			const f = await addFrameAt(app, 5);
			await app.press(page.getByTitle(/Selection tool/));
			await app.drag(await app.toScreen({ x: f.canvasX - 20, y: f.canvasY - 20 }), await app.toScreen({ x: f.canvasX + 260, y: f.canvasY + CARD_H + 20 }));
			// Away from the card and the waveform
			const away = orientation === 'vertical' ? { x: f.canvasX + 120, y: f.canvasY + CARD_H + 120 } : { x: f.canvasX - 200, y: f.canvasY + 40 };
			await app.tap(await app.toScreen(away));
			await expect(page.getByRole('button', { name: 'Delete selection' })).toBeHidden();
			await page.keyboard.press('Delete');
			await page.waitForTimeout(200);
			expect(await frames(app)).toHaveLength(1);
		});

		test('idle canvas: no animation frames while paused with no tool, also after a card drag and a tap', async ({ app }) => {
			const f = await addFrameAt(app, 5);
			await app.page.waitForTimeout(300);
			expect(await rafCallsOverOneSecond(app)).toBe(0);

			const grip = await cardGrip(app, f.id);
			await app.drag(grip, { x: grip.x + 30, y: grip.y + 30 });
			await app.page.waitForTimeout(300);
			expect(await rafCallsOverOneSecond(app)).toBe(0);

			await app.tap(await cardGrip(app, f.id));
			await app.page.waitForTimeout(300);
			expect(await rafCallsOverOneSecond(app)).toBe(0);
		});

		test('idle canvas: a duplicate with another background redraws its thumbnail once, not in a loop', async ({ app }) => {
			const { page } = app;
			await addFrameAt(app, 5, { keepEditorOpen: true });
			await draw(app, 'Rectangle', { x: 300, y: 300 }, { x: 900, y: 700 });
			// The copy keeps the same elements; only this frame's background changes
			await app.press(page.getByTestId('frame-strip').getByRole('button', { name: /duplicate/ }));
			await expect.poll(async () => (await frames(app)).length).toBe(2);
			await app.tap(await boardToScreen(app, { x: 1800, y: 1000 }));
			await page.getByTestId('inspector').locator('[name="frame-background"]').fill('#3355aa');
			await page.keyboard.press('Escape');
			await expect(page.getByRole('dialog', { name: 'Frame editor' })).toBeHidden();
			await page.waitForTimeout(1500);
			expect(await rafCallsOverOneSecond(app)).toBe(0);
		});

		test('mid-drag: Ctrl+Z settles the drag first; W adds a frame without losing the drag', async ({ app }) => {
			const { page } = app;
			const f = await addFrameAt(app, 5);
			const grip = await cardGrip(app, f.id);
			const step = (d: number) => ({ x: grip.x + d, y: grip.y + d });
			await app.pointerDown(grip);
			await app.pointerMove(grip, step(30));
			await expectFrame(app, f.id, (x) => x.canvasX !== f.canvasX);
			const partial = await frameById(app, f.id);
			await page.keyboard.press('Control+z');
			// The drag so far became an undo step and was undone; further moves don't revive it
			await expectFrame(app, f.id, (x) => x.canvasX === f.canvasX && x.canvasY === f.canvasY);
			await app.pointerMove(step(30), step(80));
			await app.pointerUp();
			await expectFrame(app, f.id, (x) => x.canvasX === f.canvasX && x.canvasY === f.canvasY);
			await app.redo();
			await expectFrame(app, f.id, (x) => x.canvasX === partial.canvasX && x.canvasY === partial.canvasY);

			// W during a drag: the drag is kept and the new frame stays
			const grip2 = await cardGrip(app, f.id);
			const step2 = (d: number) => ({ x: grip2.x + d, y: grip2.y + d });
			await app.pointerDown(grip2);
			await app.pointerMove(grip2, step2(25));
			await page.keyboard.press('w');
			await app.pointerMove(step2(25), step2(60));
			await app.pointerUp();
			await expect.poll(async () => (await frames(app)).length).toBe(2);
			expect((await frameById(app, f.id)).canvasX).not.toBe(partial.canvasX);
		});
	});
}
