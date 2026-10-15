import { defineConfig } from '@playwright/test';

const PORT = 5179;

// Browser tests run against the local Firebase emulator only (see e2e/support/emulator.ts), which is started here
// unless one is already running (needs Java 21 on PATH). Chrome is the installed system browser; Playwright never
// downloads one.
export default defineConfig({
	testDir: './e2e',
	testIgnore: ['**/live-smoke.spec.ts'],
	timeout: 90_000,
	expect: { timeout: 10_000 },
	fullyParallel: true,
	workers: 4,
	reporter: [['list']],
	outputDir: 'test-results',
	globalSetup: './e2e/global-setup.ts',
	globalTeardown: './e2e/global-teardown.ts',
	use: {
		baseURL: `http://127.0.0.1:${PORT}`,
		channel: 'chrome',
		headless: true,
		screenshot: 'only-on-failure',
		trace: 'retain-on-failure',
		launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] },
	},
	projects: [
		{ name: 'desktop', use: { viewport: { width: 1440, height: 900 } } },
		{ name: 'touch', use: { viewport: { width: 1024, height: 1366 }, hasTouch: true, isMobile: false } },
	],
	webServer: [
		{
			command: 'npx firebase emulators:start --config firebase.emulator.json --project demo-motia',
			url: 'http://127.0.0.1:8080',
			reuseExistingServer: true,
			timeout: 120_000,
		},
		{
			command: `npx vite --mode e2e --port ${PORT} --strictPort --host 127.0.0.1`,
			url: `http://127.0.0.1:${PORT}`,
			reuseExistingServer: false,
			timeout: 120_000,
		},
	],
});
