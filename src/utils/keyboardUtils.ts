/**
 * Keyboard event utilities and input detection
 */

/**
 * Checks if the user is currently typing in an input field
 */
export const isUserTyping = (): boolean => {
  const activeElement = document.activeElement;
  return !!(activeElement && (
    activeElement.tagName === 'INPUT' ||
    activeElement.tagName === 'TEXTAREA' ||
    activeElement.getAttribute('contenteditable') === 'true'
  ));
};

/**
 * Checks if a keyboard event should trigger shortcuts
 */
export const shouldProcessShortcut = (): boolean => {
  return !isUserTyping();
};

/**
 * Keyboard event handlers for common shortcuts
 */
export const createKeyboardHandler = (handlers: {
  onAddNote?: () => void;
  onEscape?: () => void;
  onEnter?: () => void;
}) => {
  return (e: KeyboardEvent) => {
    if (!shouldProcessShortcut()) return;

    switch (e.key.toLowerCase()) {
      case 'n':
        e.preventDefault();
        handlers.onAddNote?.();
        break;
      case 'escape':
        e.preventDefault();
        handlers.onEscape?.();
        break;
      case 'enter':
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          handlers.onEnter?.();
        }
        break;
    }
  };
};
