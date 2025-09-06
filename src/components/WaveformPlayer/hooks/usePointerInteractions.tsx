import { useCallback, useRef, useEffect } from 'react';
import { useWaveformContext } from '@contexts/WaveformContext';
import { distanceBetween, midpoint, computePinchScale } from '@utils/touchUtils';
import { screenToCanvasCoords, findNoteAtPosition } from '@utils/canvasUtils';
import { useDrawingInteractions } from './useDrawingInteractions';

export const usePointerInteractions = () => {
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

  // Track active pointers for pinch/drag
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const initialPinch = useRef<{ distance: number; midpointX: number; midpointY: number; initialScale: number } | null>(null);
  const { handleDrawingStart } = useDrawingInteractions();

  useEffect(() => {
    // ensure touch-action CSS disables browser gestures on the canvas
    if (canvasRef.current) {
      canvasRef.current.style.touchAction = 'none';
    }
  }, [canvasRef]);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    // Ignore mouse here; desktop uses existing mouse handlers
    if (e.pointerType === 'mouse') return;
    // capture pointer
    (e.target as Element).setPointerCapture?.(e.pointerId);

    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const { canvasX, canvasY } = screenToCanvasCoords(e.clientX, e.clientY, rect, transform);

    // Note drag hit test (exclude drawings when not in drawing mode)
    const clickedNote = findNoteAtPosition(
      canvasX,
      canvasY,
      notes,
      transform.scale,
      NOTE_LABEL_HIDE_THRESHOLD,
      !isDrawingMode
    );

    if (clickedNote && !isDrawingMode) {
      setDragOccurred(false);
      setDragging({
        id: clickedNote.id,
        startX: e.clientX,
        startY: e.clientY,
        initialCanvasX: clickedNote.canvasX,
        initialCanvasY: clickedNote.canvasY,
      });
      return;
    }

  if (isDrawingMode) {
      handleDrawingStart(canvasX, canvasY);
      return;
    }

    // Begin panning on primary touch
  if (e.isPrimary) {
      setIsPanning(true);
      setLastPanPoint({ x: e.clientX, y: e.clientY });
      setIsFollowingPlayhead(false);
    }

    // Initialize pinch state if we have two pointers
    if (pointers.current.size === 2) {
      const rect2 = canvasRef.current?.getBoundingClientRect();
      if (!rect2) return;
      const pts = Array.from(pointers.current.values());
      const dist = distanceBetween(pts[0], pts[1]);
      const m = midpoint(pts[0], pts[1]);
      initialPinch.current = {
        distance: dist,
        midpointX: m.x - rect2.left,
        midpointY: m.y - rect2.top,
        initialScale: transform.scale
      };
      // Disable panning while pinching
      setIsPanning(false);
    }
  }, [isDrawingMode, setIsPanning, setLastPanPoint, setIsFollowingPlayhead, canvasRef, transform, setDragOccurred, setDragging, handleDrawingStart, notes, NOTE_LABEL_HIDE_THRESHOLD]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === 'mouse') return;
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

  // Note dragging is handled by global handlers (pointermove on document)

    // Pinch-zoom when two pointers are active
    if (pointers.current.size === 2 && initialPinch.current) {
      // Only apply pinch once (primary pointer move)
      if (!e.isPrimary) return;
      const pts = Array.from(pointers.current.values());
      const dist = distanceBetween(pts[0], pts[1]);
      // Compute scale against initial distance and initial scale to avoid compounding
      const { newScale } = computePinchScale(initialPinch.current.distance, dist, initialPinch.current.initialScale);
      const scaleChange = newScale / transform.scale;

      setTransform(prev => ({
        scale: newScale,
        offsetX: prev.offsetX - (initialPinch.current!.midpointX - prev.offsetX) * (scaleChange - 1),
        offsetY: prev.offsetY - (initialPinch.current!.midpointY - prev.offsetY) * (scaleChange - 1)
      }));
      return;
    }

    // Otherwise, panning for single pointer
  if (isPanning) {
      e.preventDefault();
      const deltaX = e.movementX || (e.clientX - lastPanPoint.x);
      const deltaY = e.movementY || (e.clientY - lastPanPoint.y);
      setTransform(prev => ({
        ...prev,
        offsetX: prev.offsetX + deltaX,
        offsetY: prev.offsetY + deltaY
      }));
      setLastPanPoint({ x: e.clientX, y: e.clientY });
    }
  }, [canvasRef, transform, isPanning, lastPanPoint, setTransform, setLastPanPoint]);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === 'mouse') return;
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) initialPinch.current = null;
    if (isPanning) setIsPanning(false);
  }, [setIsPanning, isPanning]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
  // If a touch pointer is active, ignore wheel to avoid double-zoom on mobile
  if (pointers.current.size > 0) return;
  if (e.cancelable) e.preventDefault();
    const scaleFactor = e.deltaY > 0 ? 0.9 : 1.1;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    setTransform(prev => {
      const newScale = Math.max(0.1, Math.min(3, prev.scale * scaleFactor));
      const scaleChange = newScale / prev.scale;
      return {
        scale: newScale,
        offsetX: prev.offsetX - (mouseX - prev.offsetX) * (scaleChange - 1),
        offsetY: prev.offsetY - (mouseY - prev.offsetY) * (scaleChange - 1)
      };
    });
  }, [canvasRef, setTransform]);

  return {
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handleWheel,
  };
};
