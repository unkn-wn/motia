import { describe, expect, it } from 'vitest';
import { shouldUseEmulator } from './emulatorGuard';

describe('shouldUseEmulator', () => {
	it('is off when the emulator flag is not set', () => {
		expect(shouldUseEmulator(undefined, 'motia-prod')).toBe(false);
		expect(shouldUseEmulator('', 'motia-prod')).toBe(false);
		expect(shouldUseEmulator('0', 'demo-motia')).toBe(false);
	});

	it('is on with a demo- project id', () => {
		expect(shouldUseEmulator('1', 'demo-motia')).toBe(true);
	});

	it('throws with a non-demo project id', () => {
		expect(() => shouldUseEmulator('1', 'motia-prod')).toThrow(/demo-/);
		expect(() => shouldUseEmulator('1', 'my-demo-project')).toThrow(/demo-/);
		expect(() => shouldUseEmulator('1', undefined)).toThrow(/demo-/);
		expect(() => shouldUseEmulator('1', '')).toThrow(/demo-/);
	});
});
