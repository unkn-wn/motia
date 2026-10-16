/**
 * Canvas and transform-related type definitions
 */

export type CanvasOrientation = 'vertical' | 'horizontal';

export interface CanvasTransform {
  offsetX: number;
  offsetY: number;
  scale: number;
}

