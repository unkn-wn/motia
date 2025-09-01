/**
 * Canvas and transform-related type definitions
 */

export interface CanvasTransform {
  offsetX: number;
  offsetY: number;
  scale: number;
}

export interface WaveformDimensions {
  width: number;
  height: number;
  centerX: number;
  centerY: number;
  offsetX: number;
}

export interface CanvasPoint {
  x: number;
  y: number;
}

export interface CanvasBounds {
  width: number;
  height: number;
}
