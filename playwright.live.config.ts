import { defineConfig } from '@playwright/test';

// The live smoke: ONE spec against the deployed Firebase project, with the test account only. Run by hand
// at the final gate: `E2E_LIVE=1 npx playwright test -c playwright.live.config.ts`. It creates `e2e-live-*` projects
// and deletes them again; it touches nothing else.
if (process.env.E2E_LIVE !== '1') throw new Error('The live smoke runs only with E2E_LIVE=1.');

const PORT = 5180;

export default defineConfig({
	testDir: './e2e',
	testMatch: ['**/live-smoke.spec.ts'],
	timeout: 180_000,
	expect: { timeout: 20_000 },
	workers: 1,
	retries: 0,
	reporter: [['list']],
	outputDir: 'test-results/live',
	use: {
		baseURL: `http://127.0.0.1:${PORT}`,
		channel: 'chrome',
		headless: true,
		viewport: { width: 1440, height: 900 },
		screenshot: 'only-on-failure',
		trace: 'off',
	},
	webServer: {
		// The normal development mode: `.env.local`, the deployed project
		command: `npx vite --port ${PORT} --strictPort --host 127.0.0.1`,
		url: `http://127.0.0.1:${PORT}`,
		reuseExistingServer: false,
		timeout: 120_000,
	},
});
