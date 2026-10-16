import { test, expect, type App } from './support/app';
import { addFrameAt, cardGrip, frameById, frames } from './support/frames';
import { boardToScreen, draw, editingId, elements, expectElement, pickTool, setField, viewScale, dragOnBoard } from './support/editor';
import { strokesOf } from './support/strokes';

// M3: the frame editor overlay — drawing, transforming, the inspector, header, persistence, and the canvas guards.

async function openNewFrame(app: App) {
	await app.signIn();
	await app.createProject();
	await app.chooseOrientation('vertical');
	return addFrameAt(app, 5, { keepEditorOpen: true });
}

const editor = (app: App) => app.page.getByRole('dialog', { name: 'Frame editor' });

test('draw every element type', async ({ app }) => {
	await openNewFrame(app);
	const rect = await draw(app, 'Rectangle', { x: 200, y: 200 }, { x: 600, y: 500 });
	expect(rect).toMatchObject({ type: 'rect' });
	expect(rect).toMatchObject({ x: expect.closeTo(200, -1), y: expect.closeTo(200, -1), w: expect.closeTo(400, -1), h: expect.closeTo(300, -1) });
	expect((await draw(app, 'Ellipse', { x: 700, y: 200 }, { x: 900, y: 400 })).type).toBe('ellipse');
	expect((await draw(app, 'Line', { x: 200, y: 700 }, { x: 600, y: 700 })).type).toBe('line');
	const arrow = await draw(app, 'Arrow', { x: 200, y: 800 }, { x: 700, y: 900 });
	expect(arrow.type).toBe('arrow');
	expect('points' in arrow && arrow.points.length).toBe(2);
	const pen = await draw(app, 'Pen', { x: 1000, y: 600 }, { x: 1400, y: 900 });
	expect(pen.type).toBe('pen');
	expect('points' in pen && pen.points.every(([x, y]) => Number.isInteger(x) && Number.isInteger(y))).toBe(true);
	// The pen stays selected for the next stroke; the shape tools return to select
	await expect(app.page.getByRole('button', { name: 'Pen', exact: true })).toHaveAttribute('aria-pressed', 'true');

	await pickTool(app, 'Text');
	await app.tap(await boardToScreen(app, { x: 1200, y: 200 }));
	const textarea = editor(app).getByRole('textbox', { name: 'Edit text in place' });
	await expect(textarea).toBeFocused();
	await app.page.keyboard.type('TAKING OVER');
	await app.page.keyboard.press('Enter');
	await expect.poll(async () => (await elements(app)).map((e) => e.type)).toEqual(['rect', 'ellipse', 'line', 'arrow', 'pen', 'text']);
	const text = (await elements(app))[5];
	expect(text).toMatchObject({ type: 'text', text: 'TAKING OVER' });

	// Double-click/tap the text to edit it in place
	// The middle of the text (its edges carry resize handles while it is selected)
	const t = text as { x: number; y: number; w: number; h: number };
	const at = await boardToScreen(app, { x: t.x + t.w / 2, y: t.y + t.h / 2 });
	await app.tap(at);
	await app.tap(at);
	await expect(textarea).toBeVisible();
	await app.page.keyboard.press('Control+a');
	await app.page.keyboard.type('TAKING OVERNIGHT');
	await app.page.keyboard.press('Enter');
	await expectElement(app, text.id, (el) => el.text === 'TAKING OVERNIGHT');
	await app.page.screenshot({ path: `test-results/m3-editor-${app.touch ? 'touch' : 'desktop'}.png` });
});

test('move, resize and rotate with handles; nudge; duplicate; stacking; delete; undo/redo', async ({ app }) => {
	await openNewFrame(app);
	const rect = (await draw(app, 'Rectangle', { x: 400, y: 300 }, { x: 800, y: 500 })) as { id: string; x: number; y: number };
	const s = await viewScale(app);

	// Move by dragging the body
	await dragOnBoard(app, { x: 600, y: 400 }, { x: 700, y: 450 });
	await expectElement(app, rect.id, (el) => Math.abs((el.x as number) - 500) < 2 && Math.abs((el.y as number) - 350) < 2);
	await app.undo();
	await expectElement(app, rect.id, (el) => el.x === rect.x && el.y === (rect as { y: number }).y);
	await app.redo();
	await expectElement(app, rect.id, (el) => Math.abs((el.x as number) - 500) < 2);

	// Resize from the bottom-right handle: the top-left corner stays
	const se = await boardToScreen(app, { x: 900, y: 550 });
	await app.drag(se, { x: se.x + 100 * s, y: se.y + 50 * s });
	await expectElement(app, rect.id, (el) => Math.abs((el.w as number) - 500) < 2 && Math.abs((el.h as number) - 250) < 2 && Math.abs((el.x as number) - 500) < 2);

	// Rotate with the handle above the top edge: pulling it to the right of the centre gives 90°
	const r = (await elements(app)).find((e) => e.id === rect.id)! as { x: number; y: number; w: number; h: number };
	const top = await boardToScreen(app, { x: r.x + r.w / 2, y: r.y });
	const centre = await boardToScreen(app, { x: r.x + r.w / 2, y: r.y + r.h / 2 });
	await app.drag({ x: top.x, y: top.y - 28 }, { x: centre.x + 300, y: centre.y });
	await expectElement(app, rect.id, (el) => Math.abs((el.rotation as number) - 90) < 2);
	await app.undo();
	await expectElement(app, rect.id, (el) => el.rotation === 0);

	// Nudge with the arrow keys (Shift = 10 px)
	const x0 = ((await elements(app)).find((e) => e.id === rect.id) as { x: number }).x;
	await app.page.keyboard.press('ArrowRight');
	await app.page.keyboard.press('Shift+ArrowDown');
	await expectElement(app, rect.id, (el) => el.x === x0 + 1);

	// Duplicate (new id), stacking order, delete
	await app.page.keyboard.press('Control+d');
	await expect.poll(async () => (await elements(app)).length).toBe(2);
	const [first, copy] = await elements(app);
	expect(copy.id).not.toBe(first.id);
	await app.press(app.page.getByTitle('Send back'));
	await expect.poll(async () => (await elements(app)).map((e) => e.id)).toEqual([copy.id, first.id]);
	await app.page.keyboard.press('Delete');
	await expect.poll(async () => (await elements(app)).map((e) => e.id)).toEqual([first.id]);
	await app.undo();
	await expect.poll(async () => (await elements(app)).length).toBe(2);
});

test('copy and paste keeps ids across frames and makes new ones within a frame', async ({ app }) => {
	await openNewFrame(app);
	const rect = await draw(app, 'Rectangle', { x: 300, y: 300 }, { x: 500, y: 450 });
	await app.page.keyboard.press('Control+c');
	await app.page.keyboard.press('Control+v');
	await expect.poll(async () => (await elements(app)).length).toBe(2);
	expect((await elements(app))[1].id).not.toBe(rect.id);

	// A second frame, later in time: Next frame, paste → the same object continues there
	await app.page.evaluate(() => window.__motiaTest!.addFrame!(9, -410, 900));
	await app.press(app.page.getByRole('button', { name: 'Next frame' }));
	await expect.poll(async () => (await elements(app)).length).toBe(0);
	await app.page.keyboard.press('Control+v');
	await expect.poll(async () => (await elements(app)).map((e) => e.id)).toEqual([rect.id]);
	await app.press(app.page.getByRole('button', { name: 'Previous frame' }));
	await expect.poll(async () => (await elements(app)).length).toBe(2);
});

test('the inspector edits every property; the header edits title and times; undo/redo', async ({ app }) => {
	const f = await openNewFrame(app);
	const rect = await draw(app, 'Rectangle', { x: 300, y: 300 }, { x: 500, y: 450 });
	await setField(app, 'label', 'top border');
	await setField(app, 'note', 'tilts on the hit');
	await setField(app, 'x', '100');
	await setField(app, 'y', '120');
	await setField(app, 'w', '1720');
	await setField(app, 'h', '220');
	await setField(app, 'rotation', '-6');
	await setField(app, 'radius', '24');
	await app.page.getByTestId('inspector').locator('[name="fill"]').fill('#e60012');
	await app.press(app.page.getByRole('button', { name: 'stroke: set' }));
	await setField(app, 'strokeWidth', '6');
	await setField(app, 'opacity', '80');
	await expectElement(app, rect.id, (el) =>
		el.label === 'top border' &&
		el.note === 'tilts on the hit' &&
		el.x === 100 &&
		el.y === 120 &&
		el.w === 1720 &&
		el.h === 220 &&
		el.rotation === -6 &&
		el.radius === 24 &&
		el.fill === '#e60012' &&
		el.stroke === '#ffffff' &&
		el.strokeWidth === 6 &&
		el.opacity === 0.8
	);
	await app.undo();
	await expectElement(app, rect.id, (el) => el.opacity === undefined);
	await app.redo();
	await expectElement(app, rect.id, (el) => el.opacity === 0.8);

	// Text: content and font size from the inspector
	await pickTool(app, 'Text');
	await app.tap(await boardToScreen(app, { x: 300, y: 700 }));
	await app.page.keyboard.type('hero');
	await app.page.keyboard.press('Enter');
	await expect.poll(async () => (await elements(app)).length).toBe(2);
	const text = (await elements(app))[1];
	await setField(app, 'text', 'Taking overnight');
	await setField(app, 'fontSize', '120');
	await expectElement(app, text.id, (el) => el.text === 'Taking overnight' && el.fontSize === 120);

	// Nothing selected: frame notes, background, board format
	await app.page.keyboard.press('Escape'); // closes the editor
	await expect(editor(app)).toBeHidden();
	await app.page.mouse.move(0, 0);
	const grip = await cardGrip(app, f.id);
	await app.doubleTap(grip);
	await expect(editor(app)).toBeVisible();
	await setField(app, 'frame-notes', "camera snaps on 'over'");
	await app.page.getByTestId('inspector').locator('[name="frame-background"]').fill('#0b0b0b');
	// The board format (all frames) opens from the board size under the artboard
	await app.press(app.page.getByRole('button', { name: 'Board format' }));
	const boardFormat = app.page.getByTestId('board-format');
	await app.press(boardFormat.getByRole('button', { name: '1:1', exact: true }));
	await boardFormat.locator('[name="board-fps"]').fill('30');
	await boardFormat.locator('[name="board-fps"]').press('Enter');
	await boardFormat.locator('[name="board-style"]').fill('hard hitting, heavy glow');
	await boardFormat.locator('[name="board-style"]').press('Enter');
	await expect.poll(async () => frameById(app, f.id)).toMatchObject({ notes: "camera snaps on 'over'", background: '#0b0b0b' });
	await expect.poll(async () => (await app.storyboard()).board).toEqual({ width: 1080, height: 1080, fps: 30, style: 'hard hitting, heavy glow' });

	// Header: title, start and end (typed and from the playhead), clear end
	const header = editor(app).locator('header');
	await header.locator('[name="frame-title"]').fill('Checkered intro');
	await header.locator('[name="frame-title"]').press('Enter');
	await header.locator('[name="frame-start"]').fill('0:04.250');
	await header.locator('[name="frame-start"]').press('Enter');
	await header.locator('[name="frame-end"]').fill('0:06.500');
	await header.locator('[name="frame-end"]').press('Enter');
	await expect.poll(async () => frameById(app, f.id)).toMatchObject({ title: 'Checkered intro', time: 4.25, endTime: 6.5 });
	// An end before the start is refused
	await header.locator('[name="frame-end"]').fill('0:01.000');
	await header.locator('[name="frame-end"]').press('Enter');
	await expect(header.locator('[name="frame-end"]')).toHaveValue('0:06.500');
	await app.press(header.getByRole('button', { name: 'Clear end' }));
	await expect.poll(async () => (await frameById(app, f.id)).endTime).toBeUndefined();
	await app.press(header.getByRole('button', { name: 'Set start to playhead' }));
	await expect.poll(async () => (await frameById(app, f.id)).time).toBeCloseTo(5, 1);
	await app.undo();
	await expect.poll(async () => (await frameById(app, f.id)).time).toBe(4.25);
});

test('closing saves and keeps the canvas view; the card thumbnail shows the drawing; reload keeps it', async ({ app }) => {
	const f = await openNewFrame(app);
	await app.page.keyboard.press('Escape');
	const transformBefore = await app.transform();
	const grip = await cardGrip(app, f.id);
	await app.canvasMenu(grip, 'Open');
	await expect(editor(app)).toBeVisible();

	// A red rectangle over the whole board
	const rect = await draw(app, 'Rectangle', { x: 100, y: 100 }, { x: 300, y: 300 });
	await setField(app, 'x', '0');
	await setField(app, 'y', '0');
	await setField(app, 'w', '1920');
	await setField(app, 'h', '1080');
	await app.page.getByTestId('inspector').locator('[name="fill"]').fill('#ff0000');
	await expectElement(app, rect.id, (el) => el.fill === '#ff0000' && el.w === 1920);

	await app.press(app.page.getByRole('button', { name: 'Close frame editor' }));
	await expect(editor(app)).toBeHidden();
	expect(await app.transform()).toEqual(transformBefore);
	// Closing saved immediately (autosave alone waits 4 s)
	await expect.poll(async () => (await app.storedStoryboard())?.frames[0].elements.length, { timeout: 2500 }).toBe(1);

	// The card body on the canvas now shows red
	const card = await frameById(app, f.id);
	const body = await app.toScreen({ x: card.canvasX + 120, y: card.canvasY + 28 + 60 });
	await expect
		.poll(() =>
			app.page.evaluate(([x, y]) => {
				const c = document.querySelector('canvas.touch-none') as HTMLCanvasElement;
				const r = c.getBoundingClientRect();
				const k = c.width / r.width;
				const [red, green, blue] = c.getContext('2d')!.getImageData((x - r.left) * k, (y - r.top) * k, 1, 1).data;
				return red > 200 && green < 60 && blue < 60;
			}, [body.x, body.y] as const)
		)
		.toBe(true);

	await app.reload();
	await expect.poll(async () => (await frames(app))[0]?.elements.map((e) => e.id)).toEqual([rect.id]);
});

test('guards: the canvas eraser, select-Delete and shortcuts do nothing while the editor is open; Space still plays', async ({ app }) => {
	const { page } = app;
	await app.signIn();
	await app.createProject();
	await app.chooseOrientation('vertical');
	// A canvas stroke that the editor's artboard will sit over
	await app.press(page.getByTitle(/Enter drawing mode/));
	await app.drag(await app.toScreen({ x: -300, y: 100 }), await app.toScreen({ x: 200, y: 200 }));
	await expect.poll(async () => strokesOf(await app.notes()).length).toBe(1);

	// Eraser active → open the editor → dragging across the stroke's screen area erases nothing
	await app.press(page.getByTitle(/Eraser tool/));
	await page.keyboard.press('w');
	await expect(editor(app)).toBeVisible();
	await pickTool(app, 'Pen');
	await app.drag(await app.toScreen({ x: -300, y: 150 }), await app.toScreen({ x: 200, y: 150 }));
	await page.waitForTimeout(200);
	expect(strokesOf(await app.notes())).toHaveLength(1);
	await page.keyboard.press('Escape');
	// Opening the editor deselected the canvas tool
	await expect(page.getByTitle('Eraser tool - drag over strokes to erase')).toBeVisible();

	// Select tool with the stroke selected → open the editor → Delete leaves the stroke. (Opening the editor already
	// switches the canvas tool off; the canvas Delete listener is also guarded by isFrameEditorOpen.)
	await app.press(page.getByTitle(/Selection tool/));
	await app.drag(await app.toScreen({ x: -350, y: 50 }), await app.toScreen({ x: 250, y: 250 }));
	await page.keyboard.press('w');
	await expect(editor(app)).toBeVisible();
	await page.keyboard.press('Delete');
	await page.waitForTimeout(150);
	expect(strokesOf(await app.notes())).toHaveLength(1);

	// Canvas shortcuts do nothing on the canvas while the editor is open
	const framesBefore = (await frames(app)).length;
	const notesBefore = (await app.textNotes()).length;
	for (const key of ['a', 'd', 's', 'f', 'b', 'w']) await page.keyboard.press(key);
	await page.waitForTimeout(150);
	expect((await frames(app)).length).toBe(framesBefore);
	expect((await app.textNotes()).length).toBe(notesBefore);
	expect(await editingId(app)).not.toBeNull();

	// Space toggles playback
	await page.keyboard.press(' ');
	const t0 = (await app.time()).current;
	await expect.poll(async () => (await app.time()).current).toBeGreaterThan(t0 + 0.2);
	await page.keyboard.press(' ');
	// Paused: the time settles and stays
	let last = -1;
	await expect
		.poll(async () => {
			const t = (await app.time()).current;
			const still = Math.abs(t - last) < 0.001;
			last = t;
			return still;
		})
		.toBe(true);
	await page.waitForTimeout(400);
	expect((await app.time()).current).toBeCloseTo(last, 3);

	await page.keyboard.press('Escape');
	await expect(editor(app)).toBeHidden();
	// The index rail stayed shown (B did nothing) and the canvas tools stayed off
	await expect(page.getByTestId('index-rail')).toBeVisible();
	await expect(page.getByTitle('Enter drawing mode - Click and drag to draw')).toBeVisible();
});

test('fields: Escape reverts; a focused field never writes into another element', async ({ app }) => {
	await openNewFrame(app);
	const a = await draw(app, 'Rectangle', { x: 200, y: 200 }, { x: 400, y: 400 });
	const b = await draw(app, 'Rectangle', { x: 900, y: 200 }, { x: 1100, y: 400 });
	const ax = (a as { x: number }).x;
	const bx = (b as { x: number }).x;

	// b is selected: type a new x, then Escape — nothing changes
	const x = app.page.getByTestId('inspector').locator('[name="x"]');
	await x.fill('1500');
	await x.press('Escape');
	await app.page.waitForTimeout(150);
	expect(((await elements(app)).find((e) => e.id === b.id) as { x: number }).x).toBe(bx);

	// Type into b's label, then click element a: the label lands on b (where it was typed), never on a
	const label = app.page.getByTestId('inspector').locator('[name="label"]');
	await label.fill('coin');
	await app.tap(await boardToScreen(app, { x: 300, y: 300 }));
	await expectElement(app, b.id, (el) => el.label === 'coin');
	const aNow = (await elements(app)).find((e) => e.id === a.id)!;
	expect(aNow.label).toBeUndefined();
	expect((aNow as { x: number }).x).toBe(ax);
});

test('a colour drag in the picker is one undo step', async ({ app }) => {
	await openNewFrame(app);
	const rect = await draw(app, 'Rectangle', { x: 200, y: 200 }, { x: 400, y: 400 });
	const before = (rect as { fill: string }).fill;
	// What the picker does while dragging: many input events, then one change
	await app.page.getByTestId('inspector').locator('[name="fill"]').evaluate((el: HTMLInputElement) => {
		const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
		for (const v of ['#110000', '#550000', '#990000', '#dd0000']) {
			setter.call(el, v);
			el.dispatchEvent(new Event('input', { bubbles: true }));
		}
		el.dispatchEvent(new Event('change', { bubbles: true }));
	});
	await expectElement(app, rect.id, (el) => el.fill === '#dd0000');
	await app.undo();
	await expectElement(app, rect.id, (el) => el.fill === before);
	await app.redo();
	await expectElement(app, rect.id, (el) => el.fill === '#dd0000');
});

test('marquee and Shift select; tilt a line by its endpoint; move a tiny element; zoom and fit', async ({ app }) => {
	const { page } = app;
	await openNewFrame(app);
	const r1 = await draw(app, 'Rectangle', { x: 100, y: 100 }, { x: 300, y: 300 });
	const r2 = await draw(app, 'Rectangle', { x: 500, y: 100 }, { x: 700, y: 300 });
	const r3 = await draw(app, 'Rectangle', { x: 1200, y: 600 }, { x: 1400, y: 800 });

	// Marquee over the first two, then Shift adds the third
	await pickTool(app, 'Select');
	await dragOnBoard(app, { x: 50, y: 50 }, { x: 800, y: 400 });
	await expect(page.getByTestId('inspector')).toContainText('2 selected');
	// Shift-click adds to the selection (a keyboard modifier; on touch, the marquee does multi-select)
	if (!app.touch) {
		const third = await boardToScreen(app, { x: 1300, y: 700 });
		await page.keyboard.down('Shift');
		await page.mouse.click(third.x, third.y);
		await page.keyboard.up('Shift');
		await expect(page.getByTestId('inspector')).toContainText('3 selected');
	}
	expect([r1.id, r2.id, r3.id]).toHaveLength(3);

	// A line's endpoint tilts it (its other end stays)
	const line = await draw(app, 'Line', { x: 200, y: 900 }, { x: 600, y: 900 });
	const end = await boardToScreen(app, { x: 600, y: 900 });
	const s = await viewScale(app);
	await app.drag(end, { x: end.x, y: end.y - 100 * s });
	await expectElement(app, line.id, (el) => {
		const pts = el.points as Array<[number, number]>;
		return Math.abs(pts[0][1] - 900) < 1 && Math.abs(pts[1][1] - 800) < 2;
	});

	// A tiny element: dragging its body moves it instead of grabbing a handle
	const tiny = await draw(app, 'Rectangle', { x: 1000, y: 300 }, { x: 1012, y: 312 });
	await dragOnBoard(app, { x: 1006, y: 306 }, { x: 1106, y: 356 });
	await expectElement(app, tiny.id, (el) => Math.abs((el.x as number) - 1100) < 3 && Math.abs((el.w as number) - 12) < 1);

	// Wheel zooms around the pointer; fit restores the view (desktop: a wheel is a mouse thing)
	if (!app.touch) {
		const before = await viewScale(app);
		const c = await boardToScreen(app, { x: 960, y: 540 });
		await page.mouse.move(c.x, c.y);
		await page.mouse.wheel(0, -400);
		await expect.poll(() => viewScale(app)).toBeGreaterThan(before * 1.3);
		await app.press(page.getByTitle('Fit to view'));
		await expect.poll(() => viewScale(app)).toBeCloseTo(before, 4);
	}
});

test('text finished by pressing elsewhere is added once, and selects alone with its settings', async ({ app }) => {
	await openNewFrame(app);
	await pickTool(app, 'Text');
	await app.tap(await boardToScreen(app, { x: 300, y: 300 }));
	await app.page.keyboard.type('hero');
	// Not Enter: a press elsewhere on the board finishes the edit
	await app.tap(await boardToScreen(app, { x: 1500, y: 900 }));
	await expect.poll(async () => (await elements(app)).map((e) => e.type)).toEqual(['text']);
	await app.page.waitForTimeout(200);
	expect((await elements(app)).length).toBe(1);
	// Selecting it shows its own settings, not "1 selected"
	await app.tap(await boardToScreen(app, { x: 330, y: 340 }));
	await expect(app.page.getByTestId('inspector')).toHaveAttribute('aria-label', 'Element properties');
	await expect(app.page.getByTestId('inspector').locator('[name="text"]')).toHaveValue('hero');
});

test('dragging the label of a number changes it live, as one undo step', async ({ app }) => {
	await openNewFrame(app);
	const rect = await draw(app, 'Rectangle', { x: 300, y: 300 }, { x: 500, y: 450 });
	const field = app.page.getByTestId('inspector').locator('label', { has: app.page.locator('[name="opacity"]') });
	const box = (await field.boundingBox())!;
	// The label sits at the field's left edge: drag it 40 px to the left (opacity 100 → 60)
	await app.drag({ x: box.x + 8, y: box.y + box.height / 2 }, { x: box.x - 32, y: box.y + box.height / 2 });
	await expectElement(app, rect.id, (el) => el.opacity === 0.6);
	await app.undo();
	await expectElement(app, rect.id, (el) => el.opacity === undefined);
});
