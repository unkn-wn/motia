/**
 * Canvas and transform-related type definitions
 */

export type CanvasOrientation = 'vertical' | 'horizontal';

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

