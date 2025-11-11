import { optimizeDrawingPoints } from '@utils/drawingUtils';

type Ctx = ReturnType<typeof import('@contexts/objects/WaveformContextObject').useWaveformContext>;

// Append points to the in-progress stroke, with light simplification for very long paths
export function handleDrawMove(ctx: Ctx, canvasX: number, canvasY: number) {
  const { currentStroke, setCurrentStroke } = ctx;
  const lastPoint = currentStroke[currentStroke.length - 1];
  if (!lastPoint) return;

  const distance = Math.hypot(canvasX - lastPoint.x, canvasY - lastPoint.y);
  // Reduced distance threshold for smoother curves
  if (distance > 1) {
    const newPoints = [...currentStroke, { x: canvasX, y: canvasY }];
    // Only simplify if stroke gets extremely long, and use much gentler tolerance
    if (newPoints.length > 2000) {
      const optimizedPoints = optimizeDrawingPoints(newPoints, 0.5);
      setCurrentStroke(optimizedPoints);
    } else {
      setCurrentStroke(newPoints);
    }
  }
}
