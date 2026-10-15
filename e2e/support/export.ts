import { readFile } from 'node:fs/promises';
import { unzipSync } from 'fflate';
import { expect, type App } from './app';

/**
 * Presses Export (optionally with "Include audio file") and returns the downloaded zip, unzipped. Asserts the export
 * finished with nothing to report (a self-check failure or a frame that couldn't be drawn would show a message).
 */
export async function exportZip(app: App, opts: { includeAudio?: boolean; screenshot?: string } = {}) {
	const { page } = app;
	if (opts.includeAudio) {
		await app.press(page.getByRole('button', { name: 'Export options' }));
		await page.getByRole('dialog', { name: 'Export options' }).getByLabel('Include audio file').check();
		if (opts.screenshot) await page.screenshot({ path: opts.screenshot, clip: { x: 0, y: 0, width: 520, height: 120 } });
	}
	const download = page.waitForEvent('download');
	await app.press(page.getByRole('button', { name: 'Export', exact: true }));
	const file = await download;
	const bytes = new Uint8Array(await readFile(await file.path()));
	await expect(page.getByRole('progressbar', { name: 'Exporting' })).toHaveCount(0);
	await expect(page.getByText(/^Exported\./)).toHaveCount(0);
	return { name: file.suggestedFilename(), bytes, files: unzipSync(bytes) };
}
