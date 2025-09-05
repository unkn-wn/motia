import React, { memo, useRef, useEffect, useCallback } from 'react';
import { useNotes } from '@contexts/NotesContext';
import { getDefaultShortcutKey, formatKeyDisplay } from '@utils/shortcutsUtils';
import NoteItem from './NoteItem';
import { setNoteItemActions } from './noteItemActions';
import { Edit3Icon } from '@assets/icons';

const NotesSidebar: React.FC = memo(() => {
  const { displayNotes, activeNoteId, onDeleteNote, onJumpToTime, onChangeNoteColor, onUpdateNote } = useNotes();
  const sidebarRef = useRef<HTMLDivElement>(null);
  const lastActiveNoteId = useRef<string | null>(null);

  // Set up global actions for NoteItem components
  useEffect(() => {
    setNoteItemActions({
      onDeleteNote,
      onJumpToTime,
      onChangeNoteColor,
      onUpdateNote,
    });
  }, [onDeleteNote, onJumpToTime, onChangeNoteColor, onUpdateNote]);

  // Handle active note highlighting via direct DOM manipulation
  // This prevents ANY React component rerenders when active note changes
  const updateActiveNoteHighlight = useCallback((newActiveNoteId: string | null) => {
    if (!sidebarRef.current) return;

    // Remove active class from previously active note
    if (lastActiveNoteId.current) {
      const prevActiveElement = sidebarRef.current.querySelector(
        `[data-note-id="${lastActiveNoteId.current}"]`
      ) as HTMLElement;
      if (prevActiveElement) {
        prevActiveElement.classList.remove('ring-2', 'ring-white/60', 'shadow-lg', 'bg-neutral-800/50');
      }
    }

    // Add active class to new active note
    if (newActiveNoteId) {
      const newActiveElement = sidebarRef.current.querySelector(
        `[data-note-id="${newActiveNoteId}"]`
      ) as HTMLElement;
      if (newActiveElement) {
        newActiveElement.classList.add('ring-2', 'ring-white/60', 'shadow-lg', 'bg-neutral-800/50');

        // Always scroll to active note when it changes
        // Use requestAnimationFrame for better performance
        requestAnimationFrame(() => {
          try {
            newActiveElement.scrollIntoView({
              behavior: 'smooth',
              block: 'center',
              inline: 'nearest'
            });
          } catch {
            // Fallback for older browsers
            newActiveElement.scrollIntoView(true);
          }
        });
      }
    }

    lastActiveNoteId.current = newActiveNoteId;
  }, []);

  // Update active highlighting when activeNoteId changes
  // This is the ONLY side effect that happens when playhead crosses boundaries
  useEffect(() => {
    updateActiveNoteHighlight(activeNoteId);
  }, [activeNoteId, updateActiveNoteHighlight]);

  return (
    <div
      ref={sidebarRef}
      className="w-80 rounded-xl bg-neutral-900/95 backdrop-blur-sm border-neutral-700 h-5/6 overflow-y-auto shadow-2xl"
    >
      <div className="p-4 space-y-3">
        {displayNotes.length === 0 ? (
          <div className="text-center py-8 text-neutral-400">
            <Edit3Icon className="w-8 h-8 mx-auto mb-3 opacity-50" />
            <p>No notes yet</p>
            <p className="text-sm">{`Press ${formatKeyDisplay(getDefaultShortcutKey('add-note') || 'A')} or the plus to add a note!`}</p>
          </div>
        ) : (
          displayNotes.map((note) => (
            <NoteItem
              key={note.id}
              note={note}
            />
          ))
        )}
      </div>
    </div>
  );
}, () => {
  // Custom memoization: never rerender the sidebar itself
  // All changes are handled via DOM manipulation
  return true; // Always return true to prevent rerenders
});

NotesSidebar.displayName = 'NotesSidebar';

export default NotesSidebar;
