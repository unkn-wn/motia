import { createContext, useContext } from 'react';
import type { Note, CanvasTransform, ToolMode } from '@types';
import type { DrawingSession, DrawingPoint } from '@types';
import type { BoardFormat, Frame, StoryboardSymbol } from '@/features/storyboard/types';
import type { FrameHitKind } from '@/features/storyboard/canvas/layout';

/** A pointer drag on the canvas: a note card, or a frame's card, anchor dot or span end tick. */
export type CanvasDrag = {
	kind: 'note' | FrameHitKind;
	id: string;
	startX: number;
	startY: number;
	initialCanvasX: number;
	initialCanvasY: number;
	initialTime?: number;
	initialEndTime?: number;
};

export type ContextMenuState = {
	isOpen: boolean;
	x: number;
	y: number;
	noteId: string | null;
	frameId?: string | null;
};

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
	dragging: CanvasDrag | null;
	setDragging: React.Dispatch<React.SetStateAction<CanvasDrag | null>>;
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
	contextMenu: ContextMenuState;
	// Layout cache shared between renderer and hit testing
	noteLayoutCache?: Map<string, { key: string; lines: string[]; noteHeight: number }>;
	setContextMenu: React.Dispatch<React.SetStateAction<ContextMenuState>>;
	deleteConfirmNoteId: string | null;
	setDeleteConfirmNoteId: React.Dispatch<React.SetStateAction<string | null>>;
	// Tooling
	toolMode?: ToolMode; // preferred over isDrawingMode going forward
	setToolMode?: React.Dispatch<React.SetStateAction<ToolMode>>;
	// Selection (drawings only for now)
	selectionBox?: {
		x: number;
		y: number;
		w: number;
		h: number;
		dragging?: boolean;
		mode?: 'create' | 'move';
		startPointerX?: number;
		startPointerY?: number;
		originX?: number;
		originY?: number;
		originalPositions?: Array<{ id: string; x: number; y: number }>;
		/** Card positions when a selection move started */
		framePositions?: Array<{ id: string; x: number; y: number }>;
		anchorX?: number;
		anchorY?: number;
	} | null;
	setSelectionBox?: React.Dispatch<
		React.SetStateAction<{
			x: number;
			y: number;
			w: number;
			h: number;
			dragging?: boolean;
			mode?: 'create' | 'move';
			startPointerX?: number;
			startPointerY?: number;
			originX?: number;
			originY?: number;
			originalPositions?: Array<{ id: string; x: number; y: number }>;
			framePositions?: Array<{ id: string; x: number; y: number }>;
			anchorX?: number;
			anchorY?: number;
		} | null>
	>;
	// Storyboard frames drawn on the canvas, and the cards picked by the select tool
	frames: Frame[];
	board: BoardFormat;
	/** Symbols, for boxes drawn in frame thumbnails */
	symbols: StoryboardSymbol[];
	selectedFrameIds: Set<string>;
	/** True while the frame editor covers the canvas: no drawing, no animation loop. */
	renderPaused: boolean;
	/**
	 * Navigation (index rail, Find): seek to `time` and centre the view on `at` (world units; default the waveform
	 * at that time). Stops following the playhead. Never edits.
	 */
	jumpTo: (time: number, at?: { x: number; y: number }) => void;
	/** Changes a note's colour (the note menu's colour dots), one undo step */
	onChangeNoteColor?: (id: string, color: string) => void;
	setSelectedFrameIds: React.Dispatch<React.SetStateAction<Set<string>>>;
	selectedDrawingIds?: Set<string>;
	setSelectedDrawingIds?: React.Dispatch<React.SetStateAction<Set<string>>>;
	selectedStrokeGroups?: { noteId: string; strokeIndexes: number[] }[];
	setSelectedStrokeGroups?: React.Dispatch<React.SetStateAction<{ noteId: string; strokeIndexes: number[] }[]>>;
	// Live move preview for selected strokes
	movingStrokePreview?: { noteId: string; strokeIndexes: number[]; dx: number; dy: number } | null;
	setMovingStrokePreview?: React.Dispatch<React.SetStateAction<{ noteId: string; strokeIndexes: number[]; dx: number; dy: number } | null>>;
	// Erasing state
	erasingStrokeIds?: { noteId: string; strokeIndexes: number[] }[]; // pending deletion preview
	setErasingStrokeIds?: React.Dispatch<React.SetStateAction<{ noteId: string; strokeIndexes: number[] }[]>>;
	eraserCursor?: { x: number; y: number } | null;
	setEraserCursor?: React.Dispatch<React.SetStateAction<{ x: number; y: number } | null>>;
	// Selection actions popup (shown on tap-inside-selection on mobile)
	showSelectionActions?: boolean;
	setShowSelectionActions?: React.Dispatch<React.SetStateAction<boolean>>;
	// Orientation ('vertical' or 'horizontal')
	orientation?: import('@types').CanvasOrientation;
	setOrientation?: React.Dispatch<React.SetStateAction<import('@types').CanvasOrientation>>;
}

export const WaveformContext = createContext<WaveformContextValue | null>(null);

export const useWaveformContext = () => {
	const ctx = useContext(WaveformContext);
	if (!ctx) throw new Error('useWaveformContext must be used within a WaveformProvider');
	return ctx;
};
