import { test, expect } from './support/app';
import { addFrameAt } from './support/frames';
import { draw, elements, pickTool } from './support/editor';

// M9: a phone-sized screen (touch only): the editor's inspector is a bottom sheet, touch targets on the index rail are
// at least 24 px across, and nothing scrolls sideways.

const PHONE = { width: 390, height: 844 };
test.use({ viewport: PHONE });

test('phone: inspector as a bottom sheet, 24 px rail targets, no sideways scrolling', async ({ app }, testInfo) => {
	test.skip(testInfo.project.name !== 'touch', 'phones are touch screens');
	const { page } = app;
	await app.signIn();
	await app.createProject();
	await app.chooseOrientation('vertical');
	await app.settled();
	const noSidewaysScroll = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
	expect(await noSidewaysScroll()).toBe(true);

	// The editor: the inspector is a sheet along the bottom, at most 45 % of the height
	const f = await addFrameAt(app, 5, { keepEditorOpen: true });
	await draw(app, 'Rectangle', { x: 200, y: 200 }, { x: 900, y: 600 });
	const sheet = (await page.getByTestId('inspector').boundingBox())!;
	expect(sheet.x).toBeCloseTo(0, 0);
	expect(sheet.width).toBeCloseTo(PHONE.width, 0);
	expect(sheet.y + sheet.height).toBeCloseTo(PHONE.height, 0);
	expect(sheet.height).toBeLessThanOrEqual(PHONE.height * 0.45 + 1);
	expect(await noSidewaysScroll()).toBe(true);
	await page.screenshot({ path: 'test-results/m9-phone-editor.png' });

	// Panning the board: two fingers anywhere, or one finger on the surround (select tool); neither draws
	const board = page.getByTestId('artboard');
	const offset = async () => ({ x: Number(await board.getAttribute('data-offset-x')), y: Number(await board.getAttribute('data-offset-y')) });
	const count = (await elements(app)).length;
	const box = (await board.boundingBox())!;
	let before = await offset();
	await app.twoFingerDrag({ x: box.x + 150, y: box.y + 200 }, { x: box.x + 250, y: box.y + 200 }, { x: 60, y: 80 });
	let after = await offset();
	expect(after.x - before.x).toBeCloseTo(60, -1);
	expect(after.y - before.y).toBeCloseTo(80, -1);
	await pickTool(app, 'Select');
	before = after;
	await app.drag({ x: box.x + box.width / 2, y: box.y + 20 }, { x: box.x + box.width / 2 - 40, y: box.y + 120 });
	after = await offset();
	expect(after.y - before.y).toBeCloseTo(100, -1);
	expect((await elements(app)).length).toBe(count);
	await app.press(page.getByRole('button', { name: 'Close frame editor' }));

	// The index rail: each mark and the window answer to a touch at least 24 px across
	const rail = page.getByTestId('index-rail');
	await expect(rail.locator(`[data-id="${f.id}"]`)).toHaveCount(1);
	for (const target of [rail.locator(`[data-id="${f.id}"]`), page.getByTestId('rail-window'), page.getByTestId('rail-strip')])
		expect((await target.boundingBox())!.width).toBeGreaterThanOrEqual(24);
	// The window answers to at least 24 px along the rail too, however small the view's share of the song
	expect((await page.getByTestId('rail-window').boundingBox())!.height).toBeGreaterThanOrEqual(24);
	expect((await rail.getByRole('button', { name: 'Find' }).boundingBox())!.width).toBeGreaterThanOrEqual(24);
	await page.screenshot({ path: 'test-results/m9-phone-canvas.png' });
});
