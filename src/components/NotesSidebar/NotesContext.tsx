import React, { createContext, useContext, useMemo, useCallback, type ReactNode } from 'react';
import type { Note } from '../../types/notes';
import { sortNotesByTime } from '@utils/notesUtils';
import { useActiveNote } from './useActiveNote';

interface NotesContextType {
  // Sorted and filtered notes for sidebar display
  displayNotes: Note[];
  activeNoteId: string | null; // Only expose ID for efficient DOM manipulation

  // Actions
  onDeleteNote: (id: string) => void;
  onJumpToTime: (time: number) => void;
  onChangeNoteColor: (id: string, color: string) => void;
  onUpdateNote: (id: string, content: string) => void;
}

const NotesContext = createContext<NotesContextType | null>(null);

interface NotesProviderProps {
  children: ReactNode;
  notes: Note[];
  currentTime: number;
  onDeleteNote: (id: string) => void;
  onJumpToTime: (time: number) => void;
  onChangeNoteColor: (id: string, color: string) => void;
  onUpdateNote: (id: string, content: string) => void;
}

export const NotesProvider: React.FC<NotesProviderProps> = ({
  children,
  notes,
  currentTime,
  onDeleteNote,
  onJumpToTime,
  onChangeNoteColor,
  onUpdateNote,
}) => {
  // Memoize expensive computations with stable references
  const displayNotes = useMemo(() => {
    const textNotes = notes.filter(note => note.type !== 'drawing');
    return sortNotesByTime(textNotes);
  }, [notes]);

  // Use optimized active note calculation - only get the ID
  const { activeNoteId } = useActiveNote(notes, currentTime, 16);

  // Create stable function references that won't cause NoteItem rerenders
  const stableOnDeleteNote = useCallback((id: string) => {
    onDeleteNote(id);
  }, [onDeleteNote]);

  const stableOnJumpToTime = useCallback((time: number) => {
    onJumpToTime(time);
  }, [onJumpToTime]);

  const stableOnChangeNoteColor = useCallback((id: string, color: string) => {
    onChangeNoteColor(id, color);
  }, [onChangeNoteColor]);

  const stableOnUpdateNote = useCallback((id: string, content: string) => {
    onUpdateNote(id, content);
  }, [onUpdateNote]);

  const value = useMemo<NotesContextType>(() => ({
    displayNotes,
    activeNoteId,
    onDeleteNote: stableOnDeleteNote,
    onJumpToTime: stableOnJumpToTime,
    onChangeNoteColor: stableOnChangeNoteColor,
    onUpdateNote: stableOnUpdateNote,
  }), [
    displayNotes,
    activeNoteId,
    stableOnDeleteNote,
    stableOnJumpToTime,
    stableOnChangeNoteColor,
    stableOnUpdateNote,
  ]);

  return (
    <NotesContext.Provider value={value}>
      {children}
    </NotesContext.Provider>
  );
};

export const useNotes = () => {
  const context = useContext(NotesContext);
  if (!context) {
    throw new Error('useNotes must be used within a NotesProvider');
  }
  return context;
};
