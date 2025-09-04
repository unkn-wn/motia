import React, { memo } from 'react';
import { NotesProvider } from '@contexts/NotesContext';
import NotesSidebar from './index';
import type { Note } from '../../types/notes';

interface NotesSidebarContainerProps {
  notes: Note[];
  currentTime: number;
  onDeleteNote: (id: string) => void;
  onJumpToTime: (time: number) => void;
  onChangeNoteColor: (id: string, color: string) => void;
  onUpdateNote: (id: string, content: string) => void;
}

// Container component that provides notes context and handles prop changes
const NotesSidebarContainer: React.FC<NotesSidebarContainerProps> = memo((props) => {
  const {
    notes,
    currentTime,
    onDeleteNote,
    onJumpToTime,
    onChangeNoteColor,
    onUpdateNote,
  } = props;

  return (
    <NotesProvider
      notes={notes}
      currentTime={currentTime}
      onDeleteNote={onDeleteNote}
      onJumpToTime={onJumpToTime}
      onChangeNoteColor={onChangeNoteColor}
      onUpdateNote={onUpdateNote}
    >
      <NotesSidebar />
    </NotesProvider>
  );
}, (prevProps, nextProps) => {
  // Custom comparison to prevent rerenders during note movements
  // Only rerender if:
  // 1. Number of notes changed (note added/deleted)
  // 2. Note content actually changed (not just position)
  // 3. Active note changed during playback

  if (prevProps.notes.length !== nextProps.notes.length) return false;

  // Check if note content changed (not position)
  const prevTextNotes = prevProps.notes.filter(n => n.type !== 'drawing');
  const nextTextNotes = nextProps.notes.filter(n => n.type !== 'drawing');

  if (prevTextNotes.length !== nextTextNotes.length) return false;

  // Check for content changes (ignore canvasX, canvasY changes)
  for (let i = 0; i < prevTextNotes.length; i++) {
    const prevNote = prevTextNotes[i];
    const nextNote = nextTextNotes.find(n => n.id === prevNote.id);

    if (!nextNote) return false; // Note was removed

    // Only check content-related properties, ignore position
    if (
      prevNote.content !== nextNote.content ||
      prevNote.color !== nextNote.color ||
      prevNote.time !== nextNote.time
    ) {
      return false;
    }
  }

  // Check if we crossed a note boundary (active note changed)
  const findActiveNote = (notes: Note[], time: number) => {
    const textNotes = notes.filter(n => n.type !== 'drawing');
    const sortedNotes = [...textNotes].sort((a, b) => a.time - b.time);
    for (let i = sortedNotes.length - 1; i >= 0; i--) {
      if (sortedNotes[i].time <= time) {
        return sortedNotes[i];
      }
    }
    return null;
  };

  const prevActiveNote = findActiveNote(prevProps.notes, prevProps.currentTime);
  const nextActiveNote = findActiveNote(nextProps.notes, nextProps.currentTime);

  if (prevActiveNote?.id !== nextActiveNote?.id) return false;

  // All other prop changes can be ignored (like note position updates)
  return true;
});

NotesSidebarContainer.displayName = 'NotesSidebarContainer';

export default NotesSidebarContainer;
