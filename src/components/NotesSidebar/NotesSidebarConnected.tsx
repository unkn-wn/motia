import React, { memo } from 'react';
import { useAudio } from '@contexts/objects/AudioContextObject';
import { NotesProvider } from '@contexts/NotesContext';
import NotesSidebar from './index';
import type { Note } from '../../types/notes';

interface Props {
  notes: Note[];
  onDeleteNote: (id: string) => void;
  onJumpToTime: (time: number) => void;
  onChangeNoteColor: (id: string, color: string) => void;
  onUpdateNote: (id: string, content: string) => void;
}

const NotesSidebarConnected: React.FC<Props> = memo(({ notes, onDeleteNote, onJumpToTime, onChangeNoteColor, onUpdateNote }) => {
  const { currentTime } = useAudio();

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
});

NotesSidebarConnected.displayName = 'NotesSidebarConnected';

export default NotesSidebarConnected;
