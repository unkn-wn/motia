import { createContext, useContext } from 'react';

export interface NotesActionsContextType {
  onDeleteNote: (id: string) => void;
  onJumpToTime: (time: number) => void;
  onChangeNoteColor: (id: string, color: string) => void;
  onUpdateNote: (id: string, content: string) => void;
}

export const NotesActionsContext = createContext<NotesActionsContextType | null>(null);

export const useNotesActions = () => {
  const ctx = useContext(NotesActionsContext);
  if (!ctx) throw new Error('useNotesActions must be used within a NotesProvider');
  return ctx;
};
