import type { Note } from '@types';

type Point = { x: number; y: number };

type HistoryEntry = {
  do: () => void;
  undo: () => void;
  label?: string;
  ts: number;
};

class HistoryManager {
  private stack: HistoryEntry[] = [];
  private pointer = -1; // points to last applied entry
  private max = 200;
  private listeners = new Set<() => void>();

  // Notes state executors registered by Home
  private getNotes: (() => Note[]) | null = null;
  private setNotes: ((notes: Note[]) => void) | null = null;

  registerNotesAccess(getter: () => Note[], setter: (notes: Note[]) => void) {
    this.getNotes = getter;
    this.setNotes = setter;
  }

  clear() {
    this.stack = [];
    this.pointer = -1;
  this.emit();
  }

  canUndo() { return this.pointer >= 0; }
  canRedo() { return this.pointer < this.stack.length - 1; }

  undo(): boolean {
    if (!this.canUndo()) return false;
    const entry = this.stack[this.pointer];
    entry.undo();
    this.pointer -= 1;
  this.emit();
    return true;
  }

  redo(): boolean {
    if (!this.canRedo()) return false;
    const entry = this.stack[this.pointer + 1];
    entry.do();
    this.pointer += 1;
  this.emit();
    return true;
  }

  push(entry: HistoryEntry) {
    // Truncate future if we had undone
    if (this.pointer < this.stack.length - 1) {
      this.stack = this.stack.slice(0, this.pointer + 1);
    }
    this.stack.push(entry);
    if (this.stack.length > this.max) {
      this.stack.shift();
    }
    // Always point to the last applied entry
    this.pointer = this.stack.length - 1;
  this.emit();
  }

  // Helpers to push common note actions
  pushAddNote(note: Note) {
    if (!this.setNotes || !this.getNotes) return;
    const add = () => this.setNotes!([...this.getNotes!(), note]);
    const remove = () => this.setNotes!(this.getNotes!().filter(n => n.id !== note.id));
    this.push({ do: add, undo: remove, label: 'AddNote', ts: Date.now() });
  }

  pushDeleteNote(noteSnapshot: Note) {
    if (!this.setNotes || !this.getNotes) return;
    const remove = () => this.setNotes!(this.getNotes!().filter(n => n.id !== noteSnapshot.id));
    const insert = () => this.setNotes!([...this.getNotes!(), noteSnapshot]);
    this.push({ do: remove, undo: insert, label: 'DeleteNote', ts: Date.now() });
  }

  pushUpdateNoteContent(id: string, prev: string, next: string) {
    if (!this.setNotes || !this.getNotes) return;
    const apply = (content: string) => this.setNotes!(this.getNotes!().map(n => n.id === id ? { ...n, content } : n));
    this.push({ do: () => apply(next), undo: () => apply(prev), label: 'UpdateNote', ts: Date.now() });
  }

  pushChangeNoteColor(id: string, prev: string, next: string) {
    if (!this.setNotes || !this.getNotes) return;
    const apply = (color: string) => this.setNotes!(this.getNotes!().map(n => n.id === id ? { ...n, color } : n));
    this.push({ do: () => apply(next), undo: () => apply(prev), label: 'ChangeColor', ts: Date.now() });
  }

  pushUpdateDrawing(id: string, prev: Note['drawing'], next: Note['drawing']) {
    if (!this.setNotes || !this.getNotes) return;
    const apply = (drawing: Note['drawing']) => this.setNotes!(this.getNotes!().map(n => n.id === id ? { ...n, drawing } : n));
    this.push({ do: () => apply(next), undo: () => apply(prev), label: 'UpdateDrawing', ts: Date.now() });
  }

  pushMoveNote(id: string, from: Point, to: Point) {
    if (!this.setNotes || !this.getNotes) return;
    if (from.x === to.x && from.y === to.y) return; // no-op
    const apply = (p: Point) => this.setNotes!(this.getNotes!().map(n => n.id === id ? { ...n, canvasX: p.x, canvasY: p.y } : n));
    this.push({ do: () => apply(to), undo: () => apply(from), label: 'MoveNote', ts: Date.now() });
  }

  // Coalesced dragging helpers
  private pendingMoves: Map<string, Point> = new Map();
  beginMove(id: string, start: Point) {
    this.pendingMoves.set(id, start);
  }
  endMove(id: string, end: Point) {
    const start = this.pendingMoves.get(id);
    if (!start) return;
    this.pendingMoves.delete(id);
    this.pushMoveNote(id, start, end);
  }

  // Configuration
  setMax(maxEntries: number) {
    const clamped = Math.max(1, Math.min(200, Math.floor(maxEntries)));
    this.max = clamped;
    // If current stack exceeds new max, trim oldest and fix pointer
    if (this.stack.length > this.max) {
      const overflow = this.stack.length - this.max;
      this.stack.splice(0, overflow);
      this.pointer = Math.min(this.pointer, this.stack.length - 1);
    }
    this.emit();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }
  private emit() { this.listeners.forEach((l) => l()); }
}

export const history = new HistoryManager();
export type { HistoryManager };