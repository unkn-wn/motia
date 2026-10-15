// Unit tests must never see production Firebase settings.
if (import.meta.env.VITE_FIREBASE_EMULATOR !== '1' || !String(import.meta.env.VITE_FIREBASE_PROJECT_ID).startsWith('demo-')) {
	throw new Error('Unit tests must run with the e2e env (emulator + demo- project id)');
}
