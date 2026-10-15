import { describe, expect, it } from 'vitest';
import { getShortcuts, setShortcutsFromMap } from './shortcutsUtils';

const keyOf = (id: string) => getShortcuts().find((s) => s.id === id)?.currentKey;

describe('saved shortcut maps', () => {
	it('binds the new add-frame shortcut to W when W is free', () => {
		setShortcutsFromMap({ 'add-note': 'a', 'tool-draw': 'd' });
		expect(keyOf('add-frame')).toBe('w');
	});

	it('leaves add-frame unbound when the saved map already uses W', () => {
		setShortcutsFromMap({ 'add-note': 'a', 'tool-draw': 'w' });
		expect(keyOf('add-frame')).toBe('');
		expect(keyOf('tool-draw')).toBe('w');
	});

	it('keeps a saved add-frame key', () => {
		setShortcutsFromMap({ 'add-frame': 'q' });
		expect(keyOf('add-frame')).toBe('q');
	});

	it('keeps add-frame unbound after the map is saved and loaded again', () => {
		setShortcutsFromMap({ 'tool-draw': 'w' });
		// What the app saves: id → current key (see shortcutsArrayToMap in lib/db)
		const saved = Object.fromEntries(getShortcuts().map((s) => [s.id, s.currentKey]));
		expect(saved['add-frame']).toBe('');
		setShortcutsFromMap(saved);
		expect(keyOf('add-frame')).toBe('');
		expect(keyOf('tool-draw')).toBe('w');
	});
});
