import React, { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import type { Note, CanvasTransform } from '@types';
import type { DrawingSession, DrawingPoint } from '@types';

export interface WaveformContextValue {
  // Canvas state
  transform: CanvasTransform;
  setTransform: React.Dispatch<React.SetStateAction<CanvasTransform>>;

  // Interaction state
  isPanning: boolean;
  setIsPanning: React.Dispatch<React.SetStateAction<boolean>>;
  lastPanPoint: { x: number; y: number };
  setLastPanPoint: React.Dispatch<React.SetStateAction<{ x: number; y: number }>>;
  isFollowingPlayhead: boolean;
  setIsFollowingPlayhead: React.Dispatch<React.SetStateAction<boolean>>;

  // Note state
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

  // Drawing state
  isDrawingMode: boolean;
  isDrawing: boolean;
  setIsDrawing: React.Dispatch<React.SetStateAction<boolean>>;
  currentStroke: DrawingPoint[];
  setCurrentStroke: React.Dispatch<React.SetStateAction<DrawingPoint[]>>;
  drawingStartPos: { x: number; y: number } | null;
  setDrawingStartPos: React.Dispatch<React.SetStateAction<{ x: number; y: number } | null>>;
  drawingSession: DrawingSession | null;
  setDrawingSession: React.Dispatch<React.SetStateAction<DrawingSession | null>>;

  // Event handlers
  onAddNote: (time: number, canvasX: number, canvasY: number) => void;
  onUpdateNote: (id: string, content: string) => void;
  onDeleteNote: (id: string) => void;
  onMoveNote?: (id: string, canvasX: number, canvasY: number) => void;
  onAddDrawing?: (time: number, canvasX: number, canvasY: number, drawing: Note['drawing']) => void;

  // Refs
  canvasRef: React.RefObject<HTMLCanvasElement | null>;

  // Constants
  NOTE_LABEL_HIDE_THRESHOLD: number;

  // Context menu state
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

  // Delete confirmation dialog
  deleteConfirmNoteId: string | null;
  setDeleteConfirmNoteId: React.Dispatch<React.SetStateAction<string | null>>;
}

const WaveformContext = createContext<WaveformContextValue | null>(null);

export const useWaveformContext = () => {
  const context = useContext(WaveformContext);
  if (!context) {
    throw new Error('useWaveformContext must be used within a WaveformProvider');
  }
  return context;
};

interface WaveformProviderProps {
  children: ReactNode;
  value: WaveformContextValue;
}

export const WaveformProvider: React.FC<WaveformProviderProps> = ({ children, value }) => {
  return (
    <WaveformContext.Provider value={value}>
      {children}
    </WaveformContext.Provider>
  );
};
