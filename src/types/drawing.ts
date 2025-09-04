/**
 * Drawing-related type definitions
 */

export interface DrawingPoint {
  x: number;
  y: number;
}

export interface DrawingStroke {
  points: DrawingPoint[];
  color: string;
  strokeWidth: number;
}

export interface DrawingData {
  // Raw strokes (for rendering and backward compatibility)
  strokes?: DrawingStroke[];
  // Compressed data (for storage)
  compressed?: unknown[];
  bounds: { width: number; height: number };
  // Storage metrics
  originalSize?: number;
  compressedSize?: number;
  compressionRatio?: number;
}

export interface DrawingSession {
  strokes: DrawingStroke[];
  startTime: number;
  startPosition: { x: number; y: number };
}

export type CompressionType =
  | 'raw'
  | 'optimized'
  | 'integer'
  | 'delta'
  | 'ultraCompact'
  | 'ultraCompact20'
  | 'rle'
  | 'vectorQuantization'
  | 'vectorQuantization2'
  | 'session';

export interface CompressedStroke {
  type: CompressionType;
  data: unknown;
}

export interface CompressionResult {
  strokes: CompressedStroke[];
  originalSize: number;
  compressedSize: number;
  reduction: number;
}
