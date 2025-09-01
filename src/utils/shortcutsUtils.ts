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
    defaultKey: 'n',
    currentKey: 'n',
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
  }
];

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
};/**
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
  shortcuts: KeyboardShortcut[],
  handlers: Record<string, () => void>
) => {
  return (e: KeyboardEvent) => {
    // Don't handle shortcuts when user is typing or in edit mode
    if (isUserTyping()) return;

    // Find matching shortcut by exact key match
    const shortcut = shortcuts.find(s => s.currentKey === e.key);
    if (!shortcut) return;

    // Check if we have a handler for this action
    const handler = handlers[shortcut.action];
    if (!handler) return;

    e.preventDefault();
    e.stopPropagation();
    handler();
  };
};