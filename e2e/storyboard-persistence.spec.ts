import { test, expect, type App } from './support/app';
import { findProjectWithFrame, mergeDoc, projectNotesPath, signInUser, TEST_EMAIL, TEST_PASSWORD, writeDoc } from './support/emulator';
import { strokesOf } from './support/strokes';
import { makeWav } from './support/wav';
import { compressDrawingAdaptive } from '../src/utils/drawingUtils';

// M1: the `storyboard` field saves, loads, stays per project, survives old clients and migrates with the project.
// Frames are created through the test hook here; the canvas UI for frames arrives in M2.

async function openProject(app: App) {
	await app.signIn();
	await app.createProject();
	await app.chooseOrientation('vertical');
}

test('a frame persists across reload', async ({ app }) => {
	await openProject(app);
	const id = await app.addFrameViaHook(1.5, -410, 150);
	await app.saveAndWaitForStoryboard((doc) => doc.frames.some((f) => f.id === id));
	const before = (await app.storyboard()).frames[0];

	await app.reload();
	await expect.poll(async () => (await app.storyboard()).frames).toEqual([before]);
	expect(before).toMatchObject({ id, time: 1.5, canvasX: -410, canvasY: 150, elements: [] });
});

test('deleting the last frame persists', async ({ app }) => {
	await openProject(app);
	const id = await app.addFrameViaHook(2);
	await app.saveAndWaitForStoryboard((doc) => doc.frames.length === 1);
	await app.deleteFramesViaHook([id]);
	await app.saveAndWaitForStoryboard((doc) => doc.frames.length === 0);

	await app.reload();
	expect((await app.storyboard()).frames).toEqual([]);
	expect((await app.storedStoryboard())?.frames).toEqual([]);
});

test('an old-format project (no storyboard field) loads unchanged', async ({ app }) => {
	await openProject(app);
	const pid = app.projectId();
	// Let the app's first save of the new project land, then replace the doc
	await expect.poll(async () => !!(await app.notesDoc()), { timeout: 10_000 }).toBe(true);
	// What a pre-storyboard client stored: text notes and the merged canvas sketch, nothing else
	const sketch = compressDrawingAdaptive([
		{ points: [{ x: -300, y: 100 }, { x: -250, y: 140 }, { x: -200, y: 160 }], color: '#9ca3af', strokeWidth: 2 },
	]).strokes;
	const oldNote = { id: 'note_old', time: 3.2, canvasX: 210, canvasY: 320, content: 'from before', color: 'pink', createdAt: '2026-01-01T00:00:00.000Z' };
	await writeDoc(projectNotesPath(app.uid, pid), { notes: [oldNote], compressed: JSON.stringify(sketch), version: 7 });

	await app.reload();
	await expect.poll(async () => (await app.textNotes()).map((n) => n.content)).toEqual(['from before']);
	const note = (await app.textNotes())[0];
	expect(note).toMatchObject({ id: 'note_old', time: 3.2, canvasX: 210, canvasY: 320, color: 'pink' });
	expect(strokesOf(await app.notes())).toHaveLength(1);
	expect((await app.storyboard()).frames).toEqual([]);

	// The next save keeps the old data and only adds the (empty) storyboard field
	await app.saveAndWaitForStoryboard((doc) => doc.frames.length === 0);
	const stored = await app.notesDoc();
	expect((stored!.notes as Array<{ content: string }>).map((n) => n.content)).toEqual(['from before']);
	expect(stored!.compressed).not.toBe('[]');
	expect(stored!.version).toBe(8);
});

test('a notes-only save from an older client keeps the storyboard', async ({ app }) => {
	await openProject(app);
	const id = await app.addFrameViaHook(4);
	await app.saveAndWaitForStoryboard((doc) => doc.frames.length === 1);
	const version = (await app.notesDoc())!.version as number;

	// An older client writes its usual payload with merge: notes, sketch, version (no `storyboard`)
	const oldClientNote = { id: 'note_x', time: 1, canvasX: 210, canvasY: 100, content: 'old client', color: 'blue', createdAt: '2026-01-01T00:00:00.000Z' };
	await mergeDoc(projectNotesPath(app.uid, app.projectId()), { notes: [oldClientNote], compressed: '[]', version: version + 1 });
	expect((await app.storedStoryboard())?.frames.map((f) => f.id)).toEqual([id]);

	await app.reload();
	await expect.poll(async () => (await app.storyboard()).frames.map((f) => f.id)).toEqual([id]);
	expect((await app.textNotes()).map((n) => n.content)).toEqual(['old client']);
});

test('opening another project shows its own board; undo does not reach back', async ({ app }) => {
	await openProject(app);
	await app.addFrameViaHook(1);
	await app.saveAndWaitForStoryboard((doc) => doc.frames.length === 1);

	await app.press(app.page.getByTitle('Projects', { exact: true }));
	await app.createProject('second.wav');
	await expect.poll(async () => (await app.storyboard()).frames).toEqual([]);
	await app.undo();
	await app.undo();
	expect((await app.storyboard()).frames).toEqual([]);
	await expect(app.page.getByTitle('Undo (Ctrl/Cmd+Z)')).toBeDisabled();
});

test('signing out and in leaves no board behind', async ({ app }) => {
	const { page } = app;
	await openProject(app);
	await app.addFrameViaHook(1);
	await app.saveAndWaitForStoryboard((doc) => doc.frames.length === 1);

	await app.press(page.getByTitle('Profile', { exact: true }));
	await app.press(page.getByRole('dialog').getByRole('button', { name: /sign out/i }));
	await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();

	await app.signIn();
	await app.createProject('after-signin.wav');
	expect((await app.storyboard()).frames).toEqual([]);
	await app.undo();
	expect((await app.storyboard()).frames).toEqual([]);
});

test('a guest project with frames migrates to an account', async ({ app }) => {
	const { page } = app;
	await page.goto('/');
	await page.locator('input[type=file][accept^="audio"]').first().setInputFiles({ name: 'guest.wav', mimeType: 'audio/wav', buffer: makeWav() });
	await page.waitForURL(/\/project\/[^/]+$/);
	await app.waitForAudio();
	await app.chooseOrientation('vertical');
	// The new project's board has loaded (a frame added before that would be replaced by the load)
	await app.waitForBoard();
	const id = await app.addFrameViaHook(2.5, -410, 250);
	await page.keyboard.press('Control+s');
	await expect.poll(() => findProjectWithFrame(id), { timeout: 20_000 }).not.toBeNull();
	const guest = (await findProjectWithFrame(id))!;

	await app.press(page.getByRole('button', { name: 'Sign in', exact: true }));
	const dialog = page.getByRole('dialog');
	await dialog.locator('input[name=email]').fill(TEST_EMAIL);
	await dialog.locator('input[name=password]').fill(TEST_PASSWORD);
	await app.press(dialog.locator('button[type=submit]'));

	// The account now holds the project with its storyboard. (After migration the app currently lands on
	// Projects rather than the project; that redirect race predates the storyboard work.)
	const uid = (await signInUser(TEST_EMAIL, TEST_PASSWORD)).localId;
	const inAccount = async () => {
		const found = await findProjectWithFrame(id);
		return found && found.uid === uid ? found.pid : null;
	};
	await expect.poll(inAccount, { timeout: 20_000 }).not.toBeNull();
	const pid = (await inAccount())!;
	expect(guest.uid).not.toBe(uid);
	await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeHidden();

	await page.goto(`/project/${pid}`);
	await app.waitForAudio();
	await app.waitForBoard();
	expect((await app.storyboard()).frames.map((f) => f.id)).toEqual([id]);
});
