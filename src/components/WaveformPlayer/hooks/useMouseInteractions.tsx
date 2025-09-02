import { useCallback } from 'react';
import { useWaveformContext } from '../contexts/WaveformContext';
import { screenToCanvasCoords, findNoteAtPosition } from '../utils/canvasUtils';

export const useMouseInteractions = () => {
  const {
    canvasRef,
    transform,
    setTransform,
    isDrawingMode,
    isPanning,
    lastPanPoint,
    setDragOccurred,
    setDragging,
    setIsPanning,
    setLastPanPoint,
    setIsFollowingPlayhead,
    notes,
    NOTE_LABEL_HIDE_THRESHOLD
  } = useWaveformContext();

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button === 0) { // Left mouse button
      e.preventDefault();

      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;

      const { canvasX, canvasY } = screenToCanvasCoords(e.clientX, e.clientY, rect, transform);

      // Check if clicking on a note - exclude drawings when not in drawing mode to prevent interference with panning
      const clickedNote = findNoteAtPosition(canvasX, canvasY, notes, transform.scale, NOTE_LABEL_HIDE_THRESHOLD, !isDrawingMode);

      if (clickedNote && !isDrawingMode) {
        // Start dragging the note
        setDragOccurred(false);
        setDragging({
          id: clickedNote.id,
          startX: e.clientX,
          startY: e.clientY,
          initialCanvasX: clickedNote.canvasX,
          initialCanvasY: clickedNote.canvasY
        });
      } else if (isDrawingMode) {
        // Start drawing - this will be handled by drawing hooks
        // We'll emit a custom event or use a callback for this
      } else {
        // Start panning
        setIsPanning(true);
        setLastPanPoint({ x: e.clientX, y: e.clientY });
        setIsFollowingPlayhead(false);
      }
    }
  }, [canvasRef, transform, isDrawingMode, setDragOccurred, setDragging, setIsPanning, setLastPanPoint, setIsFollowingPlayhead, notes, NOTE_LABEL_HIDE_THRESHOLD]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isPanning) {
      e.preventDefault();

      // Use movementX/Y to get raw mouse movement without OS acceleration
      const deltaX = (e.nativeEvent as MouseEvent).movementX || (e.clientX - lastPanPoint.x);
      const deltaY = (e.nativeEvent as MouseEvent).movementY || (e.clientY - lastPanPoint.y);

      setTransform(prev => ({
        ...prev,
        offsetX: prev.offsetX + deltaX,
        offsetY: prev.offsetY + deltaY
      }));

      setLastPanPoint({ x: e.clientX, y: e.clientY });
    }
    // Drawing is now handled by global mouse handlers
  }, [isPanning, lastPanPoint, setTransform, setLastPanPoint]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.cancelable && e.preventDefault();
    const scaleFactor = e.deltaY > 0 ? 0.9 : 1.1;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    setTransform(prev => {
      const newScale = Math.max(0.1, Math.min(3, prev.scale * scaleFactor)); // Allow more zoom out
      const scaleChange = newScale / prev.scale;

      return {
        scale: newScale,
        offsetX: prev.offsetX - (mouseX - prev.offsetX) * (scaleChange - 1),
        offsetY: prev.offsetY - (mouseY - prev.offsetY) * (scaleChange - 1)
      };
    });
  }, [canvasRef, setTransform]);

  return {
    handleMouseDown,
    handleMouseMove,
    handleWheel
  };
};
