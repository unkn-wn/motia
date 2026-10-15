// Test mode talks to the local Firebase emulator. It is only allowed with a `demo-` project id,
// so a test build can never reach a real Firebase project.
export function shouldUseEmulator(emulatorFlag: string | undefined, projectId: string | undefined): boolean {
	if (emulatorFlag !== '1') return false;
	if (!projectId || !projectId.startsWith('demo-')) {
		throw new Error(`Firebase emulator mode requires a "demo-" project id (got "${projectId ?? ''}")`);
	}
	return true;
}
