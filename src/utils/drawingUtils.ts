/**
 * Drawing utilities for memory-efficient drawing operations
 */

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

/**
 * Calculate perpendicular distance from point to line segment
 */
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

/**
 * Calculates the memory footprint of drawing data in bytes (approximate)
 */
export const calculateDrawingMemoryFootprint = (strokes: DrawingStroke[]): number => {
  let totalPoints = 0;
  strokes.forEach(stroke => { totalPoints += stroke.points.length; });
  const pointsSize = totalPoints * 16; // approx bytes per point
  const strokeMetadataSize = strokes.length * 50; // approx metadata
  return pointsSize + strokeMetadataSize;
};

/**-
 * Calculate storage size of compressed data
 */
export const calculateCompressedSize = (compressedData: unknown): number => JSON.stringify(compressedData).length;

/**
 * Compress entire drawing with advanced adaptive strategy
 * Now includes inter-stroke optimizations for even better compression
 */
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

/**
 * Optimize common properties across strokes in a session
 */
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
