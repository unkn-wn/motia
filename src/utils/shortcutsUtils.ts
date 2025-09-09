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
  category: 'playback' | 'notes' | 'navigation';
}

// Touch gestures mapping (non-breaking: additive)
export type TouchGesture = 'tap' | 'double-tap' | 'long-press' | 'two-finger-tap' | 'pinch' | 'pan';

export interface TouchShortcut {
  id: string;
  label: string;
  description: string;
  gesture: TouchGesture;
  action: string;
  category: 'playback' | 'notes' | 'navigation';
}

export const DEFAULT_TOUCH_SHORTCUTS: TouchShortcut[] = [
  {
    id: 'tap-toggle-play',
    label: 'Tap to Play/Pause',
    description: 'Single tap toggles audio playback',
    gesture: 'tap',
    action: 'TOGGLE_PLAYBACK',
    category: 'playback',
  },
  {
    id: 'double-tap-add-note',
    label: 'Double Tap Add Note',
    description: 'Double tap to add a note at tapped time',
    gesture: 'double-tap',
    action: 'ADD_NOTE',
    category: 'notes',
  },
  {
    id: 'two-finger-tap-recenter',
    label: 'Two-finger Recenter',
    description: 'Two-finger tap to recenter on playhead',
    gesture: 'two-finger-tap',
    action: 'RECENTER',
    category: 'navigation',
  },
  // Pinch and pan are continuous gestures handled in canvas; listed here for docs
  {
    id: 'pinch-zoom',
    label: 'Pinch to Zoom',
    description: 'Pinch gesture to zoom waveform',
    gesture: 'pinch',
    action: 'ZOOM',
    category: 'navigation',
  },
  {
    id: 'pan-canvas',
    label: 'Drag to Pan',
    description: 'Drag to pan around the canvas',
    gesture: 'pan',
    action: 'PAN',
    category: 'navigation',
  },
];

export const DEFAULT_SHORTCUTS: KeyboardShortcut[] = [
  {
    id: 'play-pause',
    label: 'Play/Pause',
    description: 'Toggle audio playback',
    defaultKey: ' ',
    currentKey: ' ',
    action: 'TOGGLE_PLAYBACK',
    category: 'playback'
  },
  {
    id: 'add-note',
    label: 'Add Note',
    description: 'Add note at current time',
    defaultKey: 'a',
    currentKey: 'a',
    action: 'ADD_NOTE',
    category: 'notes'
  },
  {
    id: 'rewind',
    label: 'Rewind',
    description: 'Jump back 5 seconds',
    defaultKey: 'ArrowLeft',
    currentKey: 'ArrowLeft',
    action: 'REWIND',
    category: 'playback'
  },
  {
    id: 'forward',
    label: 'Fast Forward',
    description: 'Jump forward 5 seconds',
    defaultKey: 'ArrowRight',
    currentKey: 'ArrowRight',
    action: 'FORWARD',
    category: 'playback'
  },
  {
    id: 'volume-up',
    label: 'Volume Up',
    description: 'Increase volume by 10%',
    defaultKey: 'ArrowUp',
    currentKey: 'ArrowUp',
    action: 'VOLUME_UP',
    category: 'playback'
  },
  {
    id: 'volume-down',
    label: 'Volume Down',
    description: 'Decrease volume by 10%',
    defaultKey: 'ArrowDown',
    currentKey: 'ArrowDown',
    action: 'VOLUME_DOWN',
    category: 'playback'
  },
  {
    id: 'toggle-drawing-mode',
    label: 'Toggle Drawing Mode',
    description: 'Enable/disable drawing mode',
    defaultKey: 'd',
    currentKey: 'd',
    action: 'TOGGLE_DRAWING_MODE',
    category: 'notes'
  },
  {
    id: 'toggle-sidebar',
    label: 'Toggle Sidebar',
    description: 'Show or hide notes sidebar',
    defaultKey: 's',
    currentKey: 's',
    action: 'TOGGLE_SIDEBAR',
    category: 'navigation'
  },
  {
    id: 'show-shortcuts',
    label: 'Show Shortcuts',
    description: 'Open keyboard shortcuts panel',
    defaultKey: '?',
    currentKey: '?',
    action: 'SHOW_SHORTCUTS',
    category: 'navigation'
  }
];

// Editor and navigation preferences (non-destructive; global config)
export type EditorEnterBehavior = 'newline' | 'save';
export type PanMouseButton = 'Left' | 'Middle' | 'Right';

import type { NoteColor } from '@utils/colorUtils';

export interface Preferences {
  editorEnterBehavior: EditorEnterBehavior;
  panMouseButton: PanMouseButton;
  historyMax: number;
  defaultNoteColor: NoteColor;
}

export const DEFAULT_PREFERENCES: Preferences = {
  editorEnterBehavior: 'save',
  panMouseButton: 'Left',
  historyMax: 30,
  defaultNoteColor: 'blue',
};

let preferences: Preferences = { ...DEFAULT_PREFERENCES };
export const getPreferences = (): Preferences => preferences;
export const setPreferences = (partial: Partial<Preferences>) => {
  preferences = { ...preferences, ...partial };
};

// --- Global Shortcuts Store ---
let shortcutsStore: KeyboardShortcut[] = DEFAULT_SHORTCUTS.map(s => ({ ...s }));
const shortcutListeners = new Set<(shortcuts: KeyboardShortcut[]) => void>();

export const getShortcuts = (): KeyboardShortcut[] => shortcutsStore;

export const setShortcuts = (next: KeyboardShortcut[]): void => {
  // Replace with a defensive copy to avoid external mutations
  shortcutsStore = next.map(s => ({ ...s }));
  // Notify listeners
  shortcutListeners.forEach((fn) => {
    try { fn(shortcutsStore); } catch {/* ignore listener errors */}
  });
};

export const setShortcutsFromMap = (map: Record<string, string>): void => {
  const used = new Set<string>();
  const merged = DEFAULT_SHORTCUTS.map(s => {
    const key = map[s.id];
    const newKey = key && !used.has(key) ? key : s.currentKey;
    used.add(newKey);
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

// Single reset entrypoint used by UI to reset everything
export const resetAllShortcutsAndPreferences = (): KeyboardShortcut[] => {
  preferences = { ...DEFAULT_PREFERENCES };
  // Reset global shortcuts store to defaults
  const defaults = DEFAULT_SHORTCUTS.map(s => ({ ...s }));
  setShortcuts(defaults);
  // Return a fresh array copy of defaults so callers can set state
  return defaults;
};

// Lightweight accessor for UI hints: get default display key by shortcut id
export const getDefaultShortcutKey = (id: string): string | undefined => {
  const sc = DEFAULT_SHORTCUTS.find(s => s.id === id);
  return sc?.defaultKey;
};

/**
 * Check if a key combination is valid and not conflicting
 */
export const isValidShortcut = (key: string, shortcuts: KeyboardShortcut[], excludeId?: string): boolean => {
  // Don't allow empty keys but ignore space
  if (!key.trim() && key !== ' ') return false;

  // Check for conflicts with other shortcuts (exact match)
  const hasConflict = shortcuts.some(shortcut =>
    shortcut.id !== excludeId && shortcut.currentKey === key
  );

  return !hasConflict;
};

/**
 * Format key display name for UI
 */
export const formatKeyDisplay = (key: string): string => {
  const keyMap: Record<string, string> = {
    'ArrowLeft': '←',
    'ArrowRight': '→',
    'ArrowUp': '↑',
    'ArrowDown': '↓',
    ' ': 'Space',
    'Enter': 'Enter',
    'Escape': 'Esc',
    'Backspace': 'Backspace',
    'Delete': 'Del',
    'Tab': 'Tab'
  };

  return keyMap[key] || key.toUpperCase();
};

/**
 * Check if the user is currently typing in an input field or editing shortcuts
 */
export const isUserTyping = (): boolean => {
  const activeElement = document.activeElement;

  // Check for input fields and textareas, but exclude range inputs (sliders)
  if (activeElement && (
    (activeElement.tagName === 'INPUT' && (activeElement as HTMLInputElement).type !== 'range') ||
    activeElement.tagName === 'TEXTAREA' ||
    activeElement.getAttribute('contenteditable') === 'true'
  )) {
    return true;
  }

  // Check if keyboard shortcuts panel is in edit mode
  const shortcutsPanel = document.querySelector('[data-shortcuts-editing="true"]');
  if (shortcutsPanel) {
    return true;
  }

  return false;
};

/**
 * Centralized keyboard event handler
 */
export const createKeyboardHandler = (
  _shortcuts: KeyboardShortcut[],
  handlers: Record<string, () => void>
) => {
  return (e: KeyboardEvent) => {
    // Don't handle shortcuts when user is typing or in edit mode
    if (isUserTyping()) return;

    // Find matching shortcut by exact key match
    const list = getShortcuts();
    const shortcut = list.find(s => s.currentKey === e.key);
    if (!shortcut) return;

    // Check if we have a handler for this action
    const handler = handlers[shortcut.action];
    if (!handler) return;

    e.preventDefault();
    e.stopPropagation();
    handler();
  };
};

// Touch helpers: map gesture to a handler by action name
export const createTouchHandler = (
  shortcuts: TouchShortcut[],
  handlers: Record<string, () => void>
) => {
  return (gesture: TouchGesture) => {
    const shortcut = shortcuts.find(s => s.gesture === gesture);
    if (!shortcut) return;
    const handler = handlers[shortcut.action];
    if (!handler) return;
    handler();
  };
};

// Note editing helpers: centralized combos for Save/Cancel while in textareas
export const isNoteEditSubmitCombo = (e: KeyboardEvent | React.KeyboardEvent): boolean => {
  if (e.key !== 'Enter') return false;
  // Behavior depends on preference: 'newline' (default) or 'save'
  // newline: Save on Shift/Ctrl/Cmd + Enter; plain Enter inserts newline
  // save: Save on plain Enter; Shift+Enter inserts newline
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyE: any = e as any;
  const hasCtrlMeta = !!(anyE.ctrlKey || anyE.metaKey);
  const hasShift = !!anyE.shiftKey;
  if (preferences.editorEnterBehavior === 'save') {
    return !(hasCtrlMeta || hasShift);
  }
  return hasCtrlMeta || hasShift;
};

export const isNoteEditCancelKey = (e: KeyboardEvent | React.KeyboardEvent): boolean => {
  return e.key === 'Escape';
};