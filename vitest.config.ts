import { loadEnv } from 'vite';
import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

// Unit tests for pure modules run in node; the app's path aliases come from the Vite config.
// The `e2e` env (emulator + demo project, `.env.e2e`) replaces the production values from `.env.local`.
export default mergeConfig(
	viteConfig,
	defineConfig({
		test: {
			environment: 'node',
			include: ['src/**/*.test.ts'],
			env: loadEnv('e2e', process.cwd(), 'VITE_'),
			setupFiles: ['./src/test/assertTestEnv.ts'],
		},
	})
);
