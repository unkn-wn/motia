import { describe, expect, it } from 'vitest';
import { editorToolForKey, getShortcuts, isValidShortcut, setShortcutsFromMap } from './shortcutsUtils';

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

describe('frame editor keys', () => {
	it('get their defaults from a map saved before they existed, although the canvas uses the same letters', () => {
		// An old saved map: A, D and W are canvas keys; in the editor they are free
		setShortcutsFromMap({ 'add-note': 'a', 'tool-draw': 'd', 'add-frame': 'w', 'play-pause': ' ' });
		expect(keyOf('editor-select')).toBe('a');
		expect(keyOf('editor-pen')).toBe('d');
		expect(keyOf('editor-ellipse')).toBe('w');
		expect(editorToolForKey('a')).toBe('select');
		expect(editorToolForKey('Q')).toBe('rect');
	});

	it('clash with each other and with play/pause, not with canvas keys', () => {
		setShortcutsFromMap({});
		const all = getShortcuts();
		// Another editor tool's key, or play/pause's: refused
		expect(isValidShortcut('q', all, 'editor-select')).toBe(false);
		expect(isValidShortcut(' ', all, 'editor-select')).toBe(false);
		// A canvas key (S selects on the canvas): fine in the editor
		expect(isValidShortcut('s', all, 'editor-select')).toBe(true);
		// Keys the editor already uses: refused
		expect(isValidShortcut('ArrowLeft', all, 'editor-select')).toBe(false);
		// And the canvas doesn't clash with editor keys either (Q is the editor's rectangle)
		expect(isValidShortcut('q', all, 'add-note')).toBe(true);
	});

	it('a rebound key is saved and loaded again', () => {
		setShortcutsFromMap({ 'editor-rect': 'x' });
		const saved = Object.fromEntries(getShortcuts().map((s) => [s.id, s.currentKey]));
		setShortcutsFromMap(saved);
		expect(editorToolForKey('x')).toBe('rect');
		expect(editorToolForKey('q')).toBeNull();
	});
});
