import React, { memo, useEffect, useRef } from 'react';
import { useNotesActions } from '@contexts/objects/NotesContextObject';
import { getDefaultShortcutKey, formatKeyDisplay } from '@utils/shortcutsUtils';
import NoteItem from './NoteItem';
import { setNoteItemActions } from './noteItemActions';
import { Edit3Icon } from '@assets/icons';
import { currentTimeStore } from '@components/AudioControls/state';
import { findActiveNote } from '@utils/notesUtils';

interface NotesSidebarProps { displayNotes: import('@types').Note[]; onClose?: () => void }

const NotesSidebar: React.FC<NotesSidebarProps> = memo(({ displayNotes, onClose }) => {
  const { onDeleteNote, onJumpToTime, onChangeNoteColor, onUpdateNote } = useNotesActions();
  const sidebarRef = useRef<HTMLDivElement>(null);
  const startXRef = React.useRef<number | null>(null);
  const startYRef = React.useRef<number | null>(null);
  const trackingRef = React.useRef<boolean>(false);
  // Set up global actions for NoteItem components
  // No dependency on currentTime
  React.useEffect(() => {
    setNoteItemActions({
      onDeleteNote,
      onJumpToTime,
      onChangeNoteColor,
      onUpdateNote,
    });
  }, [onDeleteNote, onJumpToTime, onChangeNoteColor, onUpdateNote]);

  // Highlight active note without causing React rerenders
  useEffect(() => {
    let lastActiveId: string | null = null;

    const handleTimeChange = () => {
      const container = sidebarRef.current;
      if (!container) return;
      const time = currentTimeStore.getSnapshot();
      const active = findActiveNote(displayNotes, time);
      const newId = active?.id || null;
      if (newId === lastActiveId) return;

      if (lastActiveId) {
        const prevEl = container.querySelector(`[data-note-id="${lastActiveId}"]`) as HTMLElement | null;
        prevEl?.classList.remove('ring-2', 'ring-white/60', 'shadow-lg', 'bg-neutral-800/50');
      }
      if (newId) {
        const newEl = container.querySelector(`[data-note-id="${newId}"]`) as HTMLElement | null;
        if (newEl) {
          newEl.classList.add('ring-2', 'ring-white/60', 'shadow-lg', 'bg-neutral-800/50');
          requestAnimationFrame(() => {
            try {
              newEl.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
            } catch {
              newEl.scrollIntoView(true);
            }
          });
        }
      }
      lastActiveId = newId;
    };

    // initial highlight (in case of paused at time)
    handleTimeChange();
    const unsub = currentTimeStore.subscribe(handleTimeChange);
    return unsub;
  }, [displayNotes]);

  return (
    <div
      ref={sidebarRef}
      className="w-80 rounded-xl bg-neutral-900 backdrop-blur-sm border-neutral-700 h-5/6 overflow-y-auto shadow-2xl touch-pan-y"
      onPointerDown={(e) => {
        if (e.pointerType !== 'touch') return; // only handle touch swipes
        startXRef.current = e.clientX;
        startYRef.current = e.clientY;
        trackingRef.current = true;
      }}
      onPointerMove={(e) => {
        if (!trackingRef.current || onClose == null) return;
        if (startXRef.current == null || startYRef.current == null) return;
        const dx = e.clientX - startXRef.current;
        const dy = e.clientY - startYRef.current;
        // Consider as swipe-right when mostly horizontal and to the right beyond threshold
        if (dx > 80 && Math.abs(dy) < 40 && Math.abs(dx) > Math.abs(dy) * 1.5) {
          trackingRef.current = false;
          startXRef.current = null;
          startYRef.current = null;
          try { onClose(); } catch { }
        }
      }}
      onPointerUp={() => { trackingRef.current = false; startXRef.current = null; startYRef.current = null; }}
      onPointerCancel={() => { trackingRef.current = false; startXRef.current = null; startYRef.current = null; }}
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
}, (prevProps, nextProps) => {
  // Only rerender when the stable displayNotes reference changes.
  // Container/Connected compute a stable array and reuse identity when only position/timeflow change.
  return prevProps.displayNotes === nextProps.displayNotes;
});

NotesSidebar.displayName = 'NotesSidebar';

export default NotesSidebar;
