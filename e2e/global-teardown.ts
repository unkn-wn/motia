import { clearEmulators } from './support/emulator';

export default async function globalTeardown() {
	await clearEmulators();
}
