import { decompressSession } from '@utils/advancedCompression';
import { strokeHitByEraser } from '@utils/drawingUtils';

type Ctx = ReturnType<typeof import('@contexts/objects/WaveformContextObject').useWaveformContext>;

// Accumulate strokes hit by the eraser while the primary button is held; also updates the ring position
export function updateEraserPreview(ctx: Ctx, p: { x: number; y: number }, buttonDown: boolean, radius: number) {
  const { setEraserCursor, erasingStrokeIds, notes, setErasingStrokeIds, transform } = ctx;
  setEraserCursor?.(p);
  if (!buttonDown) return;

  const ERASE_RADIUS = radius / (transform.scale || 1);
  const pendingMap = new Map<string, Set<number>>();
  if (erasingStrokeIds) {
    for (const item of erasingStrokeIds) pendingMap.set(item.noteId, new Set(item.strokeIndexes));
  }
  for (const n of notes) {
    if (n.type !== 'drawing' || !n.drawing?.compressed) continue;
    let compressed = n.drawing.compressed as unknown as import('@types').CompressedStroke[];
    if (typeof compressed === 'string') {
      try { compressed = JSON.parse(compressed); } catch { continue; }
    }
    const strokes = decompressSession(compressed) as Array<{ points: Array<{ x: number; y: number }>; strokeWidth: number; color: string }>;
    let hitSet = pendingMap.get(n.id);
    if (!hitSet) { hitSet = new Set(); pendingMap.set(n.id, hitSet); }
    for (let si = 0; si < strokes.length; si++) {
      const s = strokes[si];
      const pts = s.points as Array<{ x: number; y: number }>;
      if (!pts || pts.length < 2) continue;
      if (strokeHitByEraser(pts, n.canvasX, n.canvasY, p, ERASE_RADIUS)) hitSet.add(si);
    }
  }
  const pending: { noteId: string; strokeIndexes: number[] }[] = [];
  for (const [noteId, set] of pendingMap.entries()) {
    if (set.size) pending.push({ noteId, strokeIndexes: Array.from(set).sort((a, b) => a - b) });
  }
  setErasingStrokeIds?.(pending);
}
