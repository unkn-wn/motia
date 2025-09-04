// Simple module-scoped action registry to decouple NoteItem from non-component exports
export type NoteItemActions = {
  onDeleteNote: (id: string) => void;
  onJumpToTime: (time: number) => void;
  onChangeNoteColor: (id: string, color: string) => void;
  onUpdateNote: (id: string, content: string) => void;
} | null;

let actions: NoteItemActions = null;

export const setNoteItemActions = (a: NoteItemActions) => {
  actions = a;
};

export const getNoteItemActions = () => actions;
