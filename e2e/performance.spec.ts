import { readFile } from 'node:fs/promises';
import { test, expect } from './support/app';
import { projectNotesPath, writeDoc } from './support/emulator';
import type { FrameElement, StoryboardDoc } from '../src/features/storyboard/types';

// M9: a big board (150 frames × 20 elements) stays smooth to pan, within the save budget, and exports without
// freezing the page. Measured on the desktop project (the numbers are about the app, not the input method).

const FRAMES = 150;
const ELEMENTS = 20;

function bigBoard(): StoryboardDoc {
	const frames = Array.from({ length: FRAMES }, (_, f) => {
		const elements: FrameElement[] = Array.from({ length: ELEMENTS }, (_, e): FrameElement => {
			const id = `e${e}`;
			const x = (e % 5) * 360 + 20;
			const y = Math.floor(e / 5) * 260 + 20;
			switch (e % 5) {
				case 0:
					return { id, type: 'rect', x, y, w: 300, h: 200, rotation: f % 30, radius: 8, fill: '#e60012', stroke: null, strokeWidth: 0, label: `bar ${e}` };
				case 1:
					return { id, type: 'ellipse', x, y, w: 200, h: 200, rotation: 0, fill: null, stroke: '#ffffff', strokeWidth: 6 };
				case 2:
					return { id, type: 'text', x, y, w: 320, h: 80, rotation: -4, text: `LINE ${f}.${e}`, fontSize: 48, fill: '#ffffff' };
				case 3:
					return { id, type: 'arrow', points: [[x, y], [x + 250, y + 150]], stroke: '#ffffff', strokeWidth: 6, note: 'moves this way' };
				default:
					return { id, type: 'pen', points: Array.from({ length: 12 }, (_, i): [number, number] => [x + i * 20, y + ((i * 37) % 90)]), stroke: '#9ca3af', strokeWidth: 4 };
			}
		});
		const time = 0.5 + f * 0.19;
		return { id: `f${f}`, time, title: `Frame ${f}`, notes: f % 3 === 0 ? 'snap on the hit' : '', background: '#171717', canvasX: -520, canvasY: f * 190, elements };
	});
	return { version: 1, board: { width: 1920, height: 1080 }, frames, symbols: [], assets: [] };
}

test('a 150-frame board: smooth panning, under the save warning, export without long freezes', async ({ app }, testInfo) => {
	test.skip(testInfo.project.name !== 'desktop', 'measured once, on the desktop project');
	test.setTimeout(240_000);
	const { page } = app;
	await app.signIn();
	await app.createProject();
	await app.chooseOrientation('vertical');
	await app.saveAndWaitForStoryboard((doc) => doc.frames.length === 0);
	await writeDoc(projectNotesPath(app.uid, app.projectId()), { notes: [], compressed: '[]', storyboard: JSON.stringify(bigBoard()), version: 50 });
	await app.reload();
	await expect.poll(async () => (await app.storyboard()).frames.length).toBe(FRAMES);
	await app.settled();

	// The app's own save of this board stays under the 700 KB warning
	await app.addFrameViaHook(29.9, -520, FRAMES * 190);
	await app.saveAndWaitForStoryboard((doc) => doc.frames.length === FRAMES + 1);
	const bytes = new TextEncoder().encode(JSON.stringify(await app.notesDoc())).length;
	console.log(`saved doc: ${bytes} bytes`);
	expect(bytes).toBeLessThan(700_000);

	// Panning across the cards: animation frames during the drag (after a first pass has drawn the thumbnails)
	const box = await app.canvasBox();
	const pan = async () => {
		await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.8);
		await page.mouse.down();
		for (let i = 1; i <= 40; i++) await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.8 - i * 15, { steps: 1 });
		await page.mouse.up();
	};
	await pan();
	await page.waitForTimeout(1500);
	await page.evaluate(() => {
		const w = window as unknown as { __rafDeltas: number[]; __rafRun: boolean };
		w.__rafDeltas = [];
		w.__rafRun = true;
		let last = performance.now();
		const tick = (t: number) => {
			w.__rafDeltas.push(t - last);
			last = t;
			if (w.__rafRun) requestAnimationFrame(tick);
		};
		requestAnimationFrame(tick);
	});
	const before = await app.transform();
	await pan();
	// The drag really panned (600 px of pointer travel)
	expect(Math.abs((await app.transform()).offsetY - before.offsetY)).toBeGreaterThan(500);
	const deltas = await page.evaluate(() => {
		const w = window as unknown as { __rafDeltas: number[]; __rafRun: boolean };
		w.__rafRun = false;
		return w.__rafDeltas.slice(1);
	});
	const sorted = [...deltas].sort((a, b) => a - b);
	const p95 = sorted[Math.floor(sorted.length * 0.95)];
	console.log(`pan: ${deltas.length} frames, p95 ${p95.toFixed(1)} ms`);
	expect(deltas.length).toBeGreaterThan(20);
	expect(p95).toBeLessThan(20);

	// Export: no main-thread task over 200 ms while the zip is built
	expect(await page.evaluate(() => PerformanceObserver.supportedEntryTypes.includes('longtask'))).toBe(true);
	await page.evaluate(() => {
		const w = window as unknown as { __longTasks: number[]; __longTaskObserver: PerformanceObserver };
		w.__longTasks = [];
		w.__longTaskObserver = new PerformanceObserver((list) => list.getEntries().forEach((e) => w.__longTasks.push(e.duration)));
		w.__longTaskObserver.observe({ type: 'longtask' });
	});
	const download = page.waitForEvent('download', { timeout: 180_000 });
	await page.getByRole('button', { name: 'Export', exact: true }).click();
	const file = await download;
	expect((await readFile(await file.path())).length).toBeGreaterThan(0);
	// Let the last tasks of the export be reported, then take whatever is still queued
	await page.waitForTimeout(500);
	const longTasks = await page.evaluate(() => {
		const w = window as unknown as { __longTasks: number[]; __longTaskObserver: PerformanceObserver };
		w.__longTaskObserver.takeRecords().forEach((e) => w.__longTasks.push(e.duration));
		w.__longTaskObserver.disconnect();
		return w.__longTasks;
	});
	console.log(`export long tasks (ms): ${JSON.stringify(longTasks.map(Math.round))}`);
	expect(Math.max(0, ...longTasks)).toBeLessThan(200);
});
