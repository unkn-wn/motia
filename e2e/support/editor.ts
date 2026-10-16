import { expect, type App, type Pt } from './app';
import type { FrameElement } from '../../src/features/storyboard/types';

// Frame editor helpers: board coordinates ↔ page coordinates through the artboard's current view.

export async function editingId(app: App): Promise<string | null> {
	return app.page.evaluate(() => window.__motiaTest?.editingFrameId ?? null);
}

export async function elements(app: App): Promise<FrameElement[]> {
	const id = await editingId(app);
	const frame = (await app.storyboard()).frames.find((f) => f.id === id);
	if (!frame) throw new Error('no frame open in the editor');
	return frame.elements;
}

export function artboard(app: App) {
	return app.page.getByTestId('artboard');
}

/** Board pixel → page coordinates. */
export async function boardToScreen(app: App, p: Pt): Promise<Pt> {
	const el = artboard(app);
	const [box, scale, ox, oy] = await Promise.all([
		el.boundingBox(),
		el.getAttribute('data-scale'),
		el.getAttribute('data-offset-x'),
		el.getAttribute('data-offset-y'),
	]);
	return { x: box!.x + Number(ox) + p.x * Number(scale), y: box!.y + Number(oy) + p.y * Number(scale) };
}

export async function viewScale(app: App): Promise<number> {
	return Number(await artboard(app).getAttribute('data-scale'));
}

export async function pickTool(app: App, name: string) {
	const dock = app.page.getByRole('navigation', { name: 'Tools' });
	// A collapsed dock (phones, short screens) shows the current tool, which opens all of them
	if ((await dock.getAttribute('data-level')) === 'collapsed') {
		const current = dock.getByRole('button', { name: /^Tools: / });
		if ((await current.getAttribute('aria-label')) === `Tools: ${name}`) return;
		await app.press(current);
		await app.press(dock.getByRole('menu').getByRole('button', { name, exact: true }));
		await expect(current).toHaveAttribute('aria-label', `Tools: ${name}`);
		return;
	}
	const button = dock.getByRole('button', { name, exact: true });
	await app.press(button);
	await expect(button).toHaveAttribute('aria-pressed', 'true');
}

/** Drags on the artboard between two board points with the current tool. */
export async function dragOnBoard(app: App, from: Pt, to: Pt) {
	await app.drag(await boardToScreen(app, from), await boardToScreen(app, to));
}

export async function draw(app: App, tool: string, from: Pt, to: Pt): Promise<FrameElement> {
	const before = (await elements(app)).length;
	await pickTool(app, tool);
	await dragOnBoard(app, from, to);
	await expect.poll(async () => (await elements(app)).length).toBe(before + 1);
	return (await elements(app))[before];
}

/** Polls the open frame's element by id until `check` holds. */
export async function expectElement(app: App, id: string, check: (el: FrameElement & Record<string, unknown>) => boolean) {
	await expect
		.poll(async () => {
			const el = (await elements(app)).find((e) => e.id === id);
			return !!el && check(el as FrameElement & Record<string, unknown>);
		})
		.toBe(true);
}

/** Commits an inspector text/number field like a user: type, then Enter. */
export async function setField(app: App, name: string, value: string) {
	const input = app.page.getByTestId('inspector').locator(`[name="${name}"]`);
	await input.fill(value);
	await input.press(name === 'note' || name === 'frame-notes' || name === 'text' ? 'Control+Enter' : 'Enter');
}
