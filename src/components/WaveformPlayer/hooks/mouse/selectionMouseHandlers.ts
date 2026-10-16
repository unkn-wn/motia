import { decompressSession } from '@utils/advancedCompression';
import { strokeIntersectsRect, recomputeBoundsFromStrokes, compressDrawingAdaptive } from '@utils/drawingUtils';
import { history } from '@utils/history';
import { framesInRect } from '@/features/storyboard/canvas/layout';
import { setCardPositions } from '@/features/storyboard/model';
import type { StoryboardContextValue } from '@/features/storyboard/StoryboardContext';

type Ctx = ReturnType<typeof import('@contexts/objects/WaveformContextObject').useWaveformContext>;
type Storyboard = Pick<StoryboardContextValue, 'liveUpdate' | 'endLiveEdit' | 'handleDeleteFrames'>;

/** Starts moving the current selection box: remembers where strokes and cards were. */
export function startSelectionMove(ctx: Ctx, storyboard: Pick<StoryboardContextValue, 'beginLiveEdit'>, canvasX: number, canvasY: number) {
  const { selectionBox, setSelectionBox, selectedDrawingIds, notes, frames, selectedFrameIds } = ctx;
  if (!selectionBox) return;
  setSelectionBox?.({
    ...selectionBox,
    dragging: true,
    mode: 'move',
    startPointerX: canvasX,
    startPointerY: canvasY,
    originX: selectionBox.x,
    originY: selectionBox.y,
    originalPositions: Array.from(selectedDrawingIds || []).map((id) => {
      const n = notes.find((n) => n.id === id);
      return { id, x: n?.canvasX || 0, y: n?.canvasY || 0 };
    }),
    framePositions: frames.filter((f) => selectedFrameIds.has(f.id)).map((f) => ({ id: f.id, x: f.canvasX, y: f.canvasY })),
  });
  // Cards move live; if the move is interrupted they go back with the strokes
  storyboard.beginLiveEdit('revert', 'MoveFrames');
}

// Update selection box position while dragging an existing box (move mode); selected cards move live
export function handleSelectionMove(
  ctx: Ctx,
  e: MouseEvent | PointerEvent,
  toCanvas: (x: number, y: number) => { x: number; y: number },
  storyboard: Storyboard
) {
  const { selectionBox, setSelectionBox, selectedStrokeGroups, setMovingStrokePreview } = ctx;
  if (!selectionBox?.dragging || selectionBox.mode !== 'move') return;
  const cur = toCanvas(e.clientX, e.clientY);
  const dx = cur.x - (selectionBox.startPointerX || cur.x);
  const dy = cur.y - (selectionBox.startPointerY || cur.y);
  setSelectionBox?.((sb) => (sb ? { ...sb, x: (sb.originX || 0) + dx, y: (sb.originY || 0) + dy } : sb));
  if (selectedStrokeGroups && selectedStrokeGroups.length === 1) {
    const group = selectedStrokeGroups[0];
    setMovingStrokePreview?.({ noteId: group.noteId, strokeIndexes: group.strokeIndexes, dx, dy });
  }
  const origins = selectionBox.framePositions;
  if (origins && origins.length) {
    const positions = new Map(origins.map((p) => [p.id, { x: p.x + dx, y: p.y + dy }]));
    storyboard.liveUpdate((doc) => setCardPositions(doc, positions));
  }
}

// Create/resize selection box and compute stroke hits (create mode)
export function handleSelectionCreate(ctx: Ctx, e: MouseEvent | PointerEvent, toCanvas: (x: number, y: number) => { x: number; y: number }) {
  const { selectionBox, setSelectionBox, notes, setSelectedDrawingIds, setSelectedStrokeGroups, frames, board, setSelectedFrameIds } = ctx;
  if (!selectionBox?.dragging || selectionBox.mode !== 'create') return;
  const anchorX = selectionBox.anchorX ?? selectionBox.x;
  const anchorY = selectionBox.anchorY ?? selectionBox.y;
  const cur = toCanvas(e.clientX, e.clientY);
  const minX = Math.min(anchorX, cur.x);
  const minY = Math.min(anchorY, cur.y);
  const w = Math.abs(cur.x - anchorX);
  const h = Math.abs(cur.y - anchorY);
  setSelectionBox?.((sb) => (sb ? { ...sb, x: minX, y: minY, w, h, anchorX, anchorY } : sb));

  const selectedStrokeGroupsLocal: { noteId: string; strokeIndexes: number[] }[] = [];
  const selectedNotes = new Set<string>();
  for (const n of notes) {
    if (n.type !== 'drawing' || !n.drawing?.compressed) continue;
    let compressed = n.drawing.compressed as unknown as import('@types').CompressedStroke[];
    if (typeof compressed === 'string') {
      try { compressed = JSON.parse(compressed); } catch { continue; }
    }
    let strokes: Array<{ points: Array<{ x: number; y: number }> }> = [];
    try { strokes = decompressSession(compressed) as Array<{ points: Array<{ x: number; y: number }> }>; } catch { /* ignore */ }
  const hitIndexes: number[] = [];
    for (let si = 0; si < strokes.length; si++) {
      const s = strokes[si];
      const pts = s.points;
      if (!pts || pts.length < 2) continue;
      if (strokeIntersectsRect(pts, n.canvasX, n.canvasY, { x: minX, y: minY, w, h }, 0)) hitIndexes.push(si);
    }
    if (hitIndexes.length) {
      selectedStrokeGroupsLocal.push({ noteId: n.id, strokeIndexes: hitIndexes });
      if (hitIndexes.length === strokes.length) selectedNotes.add(n.id);
    }
  }
  setSelectedDrawingIds?.(selectedNotes);
  setSelectedStrokeGroups?.(selectedStrokeGroupsLocal);
  setSelectedFrameIds(framesInRect({ x: minX, y: minY, w, h }, frames, board));
}

/** Commits a selection move: the strokes and the cards land as one undo step. */
export function commitSelectionMove(ctx: Ctx, storyboard: Storyboard) {
  history.batch('MoveSelection', () => {
    finalizeSelectionMove(ctx);
    storyboard.endLiveEdit('MoveFrames');
  });
}

// Commit translation of the selected strokes after finishing a move
function finalizeSelectionMove(ctx: Ctx) {
  const { selectionBox, selectedStrokeGroups, notes, setMovingStrokePreview, onUpdateDrawing } = ctx;
  if (!selectionBox || selectionBox.mode !== 'move' || !selectedStrokeGroups || selectedStrokeGroups.length !== 1) return;
  const group = selectedStrokeGroups[0];
  const note = notes.find((n) => n.id === group.noteId);
  if (!note?.drawing?.compressed) return;
  try {
    let compressed = note.drawing.compressed as unknown as import('@types').CompressedStroke[];
    if (typeof compressed === 'string') compressed = JSON.parse(compressed);
    const fullStrokes = decompressSession(compressed) as Array<{ points: Array<{ x: number; y: number }>; strokeWidth: number; color: string }>;
    const dx = selectionBox.x - (selectionBox.originX ?? selectionBox.x);
    const dy = selectionBox.y - (selectionBox.originY ?? selectionBox.y);
    if (dx === 0 && dy === 0) return;
    for (const si of group.strokeIndexes) {
      const stroke = fullStrokes[si];
      if (!stroke) continue;
      for (const p of stroke.points) { p.x += dx; p.y += dy; }
    }
    const compressionResult = compressDrawingAdaptive(fullStrokes as unknown as import('@types').DrawingStroke[]);
    const newBounds = recomputeBoundsFromStrokes(fullStrokes as unknown as import('@types').DrawingStroke[]);
    onUpdateDrawing?.(note.id, {
      ...note.drawing,
      compressed: compressionResult.strokes,
      bounds: newBounds,
      originalSize: compressionResult.originalSize,
      compressedSize: compressionResult.compressedSize,
      compressionRatio: compressionResult.reduction,
    });
  } finally {
    setMovingStrokePreview?.(null);
  }
}

/**
 * Delete the strokes and frame cards selected with the selection tool, as one undo step.
 * Strokes follow the same decompress→filter→recompress→onUpdateDrawing pattern used by the eraser (commitEraser).
 */
export function deleteSelection(ctx: Ctx, storyboard: Storyboard): boolean {
  const { selectedStrokeGroups, selectedFrameIds } = ctx;
  if (!selectedStrokeGroups?.length && selectedFrameIds.size === 0) return false;
  history.batch('DeleteSelection', () => {
    deleteSelectedStrokes(ctx);
    if (selectedFrameIds.size > 0) storyboard.handleDeleteFrames(selectedFrameIds);
  });
  ctx.setSelectionBox?.(null);
  ctx.setSelectedFrameIds(new Set());
  return true;
}

function deleteSelectedStrokes(ctx: Ctx): boolean {
  const {
    selectedStrokeGroups,
    notes,
    onUpdateDrawing,
    setSelectionBox,
    setSelectedStrokeGroups,
    setSelectedDrawingIds,
    setMovingStrokePreview,
  } = ctx;

  if (!selectedStrokeGroups || selectedStrokeGroups.length === 0) return false;

  for (const group of selectedStrokeGroups) {
    const note = notes.find((n) => n.id === group.noteId);
    if (!note?.drawing?.compressed) continue;

    let compressed = note.drawing.compressed as unknown as import('@types').CompressedStroke[];
    if (typeof compressed === 'string') {
      try { compressed = JSON.parse(compressed); } catch { continue; }
    }

    const fullStrokes = decompressSession(compressed) as Array<{
      points: Array<{ x: number; y: number }>;
      strokeWidth: number;
      color: string;
    }>;

    const remaining = fullStrokes.filter((_, idx) => !group.strokeIndexes.includes(idx));

    if (remaining.length === fullStrokes.length) continue; // nothing to delete

    if (remaining.length === 0) {
      onUpdateDrawing?.(note.id, {
        ...note.drawing,
        compressed: [],
        bounds: { width: 0, height: 0 },
      });
      continue;
    }

    const compressionResult = compressDrawingAdaptive(
      remaining as unknown as import('@types').DrawingStroke[]
    );
    const newBounds = recomputeBoundsFromStrokes(
      remaining as unknown as import('@types').DrawingStroke[]
    );

    onUpdateDrawing?.(note.id, {
      ...note.drawing,
      compressed: compressionResult.strokes,
      bounds: newBounds,
      originalSize: compressionResult.originalSize,
      compressedSize: compressionResult.compressedSize,
      compressionRatio: compressionResult.reduction,
    });
  }

  // Clear selection state
  setSelectionBox?.(null);
  setSelectedStrokeGroups?.([]);
  setSelectedDrawingIds?.(new Set());
  setMovingStrokePreview?.(null);
  ctx.setShowSelectionActions?.(false);

  return true;
}