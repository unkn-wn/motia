/**
 * Centralized keyboard shortcuts management system
 */

export interface KeyboardShortcut {
	id: string;
	label: string;
	description: string;
	defaultKey: string;
	currentKey: string;
	action: string;
	category: 'playback' | 'notes' | 'navigation' | 'frameEditor';
}

/** The frame editor's tool keys: action `EDITOR_TOOL`, the tool named by the id after `editor-`. */
const EDITOR_TOOL_ACTION = 'EDITOR_TOOL';
const editorTool = (tool: string, label: string, key: string): KeyboardShortcut => ({
	id: `editor-${tool}`,
	label,
	description: `${label} tool in the frame editor`,
	defaultKey: key,
	currentKey: key,
	action: EDITOR_TOOL_ACTION,
	category: 'frameEditor',
});

const DEFAULT_SHORTCUTS: KeyboardShortcut[] = [
	{
		id: 'play-pause',
		label: 'Play/Pause',
		description: 'Toggle audio playback',
		defaultKey: ' ',
		currentKey: ' ',
		action: 'TOGGLE_PLAYBACK',
		category: 'playback',
	},
	{
		id: 'add-note',
		label: 'Add Note',
		description: 'Add note at current time',
		defaultKey: 'a',
		currentKey: 'a',
		action: 'ADD_NOTE',
		category: 'notes',
	},
	{
		id: 'add-frame',
		label: 'Add Frame',
		description: 'Add a storyboard frame at current time',
		defaultKey: 'w',
		currentKey: 'w',
		action: 'ADD_FRAME',
		category: 'notes',
	},
	{
		id: 'rewind',
		label: 'Rewind',
		description: 'Jump back 5 seconds',
		defaultKey: 'ArrowLeft',
		currentKey: 'ArrowLeft',
		action: 'REWIND',
		category: 'playback',
	},
	{
		id: 'forward',
		label: 'Fast Forward',
		description: 'Jump forward 5 seconds',
		defaultKey: 'ArrowRight',
		currentKey: 'ArrowRight',
		action: 'FORWARD',
		category: 'playback',
	},
	{
		id: 'volume-up',
		label: 'Volume Up',
		description: 'Increase volume by 10%',
		defaultKey: 'ArrowUp',
		currentKey: 'ArrowUp',
		action: 'VOLUME_UP',
		category: 'playback',
	},
	{
		id: 'volume-down',
		label: 'Volume Down',
		description: 'Decrease volume by 10%',
		defaultKey: 'ArrowDown',
		currentKey: 'ArrowDown',
		action: 'VOLUME_DOWN',
		category: 'playback',
	},
	{
		id: 'tool-draw',
		label: 'Draw Tool',
		description: 'Enable drawing mode',
		defaultKey: 'd',
		currentKey: 'd',
		action: 'TOOL_DRAW',
		category: 'notes',
	},
	{
		id: 'tool-select',
		label: 'Select Tool',
		description: 'Enable selection tool',
		defaultKey: 's',
		currentKey: 's',
		action: 'TOOL_SELECT',
		category: 'notes',
	},
	{
		id: 'tool-erase',
		label: 'Erase Tool',
		description: 'Enable eraser tool',
		defaultKey: 'f',
		currentKey: 'f',
		action: 'TOOL_ERASE',
		category: 'notes',
	},
	{
		id: 'toggle-sidebar',
		label: 'Toggle Index Rail',
		description: 'Show or hide the index rail',
		defaultKey: 'b',
		currentKey: 'b',
		action: 'TOGGLE_SIDEBAR',
		category: 'navigation',
	},
	// The frame editor has its own keys: canvas shortcuts are off while it is open (play/pause still works)
	editorTool('select', 'Select', 'a'),
	editorTool('pen', 'Pen', 'd'),
	editorTool('rect', 'Rectangle', 'q'),
	editorTool('ellipse', 'Ellipse', 'w'),
	editorTool('line', 'Line', 'e'),
	editorTool('arrow', 'Arrow', 'r'),
	editorTool('text', 'Text', 't'),
	editorTool('box', 'Image', 'b'),
	editorTool('frameRef', 'Frame reference', ''),
];

// Where a key works: the canvas page or the frame editor. Two shortcuts clash only within one; play/pause works in
// both, so it clashes with either.
type Scope = 'canvas' | 'editor';
const scopesOf = (s: KeyboardShortcut): Scope[] =>
	s.action === 'TOGGLE_PLAYBACK' ? ['canvas', 'editor'] : [s.category === 'frameEditor' ? 'editor' : 'canvas'];
const clash = (a: KeyboardShortcut, b: KeyboardShortcut) => scopesOf(a).some((sc) => scopesOf(b).includes(sc));
/** Keys the frame editor already uses (nudge, delete, close); its tools can't take them. */
const EDITOR_RESERVED = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Delete', 'Backspace', 'Escape']);
/** Keys compare as typed, letters in either case. */
const sameKey = (a: string, b: string) => a === b || (a.length === 1 && b.length === 1 && a.toLowerCase() === b.toLowerCase());

// Editor and navigation preferences (non-destructive; global config)
export type EditorEnterBehavior = 'newline' | 'save';
export type PanMouseButton = 'Left' | 'Middle' | 'Right';

import type { NoteColor } from '@utils/colorUtils';

export interface Preferences {
	editorEnterBehavior: EditorEnterBehavior;
	panMouseButton: PanMouseButton;
	historyMax: number;
	defaultNoteColor: NoteColor;
	volume: number;
}

export const DEFAULT_PREFERENCES: Preferences = {
	editorEnterBehavior: 'save',
	panMouseButton: 'Left',
	historyMax: 30,
	defaultNoteColor: 'blue',
	volume: 0.5,
};

let preferences: Preferences = { ...DEFAULT_PREFERENCES };
export const getPreferences = (): Preferences => preferences;
export const setPreferences = (partial: Partial<Preferences>) => {
	preferences = { ...preferences, ...partial };
};

// --- Global Shortcuts Store ---
let shortcutsStore: KeyboardShortcut[] = DEFAULT_SHORTCUTS.map((s) => ({ ...s }));
const shortcutListeners = new Set<(shortcuts: KeyboardShortcut[]) => void>();

export const getShortcuts = (): KeyboardShortcut[] => shortcutsStore;

export const setShortcuts = (next: KeyboardShortcut[]): void => {
	// Replace with a defensive copy to avoid external mutations
	shortcutsStore = next.map((s) => ({ ...s }));
	// Notify listeners
	shortcutListeners.forEach((fn) => {
		try {
			fn(shortcutsStore);
		} catch {
			/* ignore listener errors */
		}
	});
};

export const setShortcutsFromMap = (map: Record<string, string>): void => {
	// Keys in use and keys saved, per scope (a canvas key doesn't take an editor key's place)
	const used: Record<Scope, Set<string>> = { canvas: new Set(), editor: new Set() };
	const saved: Record<Scope, Set<string>> = { canvas: new Set(), editor: new Set() };
	for (const s of DEFAULT_SHORTCUTS) {
		const key = map[s.id];
		if (key) for (const sc of scopesOf(s)) saved[sc].add(key);
	}
	const merged = DEFAULT_SHORTCUTS.map((s) => {
		const key = map[s.id];
		const scopes = scopesOf(s);
		// Saved as unbound (''), or added after the map was saved while its default key is taken there: unbound
		if (key === '' || (key === undefined && scopes.some((sc) => saved[sc].has(s.defaultKey)))) return { ...s, currentKey: '' } as KeyboardShortcut;
		const newKey = key && scopes.every((sc) => !used[sc].has(key)) ? key : s.currentKey;
		for (const sc of scopes) used[sc].add(newKey);
		return { ...s, currentKey: newKey } as KeyboardShortcut;
	});
	setShortcuts(merged);
};

export const subscribeShortcuts = (listener: (shortcuts: KeyboardShortcut[]) => void): (() => void) => {
	shortcutListeners.add(listener);
	return () => {
		shortcutListeners.delete(listener);
	};
};


/**
 * Check if a key combination is valid and not conflicting
 */
export const isValidShortcut = (key: string, shortcuts: KeyboardShortcut[], excludeId?: string): boolean => {
	// Don't allow empty keys but ignore space
	if (!key.trim() && key !== ' ') return false;

	const target = shortcuts.find((s) => s.id === excludeId);
	if (target?.category === 'frameEditor' && EDITOR_RESERVED.has(key)) return false;
	// Conflicts with other shortcuts that work in the same place
	const hasConflict = shortcuts.some((s) => s.id !== excludeId && s.currentKey !== '' && sameKey(s.currentKey, key) && (!target || clash(s, target)));

	return !hasConflict;
};

/** The frame editor tool bound to a key (letters in either case), if any. */
export const editorToolForKey = (key: string): string | null => {
	const hit = getShortcuts().find((s) => s.action === EDITOR_TOOL_ACTION && s.currentKey !== '' && sameKey(s.currentKey, key));
	return hit ? hit.id.slice('editor-'.length) : null;
};

/** The key bound to a frame editor tool ('' when none). */
export const editorToolKey = (shortcuts: KeyboardShortcut[], tool: string): string => shortcuts.find((s) => s.id === `editor-${tool}`)?.currentKey ?? '';

/**
 * Format key display name for UI
 */
export const formatKeyDisplay = (key: string): string => {
	const keyMap: Record<string, string> = {
		ArrowLeft: '←',
		ArrowRight: '→',
		ArrowUp: '↑',
		ArrowDown: '↓',
		' ': 'Space',
		Enter: 'Enter',
		Escape: 'Esc',
		Backspace: 'Backspace',
		Delete: 'Del',
		Tab: 'Tab',
	};

	return keyMap[key] || key.toUpperCase();
};

// Inputs that take no typing; focus on them must not swallow shortcuts
const NON_TEXT_INPUTS = new Set(['range', 'color', 'checkbox', 'radio', 'button']);

/**
 * Check if the user is currently typing in an input field or editing shortcuts
 */
export const isUserTyping = (): boolean => {
	const activeElement = document.activeElement;

	// Check for input fields and textareas, but exclude range inputs (sliders)
	if (
		activeElement &&
		((activeElement.tagName === 'INPUT' && !NON_TEXT_INPUTS.has((activeElement as HTMLInputElement).type)) ||
			activeElement.tagName === 'TEXTAREA' ||
			activeElement.getAttribute('contenteditable') === 'true')
	) {
		return true;
	}

	// Check if keyboard shortcuts panel is in edit mode
	const shortcutsPanel = document.querySelector('[data-shortcuts-editing="true"]');
	if (shortcutsPanel) {
		return true;
	}

	return false;
};

/** True while the full-screen frame editor is open; canvas shortcuts and keys are suspended then. */
export const isFrameEditorOpen = (): boolean => document.querySelector('[data-frame-editor]') !== null;

/**
 * Centralized keyboard event handler
 */
export const createKeyboardHandler = (_shortcuts: KeyboardShortcut[], handlers: Record<string, () => void>) => {
	return (e: KeyboardEvent) => {
		// Don't handle shortcuts when user is typing or in edit mode, or when another handler took the key (Find's `/`)
		if (isUserTyping() || e.defaultPrevented) return;

		// Ignore single-key shortcuts if modifiers are pressed (prevents Ctrl+S triggering 's')
		if (e.ctrlKey || e.metaKey || e.altKey) return;

		// Find matching shortcut by exact key match
		const list = getShortcuts();
		// Canvas keys only (the frame editor reads its own)
		const shortcut = list.find((s) => s.currentKey === e.key && s.category !== 'frameEditor');
		if (!shortcut) return;

		// Check if we have a handler for this action
		const handler = handlers[shortcut.action];
		if (!handler) return;

		// The frame editor owns the keyboard; only play/pause still reaches the canvas page
		if (shortcut.action !== 'TOGGLE_PLAYBACK' && isFrameEditorOpen()) return;

		e.preventDefault();
		e.stopPropagation();
		handler();
	};
};

// Note editing helpers: centralized combos for Save/Cancel while in textareas
export const isNoteEditSubmitCombo = (e: KeyboardEvent | React.KeyboardEvent): boolean => {
	if (e.key !== 'Enter') return false;
	// Behavior depends on preference: 'newline' (default) or 'save'
	// newline: Save on Shift/Ctrl/Cmd + Enter; plain Enter inserts newline
	// save: Save on plain Enter; Shift+Enter inserts newline
	const ev = e as unknown as { ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean };
	const hasCtrlMeta = !!(ev.ctrlKey || ev.metaKey);
	const hasShift = !!ev.shiftKey;
	if (preferences.editorEnterBehavior === 'save') {
		return !(hasCtrlMeta || hasShift);
	}
	return hasCtrlMeta || hasShift;
};

export const isNoteEditCancelKey = (e: KeyboardEvent | React.KeyboardEvent): boolean => {
	return e.key === 'Escape';
};
