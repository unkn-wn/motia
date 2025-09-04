import { useEffect } from 'react';
import { useWaveformContext } from '@contexts/WaveformContext';
import { useDrawingInteractions } from './useDrawingInteractions';
import { optimizeDrawingPoints } from '@utils/drawingUtils';

export const useGlobalMouseHandlers = () => {
  const {
    dragging,
    setDragging,
    setDragOccurred,
    isDrawing,
    isDrawingMode,
    isPanning,
    setIsPanning,
    onMoveNote,
    transform,
    currentStroke,
    setCurrentStroke,
    canvasRef
  } = useWaveformContext();

  const { handleDrawingEnd } = useDrawingInteractions();

  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent | PointerEvent) => {
      // Avoid double-processing: if this is a PointerEvent from a mouse, ignore it and rely on mousemove
      if ('pointerType' in e && e.pointerType === 'mouse') return;
      // Handle note dragging
      if (dragging && onMoveNote) {
        const deltaX = e.clientX - dragging.startX;
        const deltaY = e.clientY - dragging.startY;

        const newCanvasX = dragging.initialCanvasX + deltaX / transform.scale;
        const newCanvasY = dragging.initialCanvasY + deltaY / transform.scale;

  onMoveNote(dragging.id, newCanvasX, newCanvasY);
  setDragOccurred(true);
      }

      // Handle drawing
      if (isDrawing && isDrawingMode) {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;

        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const canvasX = (x - transform.offsetX) / transform.scale;
        const canvasY = (y - transform.offsetY) / transform.scale;

        const lastPoint = currentStroke[currentStroke.length - 1];
        if (!lastPoint) return;

        const distance = Math.sqrt((canvasX - lastPoint.x) ** 2 + (canvasY - lastPoint.y) ** 2);

        if (distance > 2) {
          const newPoints = [...currentStroke, { x: canvasX, y: canvasY }];

          if (newPoints.length > 1000) {
            const optimizedPoints = optimizeDrawingPoints(newPoints, 1.5);
            setCurrentStroke(optimizedPoints);
          } else {
            setCurrentStroke(newPoints);
          }
        }
      }
    };

    const handleGlobalMouseUp = (e?: MouseEvent | PointerEvent) => {
      // Avoid double-processing on desktop
      if (e && 'pointerType' in e && e.pointerType === 'mouse') return;
      // Handle panning
      if (isPanning) {
        setIsPanning(false);
      }

      // Handle note dragging
      if (dragging) {
  setDragging(null);
  setTimeout(() => setDragOccurred(false), 10);
      }

      // Handle drawing - this is critical for stopping drawing
      if (isDrawing) {
  handleDrawingEnd();
      }
    };

    // Only add listeners if we have active interactions
    if (dragging || isDrawing || isPanning) {
      document.addEventListener('mousemove', handleGlobalMouseMove);
      document.addEventListener('mouseup', handleGlobalMouseUp as EventListener);
      document.addEventListener('pointermove', handleGlobalMouseMove as EventListener, { passive: true } as AddEventListenerOptions);
      document.addEventListener('pointerup', handleGlobalMouseUp as EventListener);

      return () => {
  document.removeEventListener('mousemove', handleGlobalMouseMove);
  document.removeEventListener('mouseup', handleGlobalMouseUp as EventListener);
  document.removeEventListener('pointermove', handleGlobalMouseMove as EventListener);
  document.removeEventListener('pointerup', handleGlobalMouseUp as EventListener);
      };
    }
  }, [
    dragging,
    isDrawing,
    isPanning,
    isDrawingMode,
    onMoveNote,
    transform,
    currentStroke,
    handleDrawingEnd,
    canvasRef,
    setDragging,
    setDragOccurred,
    setIsPanning,
    setCurrentStroke
  ]);

  return null; // This hook doesn't return anything, just sets up listeners
};
