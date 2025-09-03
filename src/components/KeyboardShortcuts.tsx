import React, { useState, useCallback, useEffect } from 'react';
import type { KeyboardShortcut } from '@utils/shortcutsUtils';
import { formatKeyDisplay, isValidShortcut } from '@utils/shortcutsUtils';
import { XIcon, KeyboardIcon, RotateCcwIcon } from '@assets/icons';

interface KeyboardShortcutsProps {
  isOpen: boolean;
  onClose: () => void;
  shortcuts: KeyboardShortcut[];
  onUpdateShortcut: (id: string, newKey: string) => void;
  onResetShortcuts: () => void;
}

const KeyboardShortcuts: React.FC<KeyboardShortcutsProps> = ({
  isOpen,
  onClose,
  shortcuts,
  onUpdateShortcut,
  onResetShortcuts
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [keyError, setKeyError] = useState<string>('');

  const handleCancel = useCallback(() => {
    setEditingId(null);
    setKeyError('');
  }, []);

  // Handle ESC key to close panel or cancel editing
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (!isOpen) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();

        if (editingId) {
          // Cancel editing
          handleCancel();
        } else {
          // Close panel
          onClose();
        }
      }
    };

    window.addEventListener('keydown', handleEscape, { capture: true });
    return () => window.removeEventListener('keydown', handleEscape, { capture: true });
  }, [isOpen, editingId, onClose, handleCancel]);

  const handleEditStart = useCallback((shortcut: KeyboardShortcut) => {
    setEditingId(shortcut.id);
    setKeyError('');
  }, []);

  const handleKeyCapture = useCallback((e: KeyboardEvent) => {
    if (!editingId) return;

    e.preventDefault();
    e.stopPropagation();

    const key = e.key;

    // Don't capture escape (used for canceling)
    if (key === 'Escape') {
      return;
    }

    // Validate the key and auto-save if valid
    if (!isValidShortcut(key, shortcuts, editingId)) {
      setKeyError(`"${key === ' ' ? 'Space' : key}" is already in use`);
      // Clear error after 2 seconds
      setTimeout(() => setKeyError(''), 2000);
    } else {
      // Auto-save the shortcut
      onUpdateShortcut(editingId, key);
      setEditingId(null);
      setKeyError('');
    }
  }, [shortcuts, editingId, onUpdateShortcut]);

  // Add global key capture when editing
  useEffect(() => {
    if (editingId) {
      window.addEventListener('keydown', handleKeyCapture, { capture: true });
      return () => window.removeEventListener('keydown', handleKeyCapture, { capture: true });
    }
  }, [editingId, handleKeyCapture]);

  if (!isOpen) return null;

  const categories = [
    { id: 'notes', label: 'Notes', shortcuts: shortcuts.filter(s => s.category === 'notes') },
    { id: 'playback', label: 'Playback', shortcuts: shortcuts.filter(s => s.category === 'playback') },
    { id: 'navigation', label: 'Navigation', shortcuts: shortcuts.filter(s => s.category === 'navigation') }
  ].filter(cat => cat.shortcuts.length > 0);

  return (
    <div
      className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-neutral-900/95 rounded-xl shadow-2xl w-full max-w-md border border-neutral-700/50"
        data-shortcuts-editing={!!editingId}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between py-2 px-4 border-b border-neutral-700/50">
          <div className="flex items-center space-x-2">
            <KeyboardIcon className="w-4 h-4 text-neutral-400" />
            <h2 className="text-sm font-medium text-white">Shortcuts</h2>
          </div>
          <div className="flex items-center space-x-1">
            <button
              onClick={onResetShortcuts}
              className="p-1.5 hover:bg-neutral-800 rounded text-neutral-400 hover:text-white transition-colors"
              title="Reset to defaults"
            >
              <RotateCcwIcon className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-neutral-800 rounded text-neutral-400 hover:text-white transition-colors"
            >
              <XIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="max-h-96 overflow-y-auto">
          <div className="p-3 space-y-4">
            {categories.map(category => (
              <div key={category.id}>
                <div className="space-y-1.5">
                  {category.shortcuts.map(shortcut => (
                    <div
                      key={shortcut.id}
                      className="flex items-center justify-between py-2 px-3 bg-neutral-800/50 rounded-lg group"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-white truncate">{shortcut.label}</div>
                      </div>

                      <div className="flex items-center space-x-2 ml-3">
                        {editingId === shortcut.id ? (
                          <div className="flex items-center space-x-2">
                            <div className="px-2 py-1 bg-blue-600 border border-blue-500 rounded text-xs text-center min-w-[60px] animate-pulse">
                              <span className="text-blue-100">Press key...</span>
                            </div>
                            <button
                              onClick={handleCancel}
                              className="p-1 bg-neutral-600 hover:bg-neutral-700 text-white cursor-pointer rounded transition-colors"
                              title="Cancel (ESC)"
                            >
                              <XIcon className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <kbd
                            className="px-2 py-1 bg-neutral-800 border border-neutral-700 rounded text-xs text-neutral-300 min-w-[60px] text-center cursor-pointer hover:bg-neutral-600 transition-colors"
                            onClick={() => handleEditStart(shortcut)}
                            title={`Click to edit ${shortcut.label} shortcut`}
                          >
                            {formatKeyDisplay(shortcut.currentKey)}
                          </kbd>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          {keyError && (
            <div className="px-3 pb-2">
              <div className="text-xs text-red-400 bg-red-900/20 border border-red-800/30 rounded px-2 py-1">
                {keyError}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-2 border-t border-neutral-700/50 bg-neutral-900/50">
          <p className="text-xs text-neutral-500 text-center">
            {editingId ?
              'Press any key to assign. ESC to cancel.' :
              'Click key to edit. ESC to close.'
            }
          </p>
        </div>
      </div>
    </div>
  );
};

export default KeyboardShortcuts;