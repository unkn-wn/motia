import { test, expect, type App } from './support/app';
import { boundsOf, strokesOf } from './support/strokes';
import { makeWav } from './support/wav';

// Baseline behaviour that the storyboard work must not break. Runs on the desktop (mouse) and touch projects.

async function openProject(app: App, orientation: 'vertical' | 'horizontal' = 'vertical') {
	await app.signIn();
	await app.createProject();
	await app.chooseOrientation(orientation);
}

async function addNote(app: App) {
	const count = (await app.textNotes()).length;
	await app.press(app.page.getByTitle('Add note at current time'));
	await expect.poll(async () => (await app.textNotes()).length).toBe(count + 1);
	return (await app.textNotes())[count];
}

/** A point inside a note card's header (cards are 240 wide, drawn down-right from canvasX/Y). */
async function noteGrip(app: App, id: string) {
	const note = (await app.textNotes()).find((n) => n.id === id)!;
	return app.toScreen({ x: note.canvasX + 30, y: note.canvasY + 14 });
}

async function editNote(app: App, id: string, text: string) {
	await app.canvasMenu(await noteGrip(app, id), 'Edit');
	const editor = app.page.getByPlaceholder('Edit note...');
	await expect(editor).toBeVisible();
	await editor.fill(text);
	await editor.press('Control+Enter');
	await expect(editor).toBeHidden();
}

async function drawStroke(app: App, from: { x: number; y: number }, to: { x: number; y: number }) {
	const count = strokesOf(await app.notes()).length;
	await app.drag(await app.toScreen(from), await app.toScreen(to));
	await expect.poll(async () => strokesOf(await app.notes()).length).toBe(count + 1);
}

test('uploading audio opens the project', async ({ app }) => {
	await app.signIn();
	await app.createProject('e2e.wav');
	await expect(app.canvas()).toBeVisible();
	expect((await app.time()).duration).toBeCloseTo(30, 0);
	await expect.poll(async () => (await app.metaDoc())?.title).toBe('e2e.wav');
});

test('note: add, edit from the canvas menu, drag, undo/redo', async ({ app }) => {
	await openProject(app);
	const note = await addNote(app);
	await editNote(app, note.id, 'borders tilt here');
	await expect.poll(async () => (await app.textNotes())[0].content).toBe('borders tilt here');

	const before = (await app.textNotes())[0];
	const { scale } = await app.transform();
	const grip = await noteGrip(app, note.id);
	await app.drag(grip, { x: grip.x + 120, y: grip.y + 80 });
	await expect.poll(async () => (await app.textNotes())[0].canvasX).not.toBe(before.canvasX);
	const moved = (await app.textNotes())[0];
	expect(moved.canvasX - before.canvasX).toBeCloseTo(120 / scale, 0);
	expect(moved.canvasY - before.canvasY).toBeCloseTo(80 / scale, 0);
	expect(moved.time).toBe(before.time);

	await app.undo();
	await expect.poll(async () => (await app.textNotes())[0].canvasX).toBeCloseTo(before.canvasX, 3);
	expect((await app.textNotes())[0].canvasY).toBeCloseTo(before.canvasY, 3);
	await app.redo();
	await expect.poll(async () => (await app.textNotes())[0].canvasX).toBeCloseTo(moved.canvasX, 3);
	expect((await app.textNotes())[0].content).toBe('borders tilt here');
});

test('pen stroke: draw, box-select, move, delete, erase', async ({ app }) => {
	const { page } = app;
	await openProject(app);

	await app.press(page.getByTitle(/Enter drawing mode/));
	await drawStroke(app, { x: -320, y: 120 }, { x: -220, y: 200 });

	await app.press(page.getByTitle(/Selection tool/));
	await app.drag(await app.toScreen({ x: -360, y: 80 }), await app.toScreen({ x: -180, y: 240 }));
	const before = boundsOf(strokesOf(await app.notes())[0]);
	const { scale } = await app.transform();
	const inside = await app.toScreen({ x: -270, y: 160 });
	await app.drag(inside, { x: inside.x + 60, y: inside.y + 40 });
	await expect.poll(async () => boundsOf(strokesOf(await app.notes())[0]).minX - before.minX).toBeCloseTo(60 / scale, 0);
	expect(boundsOf(strokesOf(await app.notes())[0]).minY - before.minY).toBeCloseTo(40 / scale, 0);

	if (app.touch) {
		// Touch: tap inside the selection, then use the Delete popup
		await app.tap(await app.toScreen({ x: -270 + 60 / scale, y: 160 + 40 / scale }));
		await app.press(page.getByRole('button', { name: 'Delete selection' }));
	} else {
		await page.keyboard.press('Delete');
	}
	await expect.poll(async () => strokesOf(await app.notes()).length).toBe(0);

	await app.press(page.getByTitle(/Enter drawing mode/));
	await drawStroke(app, { x: -320, y: 300 }, { x: -220, y: 320 });
	await drawStroke(app, { x: -320, y: 450 }, { x: -220, y: 470 });
	await app.press(page.getByTitle(/Eraser tool/));
	await app.drag(await app.toScreen({ x: -270, y: 270 }), await app.toScreen({ x: -270, y: 350 }));
	await expect.poll(async () => strokesOf(await app.notes()).length).toBe(1);
	expect(boundsOf(strokesOf(await app.notes())[0]).minY).toBeGreaterThan(440);
});

for (const orientation of ['vertical', 'horizontal'] as const) {
	test(`orientation banner: choose ${orientation} on a new project`, async ({ app }) => {
		await app.signIn();
		await app.createProject();
		await expect(app.page.getByText('Select waveform layout')).toBeVisible();
		await app.chooseOrientation(orientation);
		await expect.poll(async () => (await app.metaDoc())?.orientation).toBe(orientation);

		// New notes go beside a vertical waveform (x = 210) and below a horizontal one (y = 160),
		// see handleAddNoteAtCurrentTime in WaveformPlayer
		const check = async () => {
			const note = await addNote(app);
			if (orientation === 'horizontal') expect(note.canvasY).toBe(160);
			else expect(note.canvasX).toBe(210);
		};
		await check();
		await app.reload();
		await expect(app.page.getByText('Select waveform layout')).toBeHidden();
		await check();
	});
}

test('Ctrl+S saves; notes and strokes come back after reload', async ({ app }) => {
	const { page } = app;
	await openProject(app);
	const note = await addNote(app);
	await editNote(app, note.id, 'persist me');
	await app.press(page.getByTitle(/Enter drawing mode/));
	await drawStroke(app, { x: -320, y: 120 }, { x: -220, y: 200 });
	await app.press(page.getByTitle(/Exit drawing mode/));

	// Autosave waits 4 s after the last change; prove nothing is saved yet, then Ctrl+S must write at once
	const unsaved = await app.notesDoc();
	expect(((unsaved?.notes ?? []) as Array<{ content?: string }>).some((n) => n.content === 'persist me')).toBe(false);
	await page.keyboard.press('Control+s');
	await expect
		.poll(
			async () => {
				const doc = await app.notesDoc();
				const notes = (doc?.notes ?? []) as Array<{ content?: string }>;
				return notes.some((n) => n.content === 'persist me') && typeof doc?.compressed === 'string' && doc.compressed !== '[]';
			},
			{ timeout: 2000 }
		)
		.toBe(true);

	await app.reload();
	await expect.poll(async () => (await app.textNotes()).map((n) => n.content)).toEqual(['persist me']);
	expect(strokesOf(await app.notes())).toHaveLength(1);
});

test('trim settings persist', async ({ app }) => {
	const { page } = app;
	await openProject(app);
	await app.press(page.getByTitle('Settings', { exact: true }));
	const trim = page.getByRole('dialog').locator('canvas');
	await expect(trim).toBeVisible();
	const box = (await trim.boundingBox())!;
	const handleW = 3; // HANDLE_WIDTH in AudioTrimSettings
	const y = box.y + box.height / 2;
	// Drag the start handle to 25 % of the track (7.5 s of 30 s)
	await app.drag({ x: box.x + handleW / 2, y }, { x: box.x + handleW / 2 + 0.25 * (box.width - handleW), y });
	await expect.poll(async () => ((await app.metaDoc())?.audio as { trimStart?: number })?.trimStart ?? 0).toBeCloseTo(7.5, 0);
	await page.keyboard.press('Escape');
	await expect(trim).toBeHidden();

	await app.reload();
	// The playhead starts at the saved trim start
	await expect.poll(async () => (await app.time()).current).toBeCloseTo(7.5, 0);
	expect(((await app.metaDoc())?.audio as { trimStart?: number }).trimStart).toBeCloseTo(7.5, 0);
});

// The colour of a note changes from its menu on the canvas (the notes sidebar is gone); one undo step.
test('note menu: change a note colour', async ({ app }) => {
	await openProject(app);
	const note = await addNote(app);
	expect(note.color).not.toBe('green');
	await app.canvasMenu(await noteGrip(app, note.id), 'green', 'menuitemradio');
	await expect.poll(async () => (await app.textNotes())[0].color).toBe('green');
	await app.undo();
	await expect.poll(async () => (await app.textNotes())[0].color).toBe(note.color);
});

// The guest banner's sign-in dialog stays open when the page re-renders underneath it (it used to close).
test('guest: the sign-in dialog stays open while the page updates', async ({ app }) => {
	const { page } = app;
	await page.goto('/');
	await page.locator('input[type=file][accept^="audio"]').first().setInputFiles({ name: 'guest.wav', mimeType: 'audio/wav', buffer: makeWav() });
	await page.waitForURL(/\/project\/[^/]+$/);
	await app.waitForAudio();
	await app.chooseOrientation('vertical');
	await app.waitForBoard();
	await app.press(page.getByRole('button', { name: 'Sign in', exact: true }));
	const email = page.getByRole('dialog').locator('input[name=email]');
	await expect(email).toBeVisible();
	// The page re-renders (a new frame, then a save)
	await app.addFrameViaHook(3, -410, 250);
	await page.waitForTimeout(500);
	await expect(email).toBeVisible();
});
