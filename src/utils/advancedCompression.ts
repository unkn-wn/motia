/**
 * Advanced Drawing Compression Utilities
 * Much more aggressive compression for better results
 */

import type {
  DrawingPoint,
  DrawingStroke,
  CompressedStroke
} from '../types/drawing';

/**
 * Ultra-compact binary-like representation
 * Stores coordinates as 16-bit integers with configurable precision
 */
export const compressStrokeUltraCompact = (stroke: DrawingStroke, precision: number = 10): any => {
  if (stroke.points.length === 0) return stroke;

  // Find bounding box to determine offset
  let minX = stroke.points[0].x;
  let minY = stroke.points[0].y;
  let maxX = minX;
  let maxY = minY;

  for (const point of stroke.points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }

  // Use relative coordinates from minimum
  const relativePoints = stroke.points.map(p => [
    Math.round((p.x - minX) * precision),
    Math.round((p.y - minY) * precision)
  ]);

  return {
    // Much shorter property names
    p: relativePoints,
    ox: minX, // offset x
    oy: minY, // offset y
    c: stroke.color,
    w: stroke.strokeWidth,
    s: precision // scale
  };
};

/**
 * Decompress ultra-compact format
 */
export const decompressStrokeUltraCompact = (compressed: any): DrawingStroke => {
  const scale = compressed.s || 10;
  return {
    points: compressed.p.map(([x, y]: [number, number]) => ({
      x: (x / scale) + compressed.ox,
      y: (y / scale) + compressed.oy
    })),
    color: compressed.c,
    strokeWidth: compressed.w
  };
};

/**
 * Run-length encoding for repetitive patterns
 */
export const compressStrokeRLE = (stroke: DrawingStroke): any => {
  if (stroke.points.length <= 1) return stroke;

  const encoded: any[] = [];
  let current = stroke.points[0];
  let count = 1;

  for (let i = 1; i < stroke.points.length; i++) {
    const point = stroke.points[i];
    const dx = Math.abs(point.x - current.x);
    const dy = Math.abs(point.y - current.y);

    // If points are very close, count as same
    if (dx < 0.5 && dy < 0.5) {
      count++;
    } else {
      // Encode the run
      if (count > 1) {
        encoded.push([Math.round(current.x * 10), Math.round(current.y * 10), count]);
      } else {
        encoded.push([Math.round(current.x * 10), Math.round(current.y * 10)]);
      }
      current = point;
      count = 1;
    }
  }

  // Don't forget the last run
  if (count > 1) {
    encoded.push([Math.round(current.x * 10), Math.round(current.y * 10), count]);
  } else {
    encoded.push([Math.round(current.x * 10), Math.round(current.y * 10)]);
  }

  return {
    r: encoded, // RLE data
    c: stroke.color,
    w: stroke.strokeWidth
  };
};

/**
 * Decompress RLE format
 */
export const decompressStrokeRLE = (compressed: any): DrawingStroke => {
  const points: DrawingPoint[] = [];

  for (const item of compressed.r) {
    const x = item[0] / 10;
    const y = item[1] / 10;
    const count = item[2] || 1;

    for (let i = 0; i < count; i++) {
      points.push({ x, y });
    }
  }

  return {
    points,
    color: compressed.c,
    strokeWidth: compressed.w
  };
};

/**
 * Vector quantization - round coordinates to a grid
 */
export const compressStrokeVectorQuantization = (stroke: DrawingStroke, gridSize: number = 2): any => {
  const quantized = stroke.points.map(p => [
    Math.round(p.x / gridSize) * gridSize,
    Math.round(p.y / gridSize) * gridSize
  ]);

  // Remove consecutive duplicates
  const deduplicated: [number, number][] = [];
  for (let i = 0; i < quantized.length; i++) {
    if (i === 0 || quantized[i][0] !== quantized[i-1][0] || quantized[i][1] !== quantized[i-1][1]) {
      deduplicated.push([quantized[i][0], quantized[i][1]]);
    }
  }

  return {
    q: deduplicated,
    g: gridSize,
    c: stroke.color,
    w: stroke.strokeWidth
  };
};

/**
 * Decompress vector quantization
 */
export const decompressStrokeVectorQuantization = (compressed: any): DrawingStroke => {
  return {
    points: compressed.q.map(([x, y]: [number, number]) => ({ x, y })),
    color: compressed.c,
    strokeWidth: compressed.w
  };
};

/**
 * Advanced adaptive compression with multiple aggressive methods
 */
export const compressStrokeAdvancedAdaptive = (stroke: DrawingStroke): CompressedStroke => {
  const originalSize = JSON.stringify(stroke).length;

  // Test all compression methods (without wrapper overhead for testing)
  const methods = [
    { name: 'raw', data: stroke },
    { name: 'ultraCompact', data: compressStrokeUltraCompact(stroke, 10) },
    { name: 'rle', data: compressStrokeRLE(stroke) },
    { name: 'vectorQuantization', data: compressStrokeVectorQuantization(stroke, 1) },
    { name: 'vectorQuantization2', data: compressStrokeVectorQuantization(stroke, 2) },
    { name: 'ultraCompact20', data: compressStrokeUltraCompact(stroke, 20) }
  ];

  // Find the best compression
  let bestMethod = methods[0];
  let bestSize = originalSize;

  for (const method of methods) {
    const size = JSON.stringify(method.data).length;
    if (size < bestSize) {
      bestSize = size;
      bestMethod = method;
    }
  }

  return {
    type: bestMethod.name as any,
    data: bestMethod.data
  };
};

/**
 * Decompress advanced adaptive format
 */
export const decompressStrokeAdvancedAdaptive = (compressed: CompressedStroke): DrawingStroke => {
  switch (compressed.type) {
    case 'raw':
  return compressed.data as DrawingStroke;
    case 'ultraCompact':
    case 'ultraCompact20':
  return decompressStrokeUltraCompact(compressed.data as any);
    case 'rle':
  return decompressStrokeRLE(compressed.data as any);
    case 'vectorQuantization':
    case 'vectorQuantization2':
  return decompressStrokeVectorQuantization(compressed.data as any);
    case 'session':
      // This is handled at the session level, not individual stroke level
      throw new Error('Session compression should be decompressed at session level');
    default:
  return compressed.data as DrawingStroke;
  }
};

/**
 * Decompress an entire session (handles session-level compression)
 */
export const decompressSession = (compressedSession: CompressedStroke[]): DrawingStroke[] => {
  if (compressedSession.length === 1 && compressedSession[0].type === 'session') {
    // Handle session-level compression
  const sessionData = compressedSession[0].data as any;
  const commonColor = sessionData.commonColor as string;
  const commonStrokeWidth = sessionData.commonStrokeWidth as number;

  return (sessionData.strokes as CompressedStroke[]).map((compressedStroke: CompressedStroke) => {
      const decompressed = decompressStrokeAdvancedAdaptive(compressedStroke);

      // Restore common properties
      return {
        ...decompressed,
        color: decompressed.color || commonColor,
        strokeWidth: decompressed.strokeWidth || commonStrokeWidth
      };
    });
  } else {
    // Handle individual stroke compression
    return compressedSession.map(decompressStrokeAdvancedAdaptive);
  }
};
