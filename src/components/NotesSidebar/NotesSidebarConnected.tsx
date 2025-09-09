import React, { memo } from 'react';
import { NotesProvider } from '@contexts/NotesContext';
import NotesSidebar from './index';
import type { Note } from '../../types/notes';
import { useStableDisplayNotes } from '@/hooks/useStableDisplayNotes';
import { areTextNotesEqualByContent } from '@utils/notesCompare';

interface Props {
  notes: Note[];
  onDeleteNote: (id: string) => void;
  onJumpToTime: (time: number) => void;
  onChangeNoteColor: (id: string, color: string) => void;
  onUpdateNote: (id: string, content: string) => void;
}

const NotesSidebarConnected: React.FC<Props> = memo(({ notes, onDeleteNote, onJumpToTime, onChangeNoteColor, onUpdateNote }) => {
  const displayNotes = useStableDisplayNotes(notes);

  return (
    <NotesProvider
      notes={notes}
      onDeleteNote={onDeleteNote}
      onJumpToTime={onJumpToTime}
      onChangeNoteColor={onChangeNoteColor}
      onUpdateNote={onUpdateNote}
    >
      <NotesSidebar displayNotes={displayNotes} />
    </NotesProvider>
  );
}, (prev, next) => {
  // Prevent rerendering when only canvas positions change during drag
  if (prev.notes.length !== next.notes.length) return false;
  return areTextNotesEqualByContent(prev.notes, next.notes);
});

NotesSidebarConnected.displayName = 'NotesSidebarConnected';

export default NotesSidebarConnected;
