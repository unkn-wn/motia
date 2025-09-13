import { useCallback, useRef } from 'react';
import { useWaveformContext } from '@contexts/objects/WaveformContextObject';
import { distanceBetween, midpoint, computePinchScale } from '@utils/touchUtils';
import { screenToCanvasCoords, findNoteAtPosition } from '@utils/canvasUtils';
import { useDrawingInteractions } from './useDrawingInteractions';
import { handleSelectionCreate, handleSelectionMove } from './mouse/selectionMouseHandlers';
import { updateEraserPreview } from './mouse/eraserMouseHandlers';
type Ctx = ReturnType<typeof import('@contexts/objects/WaveformContextObject').useWaveformContext>;

export const usePointerInteractions = () => {
  // Capture full context once for reuse in handlers
  const ctx = useWaveformContext();
  const {
    canvasRef,
    transform,
    setTransform,
    isDrawingMode,
    toolMode,
    isPanning,
    lastPanPoint,
    setDragOccurred,
    setDragging,
    setIsPanning,
    setLastPanPoint,
    setIsFollowingPlayhead,
    notes,
    NOTE_LABEL_HIDE_THRESHOLD,
    selectionBox,
    setSelectionBox,
    selectedDrawingIds
  } = ctx;

  // Track active pointers for pinch/drag
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const initialPinch = useRef<{ distance: number; midpointX: number; midpointY: number; initialScale: number } | null>(null);
  const { handleDrawingStart } = useDrawingInteractions();
  // Track touch-based erasing (there is no buttons bitfield on touch)
  const eraseActiveRef = useRef<boolean>(false);
  // Track last two-finger midpoint for drag-to-pan
  const lastTwoFingerMidRef = useRef<{ x: number; y: number } | null>(null);

  // touch-action is handled by CSS (touch-none on canvas). No effect needed.

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    // Ignore mouse here; desktop uses existing mouse handlers
    if (e.pointerType === 'mouse') return;
    // capture pointer
    (e.target as Element).setPointerCapture?.(e.pointerId);

    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const { canvasX, canvasY } = screenToCanvasCoords(e.clientX, e.clientY, rect, transform);

    // Selection tool start (touch): begin create or move, and stop panning
    if (toolMode === 'select') {
      // Prevent panning while selecting
      setIsPanning(false);
      setDragOccurred(false);
      if (selectionBox && canvasX >= selectionBox.x && canvasX <= selectionBox.x + selectionBox.w && canvasY >= selectionBox.y && canvasY <= selectionBox.y + selectionBox.h) {
        // Begin move of existing selection
        setSelectionBox?.({
          ...selectionBox,
          dragging: true,
          mode: 'move',
          startPointerX: canvasX,
          startPointerY: canvasY,
          originX: selectionBox.x,
          originY: selectionBox.y,
          originalPositions: Array.from(selectedDrawingIds || []).map(id => {
            const n = notes.find(n => n.id === id);
            return { id, x: n?.canvasX || 0, y: n?.canvasY || 0 };
          })
        });
      } else {
        // Start new selection box
        setSelectionBox?.({ x: canvasX, y: canvasY, w: 0, h: 0, dragging: true, mode: 'create', anchorX: canvasX, anchorY: canvasY });
      }
      return;
    }

    // Eraser tool: mark active (touch has no buttons)
    if (toolMode === 'erase') {
      // If touch starts over an element that requests erase suppression (e.g., sidebar), skip
      const targetEl = e.target as HTMLElement | null;
      if (targetEl && targetEl.closest('[data-prevent-erase]')) {
        eraseActiveRef.current = false;
      } else {
        eraseActiveRef.current = true;
        setIsPanning(false);
        setDragOccurred(false);
      }
      return;
    }

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

    if (isDrawingMode && toolMode === 'draw') {
      handleDrawingStart(canvasX, canvasY);
      return;
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
        // Pivot in world space: account for base centering (rect.width/2)
        midpointX: (m.x - rect2.left) - rect2.width / 2,
        midpointY: m.y - rect2.top,
        initialScale: transform.scale
      };
      // Enable two-finger panning while pinching
      setIsPanning(true);
      lastTwoFingerMidRef.current = { x: (m.x - rect2.left) - rect2.width / 2, y: m.y - rect2.top };
    }
  }, [isDrawingMode, toolMode, setIsPanning, setLastPanPoint, setIsFollowingPlayhead, canvasRef, transform, setDragOccurred, setDragging, handleDrawingStart, notes, NOTE_LABEL_HIDE_THRESHOLD, selectionBox, setSelectionBox, selectedDrawingIds]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === 'mouse') return;
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    // Convert screen to canvas coordinates helper
    const toCanvas = (clientX: number, clientY: number) => {
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      return {
        x: ((x - rect.width / 2) - transform.offsetX) / transform.scale,
        y: (y - transform.offsetY) / transform.scale,
      };
    };

    // Note dragging is handled by global handlers (pointermove on document)

    // Selection box create/resize/move (touch parity with mouse)
    if (toolMode === 'select' && selectionBox?.dragging) {
      setDragOccurred(true);
      if (selectionBox.mode === 'create') {
        handleSelectionCreate(ctx as Ctx, e.nativeEvent as unknown as PointerEvent, toCanvas);
      } else if (selectionBox.mode === 'move') {
        handleSelectionMove(ctx as Ctx, e.nativeEvent as unknown as PointerEvent, toCanvas);
      }
      return;
    }

    // Eraser hover/drag preview (touch): accumulate while active
    if (toolMode === 'erase') {
      // Ignore updates while swiping in areas that suppress erasing
      const targetEl = (e.target as HTMLElement | null);
      if (targetEl && targetEl.closest('[data-prevent-erase]')) return;
      const p = toCanvas(e.clientX, e.clientY);
      if (eraseActiveRef.current) setDragOccurred(true);
      updateEraserPreview(ctx as Ctx, p, eraseActiveRef.current, 12);
      return;
    }

    // Pinch-zoom + two-finger pan when two pointers are active
    if (pointers.current.size === 2 && initialPinch.current) {
      // Only apply pinch once (primary pointer move)
      if (!e.isPrimary) return;
      const pts = Array.from(pointers.current.values());
      const dist = distanceBetween(pts[0], pts[1]);
      const m = midpoint(pts[0], pts[1]);
      // Current midpoint in screen-space coordinates used by transform mapping
      const curMidX = (m.x - rect.left) - rect.width / 2;
      const curMidY = m.y - rect.top;
      // Compute scale against initial distance and initial scale to avoid compounding
      const { newScale } = computePinchScale(initialPinch.current.distance, dist, initialPinch.current.initialScale);
      const scaleChange = newScale / transform.scale;
      // Two-finger drag delta
      const last = lastTwoFingerMidRef.current ?? { x: curMidX, y: curMidY };
      const dx = curMidX - last.x;
      const dy = curMidY - last.y;
      setDragOccurred(true);
      setTransform(prev => {
        // Apply panning by midpoint delta first
        let nextOffsetX = prev.offsetX + dx;
        let nextOffsetY = prev.offsetY + dy;
        // Apply zoom around the original pivot point from gesture start
        nextOffsetX = nextOffsetX - (initialPinch.current!.midpointX - nextOffsetX) * (scaleChange - 1);
        nextOffsetY = nextOffsetY - (initialPinch.current!.midpointY - nextOffsetY) * (scaleChange - 1);
        return {
          scale: newScale,
          offsetX: nextOffsetX,
          offsetY: nextOffsetY,
        };
      });
      // Update last midpoint for next move
      lastTwoFingerMidRef.current = { x: curMidX, y: curMidY };
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
  }, [canvasRef, transform, isPanning, lastPanPoint, setTransform, setLastPanPoint, toolMode, selectionBox, setDragOccurred, ctx]);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === 'mouse') return;
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) initialPinch.current = null;
    if (isPanning) setIsPanning(false);
    // End touch-based erasing
    eraseActiveRef.current = false;
    if (pointers.current.size < 2) {
      lastTwoFingerMidRef.current = null;
    }
  }, [setIsPanning, isPanning]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    // If a touch pointer is active, ignore wheel to avoid double-zoom on mobile
    if (pointers.current.size > 0) return;
    if (e.cancelable) e.preventDefault();
    const scaleFactor = e.deltaY > 0 ? 0.9 : 1.1;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mouseX = (e.clientX - rect.left) - rect.width / 2;
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
