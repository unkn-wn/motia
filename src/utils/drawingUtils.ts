// Drawing utilities: point simplification, compression wiring, hit-tests, and bounds.

import type {
  DrawingPoint,
  DrawingStroke,
  CompressionResult,
  CompressedStroke
} from '@types';
import { compressStrokeAdvancedAdaptive } from './advancedCompression';


export const optimizeDrawingPoints = (points: DrawingPoint[], tolerance: number = 1.0): DrawingPoint[] => {
  if (points.length <= 2) return points;
  return douglasPeucker(points, tolerance);
};

function douglasPeucker(points: DrawingPoint[], tolerance: number): DrawingPoint[] {
  if (points.length <= 2) return points;
  let maxDistance = 0;
  let maxIndex = 0;
  const end = points.length - 1;
  for (let i = 1; i < end; i++) {
    const distance = perpendicularDistance(points[i], points[0], points[end]);
    if (distance > maxDistance) {
      maxDistance = distance;
      maxIndex = i;
    }
  }
  if (maxDistance > tolerance) {
    const left = douglasPeucker(points.slice(0, maxIndex + 1), tolerance);
    const right = douglasPeucker(points.slice(maxIndex), tolerance);
    return [...left.slice(0, -1), ...right];
  }
  return [points[0], points[end]];
}

// Perpendicular distance from a point to a line segment
function perpendicularDistance(point: DrawingPoint, lineStart: DrawingPoint, lineEnd: DrawingPoint): number {
  const A = point.x - lineStart.x;
  const B = point.y - lineStart.y;
  const C = lineEnd.x - lineStart.x;
  const D = lineEnd.y - lineStart.y;

  const dot = A * C + B * D;
  const lenSq = C * C + D * D;

  if (lenSq === 0) {
    // Line start and end are the same point
    return Math.sqrt(A * A + B * B);
  }

  const param = dot / lenSq;

  let xx, yy;

  if (param < 0) {
    xx = lineStart.x;
    yy = lineStart.y;
  } else if (param > 1) {
    xx = lineEnd.x;
    yy = lineEnd.y;
  } else {
    xx = lineStart.x + param * C;
    yy = lineStart.y + param * D;
  }

  const dx = point.x - xx;
  const dy = point.y - yy;
  return Math.sqrt(dx * dx + dy * dy);
}

// Approximate memory footprint for raw drawing data (for telemetry/heuristics)
export const calculateDrawingMemoryFootprint = (strokes: DrawingStroke[]): number => {
  let totalPoints = 0;
  strokes.forEach(stroke => { totalPoints += stroke.points.length; });
  const pointsSize = totalPoints * 16; // approx bytes per point
  const strokeMetadataSize = strokes.length * 50; // approx metadata
  return pointsSize + strokeMetadataSize;
};

// Length of serialized compressed data (cheap proxy for storage size)
export const calculateCompressedSize = (compressedData: unknown): number => JSON.stringify(compressedData).length;

// Compress an array of strokes using an adaptive strategy with inter-stroke optimization
export const compressDrawingAdaptive = (strokes: DrawingStroke[]): CompressionResult => {
  const originalSize = JSON.stringify(strokes).length;

  // First, compress each stroke individually
  const compressedStrokes = strokes.map(compressStrokeAdvancedAdaptive);

  // Then, optimize common properties across strokes
  const optimizedSession = optimizeStrokeSession(compressedStrokes);

  const compressedSize = JSON.stringify(optimizedSession);
  const finalSize = compressedSize.length;

  return {
    strokes: optimizedSession,
    originalSize,
    compressedSize: finalSize,
    reduction: Math.round(((originalSize - finalSize) / originalSize) * 100)
  };
};

// Extract and hoist common stroke properties into a session wrapper when possible
function optimizeStrokeSession(strokes: CompressedStroke[]): CompressedStroke[] {
  if (strokes.length <= 1) return strokes;

  // Extract common properties
  const firstStroke = strokes[0];
  const firstData = firstStroke.data as { c?: string; color?: string; w?: number; strokeWidth?: number };
  const commonColor = firstData.c ?? firstData.color;
  const commonStrokeWidth = firstData.w ?? firstData.strokeWidth;

  // Check if all strokes share the same color and width
  const allSameColor = strokes.every(stroke => {
    const d = stroke.data as { c?: string; color?: string };
    return (d.c ?? d.color) === commonColor;
  });
  const allSameWidth = strokes.every(stroke => {
    const d = stroke.data as { w?: number; strokeWidth?: number };
    return (d.w ?? d.strokeWidth) === commonStrokeWidth;
  });

  if (!allSameColor && !allSameWidth) {
    return strokes; // No common properties to extract
  }

  // Create session with common properties
  const optimizedStrokes = strokes.map(stroke => {
    const newData = { ...(stroke.data as Record<string, unknown>) } as Record<string, unknown>;

    if (allSameColor) {
      delete (newData as { c?: string }).c;
      delete (newData as { color?: string }).color;
    }
    if (allSameWidth) {
      delete (newData as { w?: number }).w;
      delete (newData as { strokeWidth?: number }).strokeWidth;
    }

    return {
      ...stroke,
      data: newData
    };
  });

  // Wrap in session format with extracted common properties
  return [{
    type: 'session',
    data: {
      strokes: optimizedStrokes,
      commonColor: allSameColor ? commonColor : undefined,
      commonStrokeWidth: allSameWidth ? commonStrokeWidth : undefined
    }
  } as CompressedStroke];
}

// --- Geometry helpers ---

export interface Bounds { minX: number; minY: number; maxX: number; maxY: number }

export const getStrokeBounds = (points: { x: number; y: number }[]): Bounds => {
  if (!points.length) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  let minX = points[0].x, maxX = points[0].x, minY = points[0].y, maxY = points[0].y;
  for (let i = 1; i < points.length; i++) {
    const p = points[i];
    if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
};

export const strokeAABBOverlap = (
  points: { x: number; y: number }[],
  noteOffsetX: number,
  noteOffsetY: number,
  box: { x: number; y: number; w: number; h: number }
): boolean => {
  if (!points || points.length === 0) return false;
  const b = getStrokeBounds(points);
  const worldX1 = noteOffsetX + b.minX;
  const worldX2 = noteOffsetX + b.maxX;
  const worldY1 = noteOffsetY + b.minY;
  const worldY2 = noteOffsetY + b.maxY;
  return !(worldX2 < box.x || worldX1 > box.x + box.w || worldY2 < box.y || worldY1 > box.y + box.h);
};

// Precise polyline-rectangle intersection
const pointInRect = (px: number, py: number, r: { x: number; y: number; w: number; h: number }, tol = 0) =>
  px >= r.x - tol && px <= r.x + r.w + tol && py >= r.y - tol && py <= r.y + r.h + tol;

const segmentsIntersect = (
  ax: number, ay: number, bx: number, by: number,
  cx: number, cy: number, dx: number, dy: number
) => {
  const det = (x1: number, y1: number, x2: number, y2: number) => x1 * y2 - y1 * x2;
  const rdx = bx - ax, rdy = by - ay;
  const sdx = dx - cx, sdy = dy - cy;
  const denom = det(rdx, rdy, sdx, sdy);
  if (Math.abs(denom) < 1e-12) {
    // Parallel or colinear: do a simple bbox overlap check on projections
    const minAx = Math.min(ax, bx), maxAx = Math.max(ax, bx);
    const minAy = Math.min(ay, by), maxAy = Math.max(ay, by);
    const minCx = Math.min(cx, dx), maxCx = Math.max(cx, dx);
    const minCy = Math.min(cy, dy), maxCy = Math.max(cy, dy);
    return !(maxAx < minCx || maxCx < minAx || maxAy < minCy || maxCy < minAy);
  }
  const u = det(cx - ax, cy - ay, rdx, rdy) / denom;
  const t = det(cx - ax, cy - ay, sdx, sdy) / denom;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
};

const segmentIntersectsRect = (
  ax: number, ay: number, bx: number, by: number, r: { x: number; y: number; w: number; h: number }
) => {
  // Test the segment against each rect edge
  const x1 = r.x, y1 = r.y, x2 = r.x + r.w, y2 = r.y + r.h;
  // Top edge (x1,y1) -> (x2,y1)
  if (segmentsIntersect(ax, ay, bx, by, x1, y1, x2, y1)) return true;
  // Bottom edge
  if (segmentsIntersect(ax, ay, bx, by, x1, y2, x2, y2)) return true;
  // Left edge
  if (segmentsIntersect(ax, ay, bx, by, x1, y1, x1, y2)) return true;
  // Right edge
  if (segmentsIntersect(ax, ay, bx, by, x2, y1, x2, y2)) return true;
  return false;
};

export const strokeIntersectsRect = (
  points: { x: number; y: number }[],
  noteOffsetX: number,
  noteOffsetY: number,
  rect: { x: number; y: number; w: number; h: number },
  tolerance = 0
): boolean => {
  if (!points || points.length === 0) return false;
  // Quick reject using stroke bounds vs rect (expanded by tolerance)
  const b = getStrokeBounds(points);
  const worldMinX = noteOffsetX + b.minX;
  const worldMaxX = noteOffsetX + b.maxX;
  const worldMinY = noteOffsetY + b.minY;
  const worldMaxY = noteOffsetY + b.maxY;
  if (
    worldMaxX < rect.x - tolerance ||
    worldMinX > rect.x + rect.w + tolerance ||
    worldMaxY < rect.y - tolerance ||
    worldMinY > rect.y + rect.h + tolerance
  ) return false;

  // Any point inside the rect (with tolerance)
  for (let i = 0; i < points.length; i++) {
    const px = noteOffsetX + points[i].x;
    const py = noteOffsetY + points[i].y;
    if (pointInRect(px, py, rect, tolerance)) return true;
  }

  // Segment vs rect edge intersections
  for (let i = 0; i < points.length - 1; i++) {
    const ax = noteOffsetX + points[i].x;
    const ay = noteOffsetY + points[i].y;
    const bx = noteOffsetX + points[i + 1].x;
    const by = noteOffsetY + points[i + 1].y;
    if (segmentIntersectsRect(ax, ay, bx, by, rect)) return true;
  }
  return false;
};

export const pointToSegmentDistanceSq = (
  px: number, py: number, ax: number, ay: number, bx: number, by: number
): number => {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy || 1e-6;
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  if (t < 0) t = 0; else if (t > 1) t = 1;
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  const ddx = px - cx;
  const ddy = py - cy;
  return ddx * ddx + ddy * ddy;
};

export const strokeHitByEraser = (
  points: { x: number; y: number }[],
  noteOffsetX: number,
  noteOffsetY: number,
  center: { x: number; y: number },
  radius: number
): boolean => {
  if (!points || points.length < 2) return false;
  const b = getStrokeBounds(points);
  // Quick reject via expanded bounds
  const worldMinX = noteOffsetX + b.minX - radius;
  const worldMaxX = noteOffsetX + b.maxX + radius;
  const worldMinY = noteOffsetY + b.minY - radius;
  const worldMaxY = noteOffsetY + b.maxY + radius;
  if (center.x < worldMinX || center.x > worldMaxX || center.y < worldMinY || center.y > worldMaxY) return false;
  const r2 = radius * radius;
  for (let i = 0; i < points.length - 1; i++) {
    const ax = noteOffsetX + points[i].x;
    const ay = noteOffsetY + points[i].y;
    const bx = noteOffsetX + points[i + 1].x;
    const by = noteOffsetY + points[i + 1].y;
    if (pointToSegmentDistanceSq(center.x, center.y, ax, ay, bx, by) <= r2) return true;
  }
  return false;
};

export const recomputeBoundsFromStrokes = (strokes: DrawingStroke[], padding = 20): { width: number; height: number } => {
  const ptsAll = strokes.flatMap(s => s.points);
  if (ptsAll.length === 0) return { width: 0, height: 0 };
  const b = getStrokeBounds(ptsAll);
  return { width: b.maxX - b.minX + padding, height: b.maxY - b.minY + padding };
};
