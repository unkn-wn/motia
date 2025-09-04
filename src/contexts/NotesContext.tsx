import React, { createContext, useMemo, useCallback, useContext, type ReactNode } from 'react';
import type { Note } from '@types';
import { sortNotesByTime } from '@utils/notesUtils';
import { useActiveNote } from '@components/NotesSidebar/useActiveNote';

interface NotesContextType {
  displayNotes: Note[];
  activeNoteId: string | null;
  onDeleteNote: (id: string) => void;
  onJumpToTime: (time: number) => void;
  onChangeNoteColor: (id: string, color: string) => void;
  onUpdateNote: (id: string, content: string) => void;
}

export const NotesContext = createContext<NotesContextType | null>(null);

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
  const displayNotes = useMemo(() => {
    const textNotes = notes.filter(note => note.type !== 'drawing');
    return sortNotesByTime(textNotes);
  }, [notes]);

  const { activeNoteId } = useActiveNote(notes, currentTime, 16);

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