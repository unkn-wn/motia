import type { Note } from '@types';
import type { StoryboardDoc } from '@/features/storyboard/types';

type Point = { x: number; y: number };

type HistoryEntry = {
  do: () => void;
  undo: () => void;
  label?: string;
  ts: number;
  // Project the entry belongs to (storyboard entries); entries of another project do nothing
  projectId?: string | null;
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

  // Storyboard state executor registered by Home; entries are whole-doc snapshots (the doc is immutable)
  private setStoryboard: ((doc: StoryboardDoc) => void) | null = null;
  private projectId: string | null = null;
  private batchEntries: HistoryEntry[] | null = null;

  // Called before undo/redo so an unfinished storyboard drag is settled first
  private beforeStep: (() => void) | null = null;

  registerStoryboardAccess(setter: (doc: StoryboardDoc) => void, beforeStep?: () => void) {
    this.setStoryboard = setter;
    this.beforeStep = beforeStep ?? null;
  }

  /** Undo never crosses projects: switching project clears the history. */
  setProject(projectId: string | null) {
    if (projectId === this.projectId) return;
    this.projectId = projectId;
    this.clear();
  }

  pushStoryboard(prev: StoryboardDoc, next: StoryboardDoc, label: string) {
    if (!this.setStoryboard || prev === next) return;
    const projectId = this.projectId;
    const apply = (doc: StoryboardDoc) => {
      if (this.projectId !== projectId) return;
      this.setStoryboard!(doc);
    };
    this.push({ do: () => apply(next), undo: () => apply(prev), label, ts: Date.now(), projectId });
  }

  /** Records every entry pushed inside `fn` as one undo step. */
  batch(label: string, fn: () => void) {
    if (this.batchEntries) {
      fn();
      return;
    }
    const entries: HistoryEntry[] = [];
    this.batchEntries = entries;
    try {
      fn();
    } finally {
      // Changes already applied stay undoable even if `fn` throws
      this.batchEntries = null;
      this.pushBatch(label, entries);
    }
  }

  private pushBatch(label: string, entries: HistoryEntry[]) {
    if (entries.length === 0) return;
    if (entries.length === 1) {
      this.push(entries[0]);
      return;
    }
    this.push({
      do: () => entries.forEach((e) => e.do()),
      undo: () => [...entries].reverse().forEach((e) => e.undo()),
      label,
      ts: Date.now(),
    });
  }

  clear() {
    this.stack = [];
    this.pointer = -1;
    this.pendingMoves.clear();
  this.emit();
  }

  canUndo() { return this.pointer >= 0; }
  canRedo() { return this.pointer < this.stack.length - 1; }

  undo(): boolean {
    this.beforeStep?.();
    if (!this.canUndo()) return false;
    const entry = this.stack[this.pointer];
    entry.undo();
    this.pointer -= 1;
  this.emit();
    return true;
  }

  redo(): boolean {
    this.beforeStep?.();
    if (!this.canRedo()) return false;
    const entry = this.stack[this.pointer + 1];
    entry.do();
    this.pointer += 1;
  this.emit();
    return true;
  }

  push(entry: HistoryEntry) {
    if (this.batchEntries) {
      this.batchEntries.push(entry);
      return;
    }
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
export { HistoryManager };