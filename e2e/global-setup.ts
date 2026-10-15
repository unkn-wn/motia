import { loadEnv } from 'vite';
import { clearEmulators, emulatorsUp, signUpUser, TEST_EMAIL, TEST_PASSWORD } from './support/emulator';

export default async function globalSetup() {
	// The app under test must be the emulator build (`.env.e2e`), never the deployed project
	const env = loadEnv('e2e', process.cwd(), 'VITE_');
	if (env.VITE_FIREBASE_EMULATOR !== '1' || !env.VITE_FIREBASE_PROJECT_ID?.startsWith('demo-'))
		throw new Error('Browser tests need .env.e2e (emulator flag and a demo- project id).');
	// Playwright starts the emulators (webServer); Auth may answer a little after Firestore
	const deadline = Date.now() + 60_000;
	while (!(await emulatorsUp())) {
		if (Date.now() > deadline) throw new Error('Firebase emulators did not start (`npm run emulators`, needs Java 21).');
		await new Promise((r) => setTimeout(r, 500));
	}
	await clearEmulators();
	await signUpUser(TEST_EMAIL, TEST_PASSWORD);
}
