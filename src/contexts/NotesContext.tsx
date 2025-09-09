import React, { useMemo, useCallback, type ReactNode } from 'react';
import type { Note } from '@types';
import { NotesActionsContext } from './objects/NotesContextObject';

interface NotesProviderProps {
  children: ReactNode;
  notes: Note[];
  onDeleteNote: (id: string) => void;
  onJumpToTime: (time: number) => void;
  onChangeNoteColor: (id: string, color: string) => void;
  onUpdateNote: (id: string, content: string) => void;
}

export const NotesProvider: React.FC<NotesProviderProps> = ({
  children,
  onDeleteNote,
  onJumpToTime,
  onChangeNoteColor,
  onUpdateNote,
}) => {
  // Display notes are now owned by the consumer; provider exposes actions only to avoid re-renders


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

  const actionsValue = useMemo(() => ({
    onDeleteNote: stableOnDeleteNote,
    onJumpToTime: stableOnJumpToTime,
    onChangeNoteColor: stableOnChangeNoteColor,
    onUpdateNote: stableOnUpdateNote,
  }), [stableOnDeleteNote, stableOnJumpToTime, stableOnChangeNoteColor, stableOnUpdateNote]);

  return (
    <NotesActionsContext.Provider value={actionsValue}>
      {children}
    </NotesActionsContext.Provider>
  );
};
