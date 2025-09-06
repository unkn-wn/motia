import { createContext } from 'react';
import type { Note, CanvasTransform } from '@types';
import type { DrawingSession, DrawingPoint } from '@types';

export interface WaveformContextValue {
  transform: CanvasTransform;
  setTransform: React.Dispatch<React.SetStateAction<CanvasTransform>>;
  isPanning: boolean;
  setIsPanning: React.Dispatch<React.SetStateAction<boolean>>;
  lastPanPoint: { x: number; y: number };
  setLastPanPoint: React.Dispatch<React.SetStateAction<{ x: number; y: number }>>;
  isFollowingPlayhead: boolean;
  setIsFollowingPlayhead: React.Dispatch<React.SetStateAction<boolean>>;
  notes: Note[];
  editingNote: string | null;
  setEditingNote: React.Dispatch<React.SetStateAction<string | null>>;
  editContent: string;
  setEditContent: React.Dispatch<React.SetStateAction<string>>;
  dragging: {
    id: string;
    startX: number;
    startY: number;
    initialCanvasX: number;
    initialCanvasY: number;
  } | null;
  setDragging: React.Dispatch<React.SetStateAction<{
    id: string;
    startX: number;
    startY: number;
    initialCanvasX: number;
    initialCanvasY: number;
  } | null>>;
  dragOccurred: boolean;
  setDragOccurred: React.Dispatch<React.SetStateAction<boolean>>;
  isDrawingMode: boolean;
  isDrawing: boolean;
  setIsDrawing: React.Dispatch<React.SetStateAction<boolean>>;
  currentStroke: DrawingPoint[];
  setCurrentStroke: React.Dispatch<React.SetStateAction<DrawingPoint[]>>;
  drawingStartPos: { x: number; y: number } | null;
  setDrawingStartPos: React.Dispatch<React.SetStateAction<{ x: number; y: number } | null>>;
  drawingSession: DrawingSession | null;
  setDrawingSession: React.Dispatch<React.SetStateAction<DrawingSession | null>>;
  drawingNoteId: string | null;
  setDrawingNoteId: React.Dispatch<React.SetStateAction<string | null>>;
  onAddNote: (time: number, canvasX: number, canvasY: number) => void;
  onUpdateNote: (id: string, content: string) => void;
  onDeleteNote: (id: string) => void;
  onMoveNote?: (id: string, canvasX: number, canvasY: number) => void;
  onAddDrawing?: (time: number, canvasX: number, canvasY: number, drawing: Note['drawing']) => string;
  onUpdateDrawing?: (id: string, drawing: Note['drawing']) => void;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  NOTE_LABEL_HIDE_THRESHOLD: number;
  contextMenu: {
    isOpen: boolean;
    x: number;
    y: number;
    noteId: string | null;
  };
  setContextMenu: React.Dispatch<React.SetStateAction<{
    isOpen: boolean;
    x: number;
    y: number;
    noteId: string | null;
  }>>;
  deleteConfirmNoteId: string | null;
  setDeleteConfirmNoteId: React.Dispatch<React.SetStateAction<string | null>>;
}

const WaveformContext = createContext<WaveformContextValue | null>(null);
export default WaveformContext;
