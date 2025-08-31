/**
 * Canvas transform and coordinate utilities
 */

export interface CanvasTransform {
  offsetX: number;
  offsetY: number;
  scale: number;
}

export interface WaveformDimensions {
  height: number;
  width: number;
  centerX: number;
  offsetX: number;
}

/**
 * Calculates waveform dimensions based on duration and window size
 */
export const calculateWaveformDimensions = (duration: number): WaveformDimensions => {
  const waveformHeight = Math.max(window.innerHeight * 3, duration * 100);
  const waveformWidth = 120;
  const canvasWidth = window.innerWidth;
  const waveformX = (canvasWidth - waveformWidth) / 2;
  const waveformCanvasX = waveformX + waveformWidth / 2;

  return {
    height: waveformHeight,
    width: waveformWidth,
    centerX: waveformCanvasX,
    offsetX: waveformX
  };
};

/**
 * Converts canvas coordinates to screen coordinates
 */
export const canvasToScreen = (
  canvasX: number,
  canvasY: number,
  transform: CanvasTransform
) => {
  return {
    screenX: canvasX * transform.scale + transform.offsetX,
    screenY: canvasY * transform.scale + transform.offsetY,
  };
};

/**
 * Converts screen coordinates to canvas coordinates
 */
export const screenToCanvas = (
  screenX: number,
  screenY: number,
  transform: CanvasTransform
) => {
  return {
    canvasX: (screenX - transform.offsetX) / transform.scale,
    canvasY: (screenY - transform.offsetY) / transform.scale,
  };
};

/**
 * Calculates new transform for zoom operation
 */
export const calculateZoomTransform = (
  currentTransform: CanvasTransform,
  scaleFactor: number,
  mouseX: number,
  mouseY: number,
  minScale = 0.1,
  maxScale = 3
): CanvasTransform => {
  const newScale = Math.max(minScale, Math.min(maxScale, currentTransform.scale * scaleFactor));
  const scaleChange = newScale / currentTransform.scale;

  return {
    scale: newScale,
    offsetX: currentTransform.offsetX - (mouseX - currentTransform.offsetX) * (scaleChange - 1),
    offsetY: currentTransform.offsetY - (mouseY - currentTransform.offsetY) * (scaleChange - 1)
  };
};
