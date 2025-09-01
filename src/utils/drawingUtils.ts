/**
 * Drawing utilities for memory-efficient drawing operations
 */

import type {
  DrawingPoint,
  DrawingStroke,
  CompressionResult,
  CompressedStroke
} from '../types/drawing';

// Import advanced compression methods
import {
  compressStrokeAdvancedAdaptive,
  decompressStrokeAdvancedAdaptive
} from './advancedCompression';

/**
 * Optimizes drawing points by removing redundant points to prevent memory issues
 * Uses Douglas-Peucker algorithm for line simplification
 */
export const optimizeDrawingPoints = (points: DrawingPoint[], tolerance: number = 1.0): DrawingPoint[] => {
  if (points.length <= 2) return points;

  return douglasPeucker(points, tolerance);
};

/**
 * Douglas-Peucker line simplification algorithm
 */
function douglasPeucker(points: DrawingPoint[], tolerance: number): DrawingPoint[] {
  if (points.length <= 2) return points;

  // Find the point with the maximum distance from the line segment
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

  // If max distance is greater than tolerance, recursively simplify
  if (maxDistance > tolerance) {
    const left = douglasPeucker(points.slice(0, maxIndex + 1), tolerance);
    const right = douglasPeucker(points.slice(maxIndex), tolerance);

    // Combine results, removing duplicate point at junction
    return [...left.slice(0, -1), ...right];
  } else {
    // All points between start and end are within tolerance - return just start and end
    return [points[0], points[end]];
  }
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
 * Compresses drawing strokes for efficient storage
 */
export const compressDrawingStrokes = (strokes: DrawingStroke[]): DrawingStroke[] => {
  return strokes.map(stroke => ({
    ...stroke,
    points: optimizeDrawingPoints(stroke.points, 2.0) // Slightly higher tolerance for storage
  }));
};

/**
 * Calculates the memory footprint of drawing data in bytes (approximate)
 */
export const calculateDrawingMemoryFootprint = (strokes: DrawingStroke[]): number => {
  let totalPoints = 0;
  strokes.forEach(stroke => {
    totalPoints += stroke.points.length;
  });

  // Each point has x, y (8 bytes each as numbers), plus stroke metadata
  const pointsSize = totalPoints * 16; // 16 bytes per point
  const strokeMetadataSize = strokes.length * 50; // Approximate metadata per stroke

  return pointsSize + strokeMetadataSize;
};

/**
 * Validates if drawing data is within memory limits
 */
export const isDrawingWithinMemoryLimits = (strokes: DrawingStroke[], maxMemoryKB: number = 100): boolean => {
  const memoryBytes = calculateDrawingMemoryFootprint(strokes);
  return memoryBytes <= (maxMemoryKB * 1024);
};

/**
 * Efficient Storage Solutions for Drawing Data
 */

/**
 * Delta compression - stores only the differences between points
 * Much more efficient for typical drawing patterns
 */
export const compressStrokeWithDeltas = (stroke: DrawingStroke) => {
  if (stroke.points.length <= 1) return stroke;

  const [start, ...rest] = stroke.points;
  const deltas: [number, number][] = [];

  let prevX = start.x;
  let prevY = start.y;

  for (const point of rest) {
    // Round deltas to reduce precision slightly for better compression
    const deltaX = Math.round((point.x - prevX) * 10) / 10;
    const deltaY = Math.round((point.y - prevY) * 10) / 10;
    deltas.push([deltaX, deltaY]);
    prevX = point.x;
    prevY = point.y;
  }

  return {
    start: [Math.round(start.x * 10) / 10, Math.round(start.y * 10) / 10],
    deltas,
    color: stroke.color,
    strokeWidth: stroke.strokeWidth
  };
};

/**
 * Reconstruct stroke from delta compression
 */
export const decompressStrokeFromDeltas = (compressed: any): DrawingStroke => {
  const points: DrawingPoint[] = [];
  const [startX, startY] = compressed.start;

  points.push({ x: startX, y: startY });

  let currentX = startX;
  let currentY = startY;

  for (const [deltaX, deltaY] of compressed.deltas) {
    currentX += deltaX;
    currentY += deltaY;
    points.push({ x: currentX, y: currentY });
  }

  return {
    points,
    color: compressed.color,
    strokeWidth: compressed.strokeWidth
  };
};

/**
 * Integer coordinate compression - reduces floating point precision
 */
export const compressStrokeToIntegers = (stroke: DrawingStroke, scale: number = 10) => {
  return {
    // Store as scaled integers to reduce size
    points: stroke.points.map(p => [
      Math.round(p.x * scale),
      Math.round(p.y * scale)
    ]),
    color: stroke.color,
    strokeWidth: stroke.strokeWidth,
    scale
  };
};

/**
 * Reconstruct stroke from integer compression
 */
export const decompressStrokeFromIntegers = (compressed: any): DrawingStroke => {
  const scale = compressed.scale || 10;
  return {
    points: compressed.points.map(([x, y]: [number, number]) => ({
      x: x / scale,
      y: y / scale
    })),
    color: compressed.color,
    strokeWidth: compressed.strokeWidth
  };
};

/**
 * Adaptive compression - chooses best method based on actual size reduction
 * Now uses advanced compression techniques for much better results
 */
export const compressStrokeAdaptive = (stroke: DrawingStroke): CompressedStroke => {
  return compressStrokeAdvancedAdaptive(stroke);
};

/**
 * Decompress adaptively compressed stroke
 * Now uses advanced decompression methods
 */
export const decompressStrokeAdaptive = (compressed: CompressedStroke): DrawingStroke => {
  return decompressStrokeAdvancedAdaptive(compressed);
};

/**-
 * Calculate storage size of compressed data
 */
export const calculateCompressedSize = (compressedData: any): number => {
  return JSON.stringify(compressedData).length;
};

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
  let commonColor = firstStroke.data.c || firstStroke.data.color;
  let commonStrokeWidth = firstStroke.data.w || firstStroke.data.strokeWidth;

  // Check if all strokes share the same color and width
  const allSameColor = strokes.every(stroke =>
    (stroke.data.c || stroke.data.color) === commonColor
  );
  const allSameWidth = strokes.every(stroke =>
    (stroke.data.w || stroke.data.strokeWidth) === commonStrokeWidth
  );

  if (!allSameColor && !allSameWidth) {
    return strokes; // No common properties to extract
  }

  // Create session with common properties
  const optimizedStrokes = strokes.map(stroke => {
    const newData = { ...stroke.data };

    if (allSameColor) {
      delete newData.c;
      delete newData.color;
    }
    if (allSameWidth) {
      delete newData.w;
      delete newData.strokeWidth;
    }

    return {
      ...stroke,
      data: newData
    };
  });

  // Wrap in session format with extracted common properties
  return [{
    type: 'session' as any,
    data: {
      strokes: optimizedStrokes,
      commonColor: allSameColor ? commonColor : undefined,
      commonStrokeWidth: allSameWidth ? commonStrokeWidth : undefined
    }
  }] as CompressedStroke[];
}
