import { decompressSession } from '@utils/advancedCompression';
import { strokeIntersectsRect, recomputeBoundsFromStrokes, compressDrawingAdaptive } from '@utils/drawingUtils';

type Ctx = ReturnType<typeof import('@contexts/objects/WaveformContextObject').useWaveformContext>;

// Update selection box position while dragging an existing box (move mode)
export function handleSelectionMove(ctx: Ctx, e: MouseEvent | PointerEvent, toCanvas: (x: number, y: number) => { x: number; y: number }) {
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
}

// Create/resize selection box and compute stroke hits (create mode)
export function handleSelectionCreate(ctx: Ctx, e: MouseEvent | PointerEvent, toCanvas: (x: number, y: number) => { x: number; y: number }) {
  const { selectionBox, setSelectionBox, notes, setSelectedDrawingIds, setSelectedStrokeGroups } = ctx;
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
}

// Commit translation of the selected strokes after finishing a move
export function finalizeSelectionMove(ctx: Ctx) {
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