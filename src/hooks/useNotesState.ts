import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore, useState } from 'react';
import type { Note } from '@types';
import { createNote } from '@utils/notesUtils';
import { getPreferences } from '@utils/shortcutsUtils';
import { history } from '@utils/history';

export function useNotesState() {
  const [notes, setNotes] = useState<Note[]>([]);
  const notesRef = useRef<Note[]>([]);

  // Keep a live ref of notes for History getters
  useEffect(() => {
    notesRef.current = notes;
  }, [notes]);

  // Register History accessors once and initialize caps from preferences
  useEffect(() => {
    history.registerNotesAccess(() => notesRef.current, (n: Note[]) => setNotes(n));
    const prefs = getPreferences();
    if (prefs?.historyMax) history.setMax(prefs.historyMax);
  }, []);

  const handleAddNote = useCallback((time: number, canvasX: number, canvasY: number) => {
    const prefs = getPreferences();
    const color = prefs?.defaultNoteColor ?? 'blue';
    const newNote = createNote(time, canvasX, canvasY, '', color);
    setNotes(prev => [...prev, newNote]);
    history.pushAddNote(newNote);
  }, []);

  const handleUpdateNote = useCallback((id: string, content: string) => {
    const prevNote = notesRef.current.find(n => n.id === id);
    const prevContent = prevNote?.content ?? '';
    if (prevContent === content) return;
    setNotes(prev => prev.map(n => (n.id === id ? { ...n, content } : n)));
    history.pushUpdateNoteContent(id, prevContent, content);
  }, []);

  const handleDeleteNote = useCallback((id: string) => {
    const snap = notesRef.current.find(n => n.id === id);
    if (snap) history.pushDeleteNote(snap);
    setNotes(prev => prev.filter(n => n.id !== id));
  }, []);

  const handleMoveNote = useCallback((id: string, canvasX: number, canvasY: number) => {
    setNotes(prev => prev.map(n => (n.id === id ? { ...n, canvasX, canvasY } : n)));
  }, []);

  const handleAddDrawing = useCallback((time: number, canvasX: number, canvasY: number, drawing: Note['drawing']) => {
    const newNote = createNote(time, canvasX, canvasY, '', 'gray');
    newNote.type = 'drawing';
    newNote.drawing = drawing;
    setNotes(prev => [...prev, newNote]);
    history.pushAddNote(newNote);
    return newNote.id;
  }, []);

  const handleUpdateDrawing = useCallback((id: string, drawing: Note['drawing']) => {
    const prevNote = notesRef.current.find(n => n.id === id);
    const prevDrawing = prevNote?.drawing ?? null;
    const nextDrawing = drawing;
    if (JSON.stringify(prevDrawing) === JSON.stringify(nextDrawing)) return;
    setNotes(prev => prev.map(n => (n.id === id ? ({ ...n, drawing: { ...nextDrawing } } as Note) : n)));
    history.pushUpdateDrawing(id, prevDrawing as Note['drawing'], nextDrawing);
  }, []);

  const handleChangeNoteColor = useCallback((id: string, color: string) => {
    const prevNote = notesRef.current.find(n => n.id === id);
    const prevColor = prevNote?.color ?? color;
    if (prevColor === color) return;
    setNotes(prev => prev.map(n => (n.id === id ? { ...n, color } : n)));
    history.pushChangeNoteColor(id, prevColor, color);
  }, []);

  // Stable Undo/Redo flags + actions
  const flags = useSyncExternalStore(
    history.subscribe.bind(history),
    () => (history.canUndo() ? 1 : 0) | (history.canRedo() ? 2 : 0)
  );
  const canUndo = (flags & 1) !== 0;
  const canRedo = (flags & 2) !== 0;

  const handleUndo = useCallback(() => { history.undo(); }, []);
  const handleRedo = useCallback(() => { history.redo(); }, []);

  return useMemo(() => ({
    notes,
    setNotes,
    handleAddNote,
    handleUpdateNote,
    handleDeleteNote,
    handleMoveNote,
    handleAddDrawing,
    handleUpdateDrawing,
    handleChangeNoteColor,
    canUndo,
    canRedo,
    handleUndo,
    handleRedo,
  }), [
    notes,
    setNotes,
    handleAddNote,
    handleUpdateNote,
    handleDeleteNote,
    handleMoveNote,
    handleAddDrawing,
    handleUpdateDrawing,
    handleChangeNoteColor,
    canUndo,
    canRedo,
    handleUndo,
    handleRedo,
  ]);
}
