import { test as base, expect, type CDPSession, type Locator, type Page } from '@playwright/test';
import { makeWav } from './wav';
import { readDoc, projectMetaPath, projectNotesPath, signInUser, TEST_EMAIL, TEST_PASSWORD } from './emulator';
import type { Note } from '../../src/types/notes';
import type { StoryboardDoc } from '../../src/features/storyboard/types';

export type Pt = { x: number; y: number };
export type Transform = { offsetX: number; offsetY: number; scale: number };
/** A note as read from the page (JSON round-trip turns `createdAt` into a string). */
export type NoteState = Omit<Note, 'createdAt'> & { createdAt: string };

/** Mirrors what `useTestHooks` (src/lib/testHooks.ts) exposes. */
type TestHooks = {
	transform?: () => Transform | null;
	time?: () => { current: number; duration: number };
	notes?: Note[];
	storyboard?: StoryboardDoc;
	storyboardStatus?: 'idle' | 'loaded' | 'unreadable';
	editingFrameId?: string | null;
	openFrameEditor?: (id: string) => void;
	closeFrameEditor?: () => void;
	addFrame?: (time: number, canvasX: number, canvasY: number) => string;
	deleteFrames?: (ids: string[]) => void;
};

declare global {
	interface Window {
		__motiaTest?: TestHooks;
	}
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Drives the app the way a user would, through mouse (desktop project) or real touch input
 * (touch project, dispatched through the Chrome DevTools protocol so the app's touch path runs).
 */
export class App {
	uid = '';
	/** Canvas layout chosen on the orientation banner */
	orientation: 'vertical' | 'horizontal' = 'vertical';
	readonly errors: string[] = [];
	private cdp: CDPSession | null = null;

	constructor(
		readonly page: Page,
		readonly touch: boolean
	) {}

	async init() {
		await this.page.context().route(/googletagmanager\.com|google-analytics\.com/, (r) => r.abort());
		// Outside the live smoke, nothing may reach the deployed Firebase project (Google's API hosts; the emulators
		// answer on 127.0.0.1)
		if (process.env.E2E_LIVE !== '1')
			await this.page.context().route(
				(url) => /(^|\.)googleapis\.com$/.test(url.hostname),
				(r) => r.abort()
			);
		this.page.on('pageerror', (e) => this.errors.push(String(e)));
		this.page.on('console', (m) => {
			if (m.type() === 'error') this.errors.push(m.text());
		});
		if (this.touch) this.cdp = await this.page.context().newCDPSession(this.page);
	}

	// --- DOM controls ---
	async press(locator: Locator) {
		if (this.touch) await locator.tap();
		else await locator.click();
	}

	// --- Account and project ---
	async signIn() {
		await this.page.goto('/');
		await this.press(this.page.getByRole('button', { name: 'Sign in', exact: true }));
		const dialog = this.page.getByRole('dialog');
		await dialog.locator('input[name=email]').fill(TEST_EMAIL);
		await dialog.locator('input[name=password]').fill(TEST_PASSWORD);
		await this.press(dialog.locator('button[type=submit]'));
		await this.page.waitForURL('**/projects');
		this.uid = (await signInUser(TEST_EMAIL, TEST_PASSWORD)).localId;
	}

	/** Uploads a generated 30 s WAV from the Projects page and waits until its waveform is ready. */
	async createProject(name = 'e2e.wav'): Promise<string> {
		await this.page.waitForURL('**/projects');
		await this.page.locator('input[type=file][accept^="audio"]').first().setInputFiles({ name, mimeType: 'audio/wav', buffer: makeWav() });
		await this.page.waitForURL(/\/project\/[^/]+$/);
		await this.waitForAudio();
		return this.projectId();
	}

	projectId(): string {
		const m = /\/project\/([^/]+)$/.exec(new URL(this.page.url()).pathname);
		if (!m) throw new Error(`Not on a project page: ${this.page.url()}`);
		return m[1];
	}

	async waitForAudio() {
		await expect
			.poll(() => this.page.evaluate(() => window.__motiaTest?.time?.().duration ?? 0), { timeout: 30_000 })
			.toBeGreaterThan(29);
	}

	async chooseOrientation(o: 'vertical' | 'horizontal') {
		this.orientation = o;
		await this.press(this.page.getByRole('button', { name: o === 'vertical' ? 'Vertical' : 'Horizontal' }));
		await expect(this.page.getByText('Select waveform layout')).toBeHidden();
	}

	async reload() {
		await this.page.reload();
		await this.waitForAudio();
		await this.waitForBoard();
	}

	/**
	 * Waits until the view and the index rail stop moving (after a load the view moves to the playhead once the song
	 * is ready), so positions measured next are where things stay.
	 */
	async settled() {
		const snapshot = () =>
			this.page.evaluate(() => {
				const t = window.__motiaTest?.transform?.();
				const strip = document.querySelector('[data-testid="rail-strip"]')?.getBoundingClientRect();
				return JSON.stringify([t, strip?.top, strip?.height, strip?.left, strip?.width, window.__motiaTest?.time?.().duration]);
			});
		let last = '';
		let stable = 0;
		await expect
			.poll(async () => {
				const now = await snapshot();
				stable = now === last ? stable + 1 : 0;
				last = now;
				return stable;
			}, { intervals: [150] })
			.toBeGreaterThanOrEqual(3);
	}

	/** Waits until the project's stored board has been read. */
	async waitForBoard() {
		await expect.poll(() => this.page.evaluate(() => window.__motiaTest?.storyboardStatus)).toBe('loaded');
	}

	// --- State (read-only test hooks) ---
	notes(): Promise<NoteState[]> {
		return this.page.evaluate(() => JSON.parse(JSON.stringify(window.__motiaTest?.notes ?? [])));
	}

	async textNotes() {
		return (await this.notes()).filter((n) => n.type !== 'drawing');
	}

	storyboard(): Promise<StoryboardDoc> {
		return this.page.evaluate(() => JSON.parse(JSON.stringify(window.__motiaTest!.storyboard!)));
	}

	/** Creates a frame through the test hook (until the canvas UI for frames exists). */
	addFrameViaHook(time: number, canvasX = -410, canvasY = 0): Promise<string> {
		return this.page.evaluate(([t, x, y]) => window.__motiaTest!.addFrame!(t, x, y), [time, canvasX, canvasY] as const);
	}

	deleteFramesViaHook(ids: string[]) {
		return this.page.evaluate((list) => window.__motiaTest!.deleteFrames!(list), ids);
	}

	/** The storyboard as stored in Firestore (null if the field is absent). */
	async storedStoryboard(): Promise<StoryboardDoc | null> {
		const raw = (await this.notesDoc())?.storyboard;
		return typeof raw === 'string' ? (JSON.parse(raw) as StoryboardDoc) : null;
	}

	/** Ctrl+S, then waits until Firestore holds a storyboard that satisfies `check`. */
	async saveAndWaitForStoryboard(check: (doc: StoryboardDoc) => boolean) {
		await this.page.keyboard.press('Control+s');
		await expect.poll(async () => {
			const doc = await this.storedStoryboard();
			return !!doc && check(doc);
		}).toBe(true);
	}

	transform(): Promise<Transform> {
		return this.page.evaluate(() => window.__motiaTest!.transform!()!);
	}

	time(): Promise<{ current: number; duration: number }> {
		return this.page.evaluate(() => window.__motiaTest!.time!());
	}

	canvas() {
		return this.page.locator('canvas.touch-none').first();
	}

	async canvasBox() {
		const box = await this.canvas().boundingBox();
		if (!box) throw new Error('canvas not visible');
		return box;
	}

	/** World (canvas) coordinates → page coordinates, matching the renderer's mapping. */
	async toScreen(p: Pt): Promise<Pt> {
		const [box, t] = await Promise.all([this.canvasBox(), this.transform()]);
		return { x: box.x + box.width / 2 + t.offsetX + p.x * t.scale, y: box.y + t.offsetY + p.y * t.scale };
	}

	/** Page coordinates → world coordinates. */
	async toWorld(p: Pt): Promise<Pt> {
		const [box, t] = await Promise.all([this.canvasBox(), this.transform()]);
		return { x: (p.x - box.x - box.width / 2 - t.offsetX) / t.scale, y: (p.y - box.y - t.offsetY) / t.scale };
	}

	async notesDoc() {
		return readDoc(projectNotesPath(this.uid, this.projectId()));
	}

	async metaDoc() {
		return readDoc(projectMetaPath(this.uid, this.projectId()));
	}

	// --- Gestures (mouse on desktop, touch on the touch project) ---
	private async touchEvent(type: 'touchStart' | 'touchMove' | 'touchEnd', points: Pt[]) {
		await this.cdp!.send('Input.dispatchTouchEvent', {
			type,
			touchPoints: points.map((p, i) => ({ x: p.x, y: p.y, id: i, radiusX: 1, radiusY: 1, force: 1 })),
		});
	}

	async tap(p: Pt) {
		if (this.touch) {
			await this.touchEvent('touchStart', [p]);
			await sleep(30);
			await this.touchEvent('touchEnd', []);
		} else {
			await this.page.mouse.click(p.x, p.y);
		}
		await sleep(50);
	}

	/** Press, move and release as separate steps (mouse button or one finger), e.g. to type mid-drag. */
	async pointerDown(p: Pt) {
		if (this.touch) await this.touchEvent('touchStart', [p]);
		else {
			await this.page.mouse.move(p.x, p.y);
			await this.page.mouse.down();
		}
		await sleep(60);
	}

	async pointerMove(from: Pt, to: Pt, steps = 5) {
		for (let i = 1; i <= steps; i++) {
			const q = { x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps };
			if (this.touch) await this.touchEvent('touchMove', [q]);
			else await this.page.mouse.move(q.x, q.y);
			await sleep(16);
		}
	}

	async pointerUp() {
		if (this.touch) await this.touchEvent('touchEnd', []);
		else await this.page.mouse.up();
		await sleep(80);
	}

	/** Primary-button / one-finger drag with intermediate moves. */
	async drag(from: Pt, to: Pt, steps = 12) {
		if (this.touch) {
			await this.touchEvent('touchStart', [from]);
			await sleep(60);
			for (let i = 1; i <= steps; i++) {
				const k = i / steps;
				await this.touchEvent('touchMove', [{ x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k }]);
				await sleep(16);
			}
			// Settle before lifting, as a finger does; a lift at full speed turns into a fling, and Chrome then
			// spends the next tap on stopping the fling instead of clicking
			await sleep(100);
			await this.touchEvent('touchMove', [to]);
			await this.touchEvent('touchEnd', []);
		} else {
			await this.page.mouse.move(from.x, from.y);
			await this.page.mouse.down();
			await sleep(60);
			for (let i = 1; i <= steps; i++) {
				const k = i / steps;
				await this.page.mouse.move(from.x + (to.x - from.x) * k, from.y + (to.y - from.y) * k);
				await sleep(16);
			}
			await this.page.mouse.up();
		}
		await sleep(80);
	}

	/**
	 * Right-hold (desktop) or long-press (touch) on a canvas item, then choose a menu item.
	 * Desktop uses the hold-and-release gesture: hover the item while the right button is down.
	 */
	async canvasMenu(p: Pt, item: string, role: 'menuitem' | 'menuitemradio' = 'menuitem') {
		const menuItem = this.page.getByRole(role, { name: item, exact: true });
		if (this.touch) {
			// A synthesized gesture goes through Chrome's gesture recogniser, so the lift after a
			// long-press sends no click, as on a device. The menu must open while the finger is down.
			const gesture = this.cdp!.send('Input.synthesizeTapGesture', { x: p.x, y: p.y, duration: 900, gestureSourceType: 'touch' });
			await expect(menuItem).toBeVisible();
			await gesture;
			await expect(menuItem).toBeVisible();
			await menuItem.tap();
		} else {
			await this.page.mouse.move(p.x, p.y);
			await this.page.mouse.down({ button: 'right' });
			await expect(menuItem).toBeVisible();
			const box = (await menuItem.boundingBox())!;
			await this.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 4 });
			await this.page.mouse.up({ button: 'right' });
		}
		await expect(menuItem).toBeHidden();
	}

	/** Double-click, or on touch two quick taps. */
	async doubleTap(p: Pt) {
		if (this.touch) {
			// Sent back to back (the protocol keeps their order): a busy test runner can't stretch a tap into a hold
			await Promise.all([
				this.touchEvent('touchStart', [p]),
				this.touchEvent('touchEnd', []),
				this.touchEvent('touchStart', [p]),
				this.touchEvent('touchEnd', []),
			]);
		} else {
			await this.page.mouse.dblclick(p.x, p.y);
		}
		await sleep(50);
	}

	/** Touch only: holds a finger at `p` and runs `whileHeld` before it lifts. */
	async longPress<T>(p: Pt, whileHeld: () => Promise<T>): Promise<T> {
		const gesture = this.cdp!.send('Input.synthesizeTapGesture', { x: p.x, y: p.y, duration: 2500, gestureSourceType: 'touch' });
		try {
			return await whileHeld();
		} finally {
			await gesture;
		}
	}

	async undo() {
		await this.page.keyboard.press('Control+z');
		await sleep(50);
	}

	async redo() {
		await this.page.keyboard.press('Control+Shift+z');
		await sleep(50);
	}
}

export const test = base.extend<{ app: App }>({
	app: async ({ page }, provide, testInfo) => {
		const app = new App(page, testInfo.project.name === 'touch');
		await app.init();
		await provide(app);
	},
});

export { expect };
