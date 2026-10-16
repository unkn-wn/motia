import { readFile } from 'node:fs/promises';
import { strFromU8, unzipSync } from 'fflate';
import { test, expect, type App } from './support/app';
import { dragOnBoard, pickTool } from './support/editor';
import { makeWav } from './support/wav';
import { TEST_EMAIL, TEST_PASSWORD } from './support/emulator';
import type { MotiaJson } from '../src/features/storyboard/io/motiaJson';

// Live smoke, against the DEPLOYED Firebase project with the test account only, through the UI only (no
// test hooks exist in this build). It proves the storyboard field saves and loads under the real rules, then that
// export and import work, and removes the two `e2e-live-*` projects it made. It touches nothing else.

test.skip(process.env.E2E_LIVE !== '1', 'live smoke only with E2E_LIVE=1');

const stamp = `e2e-live-${Date.now()}`;
const FILE = `${stamp}.wav`;
const FRAME_TITLE = `live frame ${stamp}`;

// Projects this script made (in any run): their titles are the uploaded file's name, `e2e-live-<timestamp>.wav`
const LIVE_TITLE = /^e2e-live-\d+\.wav$/;
const liveCards = (app: App) => app.page.getByRole('listitem').filter({ has: app.page.getByRole('button', { name: LIVE_TITLE }) });

/** Opens the Projects page and waits until its list has loaded (not the placeholders). */
async function projectsLoaded(app: App) {
	const { page } = app;
	await page.goto('/projects');
	await expect(page.locator('a[href*="/project/"]').or(page.getByText('No projects yet')).first()).toBeVisible();
}

/** Deletes the projects this script made, one by one, until none is left. */
async function deleteLiveProjects(app: App) {
	const { page } = app;
	await projectsLoaded(app);
	for (let guard = 0; guard < 10 && (await liveCards(app).count()) > 0; guard++) {
		await liveCards(app).first().getByTitle('Delete').click();
		const confirm = page.getByRole('dialog', { name: 'Delete project' });
		// The dialog names the project: only ever one of this script's
		await expect(confirm).toContainText(/e2e-live-\d+\.wav/);
		await confirm.getByRole('button', { name: 'Delete' }).click();
		await expect(confirm).toBeHidden();
		await projectsLoaded(app);
	}
	await expect(liveCards(app)).toHaveCount(0);
}

/**
 * Opens the frame titled FRAME_TITLE: Find centres its card, then a double-click opens it. First the page must be
 * ready: the song loaded (its length shows; the view moves to the playhead then, which must not come after the
 * jump), or, for a project without its song here, the relink banner shown.
 */
async function openFrameByFind(app: App, withSong: boolean) {
	const { page } = app;
	if (withSong) await expect(page.getByText('0:30', { exact: true })).toBeVisible();
	else await expect(page.getByText('Audio not found on this device. Relink to enable playback.')).toBeVisible();
	await page.waitForTimeout(1500);
	await page.keyboard.press('/');
	const find = page.getByRole('dialog', { name: 'Find' });
	await find.getByRole('combobox').fill(FRAME_TITLE);
	await expect(find.getByRole('option')).toHaveCount(1);
	await page.keyboard.press('Enter');
	await expect(find).toBeHidden();
	await page.waitForTimeout(500);
	const box = (await page.locator('canvas.touch-none').first().boundingBox())!;
	await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);
	await expect(page.getByRole('dialog', { name: 'Frame editor' })).toBeVisible();
}

const shapesOnBoard = (app: App) => app.page.getByTestId('artboard').locator('svg[data-frame-id] > [data-id]');

async function signIn(app: App) {
	const { page } = app;
	await page.goto('/');
	await page.getByRole('button', { name: 'Sign in', exact: true }).click();
	const dialog = page.getByRole('dialog');
	await dialog.locator('input[name=email]').fill(TEST_EMAIL);
	await dialog.locator('input[name=password]').fill(TEST_PASSWORD);
	await dialog.locator('button[type=submit]').click();
	await page.waitForURL('**/projects');
}

// Only removes what an earlier, interrupted run of this script left behind
test('live: clean up', async ({ app }) => {
	await signIn(app);
	await deleteLiveProjects(app);
});

test('live: a frame saves and loads on the deployed project; export and import; clean-up', async ({ app }) => {
	const { page } = app;
	await signIn(app);

	try {
		// A project of this run, with one frame holding two shapes
		await page.locator('input[type=file][accept^="audio"]').first().setInputFiles({ name: FILE, mimeType: 'audio/wav', buffer: makeWav() });
		await page.waitForURL(/\/project\/[^/]+$/);
		const projectA = new URL(page.url()).pathname.split('/').pop()!;
		await app.chooseOrientation('vertical');
		await expect(page.getByRole('button', { name: 'Export', exact: true })).toBeVisible();
		await page.getByTitle('Add frame at current time').click();
		await expect(page.getByRole('dialog', { name: 'Frame editor' })).toBeVisible();
		const title = page.locator('input[name="frame-title"]');
		await title.fill(FRAME_TITLE);
		await title.press('Enter');
		await pickTool(app, 'Rectangle');
		await dragOnBoard(app, { x: 200, y: 200 }, { x: 800, y: 600 });
		await pickTool(app, 'Ellipse');
		await dragOnBoard(app, { x: 1000, y: 300 }, { x: 1500, y: 800 });
		await expect(shapesOnBoard(app)).toHaveCount(2);
		await page.getByRole('button', { name: 'Close frame editor' }).click();
		// Saved: the status says so and shows no pending changes
		await page.keyboard.press('Control+s');
		const status = page.getByRole('button', { name: /^(Saved|Saving|Not saved)/ });
		await expect(status).toHaveAttribute('aria-label', /^Saved/);
		await expect(status.locator('.text-yellow-500')).toHaveCount(0);

		// Reload: the frame is still there, with its shapes
		await page.reload();
		await expect(page.getByRole('button', { name: 'Export', exact: true })).toBeVisible();
		await openFrameByFind(app, true);
		await expect(shapesOnBoard(app)).toHaveCount(2);
		await page.getByRole('button', { name: 'Close frame editor' }).click();

		// Export
		const download = page.waitForEvent('download');
		await page.getByRole('button', { name: 'Export', exact: true }).click();
		const zip = new Uint8Array(await readFile(await (await download).path()));
		const json = JSON.parse(strFromU8(unzipSync(zip)['motia.json'])) as MotiaJson;
		expect(json.frames.map((f) => [f.title, f.elements.length])).toEqual([[FRAME_TITLE, 2]]);
		// The imported project takes this title, so the clean-up finds it too
		expect(json.project.title).toBe(FILE);

		// Import: a second project of this run, with the same frame
		await page.goto('/projects');
		await page.getByTestId('import-input').setInputFiles({ name: `${stamp}.motia.zip`, mimeType: 'application/zip', buffer: Buffer.from(zip) });
		await page.waitForURL((url) => /\/project\/[^/]+$/.test(url.pathname) && !url.pathname.endsWith(projectA));
		await openFrameByFind(app, false);
		await expect(shapesOnBoard(app)).toHaveCount(2);
		await page.getByRole('button', { name: 'Close frame editor' }).click();
	} finally {
		// Clean up, but keep the test's own failure if there was one (the test after this one tries again)
		await deleteLiveProjects(app).catch((err) => console.error('Live clean-up failed; the next test retries it', err));
	}
});

// Runs after the main test even when it failed or timed out (one worker, in file order)
test('live: clean up after', async ({ app }) => {
	await signIn(app);
	await deleteLiveProjects(app);
});
