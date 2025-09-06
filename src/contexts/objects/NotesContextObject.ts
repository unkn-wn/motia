import { createContext, useContext } from 'react';
import type { Note } from '@types';

export interface NotesContextType {
  displayNotes: Note[];
  activeNoteId: string | null;
  onDeleteNote: (id: string) => void;
  onJumpToTime: (time: number) => void;
  onChangeNoteColor: (id: string, color: string) => void;
  onUpdateNote: (id: string, content: string) => void;
}

export const NotesContext = createContext<NotesContextType | null>(null);

export const useNotes = () => {
  const ctx = useContext(NotesContext);
  if (!ctx) throw new Error('useNotes must be used within a NotesProvider');
  return ctx;
};
