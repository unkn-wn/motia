import { expect, type App, type Pt } from './app';
import type { Frame } from '../../src/features/storyboard/types';

// Frame geometry on the main canvas, mirrored from src/features/storyboard/canvas/layout.ts.
const CARD_WIDTH = 240;
const CARD_HEADER = 28;

export async function frames(app: App): Promise<Frame[]> {
	return (await app.storyboard()).frames;
}

export async function frameById(app: App, id: string): Promise<Frame> {
	const f = (await frames(app)).find((x) => x.id === id);
	if (!f) throw new Error(`frame ${id} not found`);
	return f;
}

/** World units per second along the time axis, and the axis length (same formula as the renderer). */
export async function axis(app: App) {
	const [box, { duration }] = await Promise.all([app.canvasBox(), app.time()]);
	const o = app.orientation;
	const length = Math.max((o === 'horizontal' ? box.width : box.height) * 3, duration * 100);
	return { orientation: o, length, duration, perSecond: length / duration };
}

/** The frame's anchor dot (or its span end) on the waveform edge facing the frames, in page coordinates. */
export async function anchorOnScreen(app: App, time: number): Promise<Pt> {
	const a = await axis(app);
	const along = time * a.perSecond;
	return app.toScreen(a.orientation === 'horizontal' ? { x: along, y: -60 } : { x: -60, y: along });
}

/** A point in the card's header. */
export async function cardGrip(app: App, id: string): Promise<Pt> {
	const f = await frameById(app, id);
	return app.toScreen({ x: f.canvasX + CARD_WIDTH / 2, y: f.canvasY + CARD_HEADER / 2 });
}

/** Seeks with the playback progress bar (keeps the canvas following the playhead). */
export async function seekTo(app: App, time: number) {
	await app.page.locator('#playback-progress').fill(String(time));
	await expect.poll(async () => (await app.time()).current).toBeCloseTo(time, 1);
}

/**
 * Moves the playhead, then adds a frame with the dock button. Adding opens the frame editor; it is closed again
 * with Esc unless `keepEditorOpen`.
 */
export async function addFrameAt(app: App, time: number, opts: { keepEditorOpen?: boolean } = {}): Promise<Frame> {
	await seekTo(app, time);
	const before = (await frames(app)).length;
	await app.press(app.page.getByTitle('Add frame at current time'));
	await expect.poll(async () => (await frames(app)).length).toBe(before + 1);
	const editor = app.page.getByRole('dialog', { name: 'Frame editor' });
	await expect(editor).toBeVisible();
	if (!opts.keepEditorOpen) {
		await app.page.keyboard.press('Escape');
		await expect(editor).toBeHidden();
	}
	return (await frames(app))[before];
}
