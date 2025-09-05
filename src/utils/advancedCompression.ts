/**
 * Advanced Drawing Compression Utilities
 * Much more aggressive compression for better results
 */

import type {
  DrawingPoint,
  DrawingStroke,
  CompressedStroke
} from '../types/drawing';

// Local types for compressed representations to avoid any
export interface UltraCompactCompressedStroke {
  p: [number, number][]; // relative integer points
  ox: number; // offset x
  oy: number; // offset y
  c: string; // color
  w: number; // stroke width
  s: number; // precision scale
}

export type RLEPoint = [number, number] | [number, number, number];
export interface RLECompressedStroke {
  r: RLEPoint[];
  c: string;
  w: number;
}

export interface VectorQuantCompressedStroke {
  q: [number, number][];
  g: number; // grid size
  c: string;
  w: number;
}

/**
 * Ultra-compact binary-like representation
 * Stores coordinates as 16-bit integers with configurable precision
 */
export const compressStrokeUltraCompact = (
  stroke: DrawingStroke,
  precision: number = 10
): UltraCompactCompressedStroke | DrawingStroke => {
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
  const relativePoints: [number, number][] = stroke.points.map(p => ([
    Math.round((p.x - minX) * precision),
    Math.round((p.y - minY) * precision)
  ] as [number, number]));

  const compact: UltraCompactCompressedStroke = {
    // Much shorter property names
    p: relativePoints,
    ox: minX, // offset x
    oy: minY, // offset y
    c: stroke.color,
    w: stroke.strokeWidth,
    s: precision // scale
  };
  return compact;
};

/**
 * Decompress ultra-compact format
 */
export const decompressStrokeUltraCompact = (
  compressed: UltraCompactCompressedStroke
): DrawingStroke => {
  const scale = compressed.s ?? 10;
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
export const compressStrokeRLE = (stroke: DrawingStroke): RLECompressedStroke | DrawingStroke => {
  if (stroke.points.length <= 1) return stroke;

  const encoded: RLEPoint[] = [];
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

  const compact: RLECompressedStroke = {
    r: encoded, // RLE data
    c: stroke.color,
    w: stroke.strokeWidth
  };
  return compact;
};

/**
 * Decompress RLE format
 */
export const decompressStrokeRLE = (compressed: RLECompressedStroke): DrawingStroke => {
  const points: DrawingPoint[] = [];

  for (const item of compressed.r) {
    const x = item[0] / 10;
    const y = item[1] / 10;
    const count = (item as [number, number, number])[2] ?? 1;

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
export const compressStrokeVectorQuantization = (
  stroke: DrawingStroke,
  gridSize: number = 2
): VectorQuantCompressedStroke => {
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

  const compact: VectorQuantCompressedStroke = {
    q: deduplicated,
    g: gridSize,
    c: stroke.color,
    w: stroke.strokeWidth
  };
  return compact;
};

/**
 * Decompress vector quantization
 */
export const decompressStrokeVectorQuantization = (
  compressed: VectorQuantCompressedStroke
): DrawingStroke => {
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
  const methods: { name: string; data: unknown }[] = [
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
    type: bestMethod.name as CompressedStroke['type'],
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
  return decompressStrokeUltraCompact(compressed.data as UltraCompactCompressedStroke);
    case 'rle':
  return decompressStrokeRLE(compressed.data as RLECompressedStroke);
    case 'vectorQuantization':
    case 'vectorQuantization2':
  return decompressStrokeVectorQuantization(compressed.data as VectorQuantCompressedStroke);
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
    const sessionData = compressedSession[0].data as {
      strokes: CompressedStroke[];
      commonColor?: string;
      commonStrokeWidth?: number;
    };
    const commonColor = sessionData.commonColor;
    const commonStrokeWidth = sessionData.commonStrokeWidth;

    return (sessionData.strokes as CompressedStroke[]).map((compressedStroke: CompressedStroke) => {
      const decompressed = decompressStrokeAdvancedAdaptive(compressedStroke);

      // Restore common properties
      return {
        ...decompressed,
        color: decompressed.color ?? (commonColor as string),
        strokeWidth: decompressed.strokeWidth ?? (commonStrokeWidth as number)
      };
    });
  } else {
    // Handle individual stroke compression
    return compressedSession.map(decompressStrokeAdvancedAdaptive);
  }
};
