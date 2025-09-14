import { useCallback, useRef } from 'react';
import { useWaveformContext } from '@contexts/objects/WaveformContextObject';
import { distanceBetween, midpoint, computePinchScale } from '@utils/touchUtils';
import { screenToCanvasCoords, findNoteAtPosition, isClickInWaveform, getTimeFromCanvasY, getWaveformDimensions } from '@utils/canvasUtils';
import { useDrawingInteractions } from './useDrawingInteractions';
import { handleSelectionCreate, handleSelectionMove } from './mouse/selectionMouseHandlers';
import { updateEraserPreview } from './mouse/eraserMouseHandlers';
import { useAudio } from '@contexts/objects/AudioContextObject';
import { history } from '@utils/history';
type Ctx = ReturnType<typeof import('@contexts/objects/WaveformContextObject').useWaveformContext>;

export const usePointerInteractions = () => {
  // Capture full context once for reuse in handlers
  const ctx = useWaveformContext();
  const { duration, seekToTime } = useAudio();
  const {
    canvasRef,
    transform,
    setTransform,
    isDrawingMode,
    isDrawing,
    setIsDrawing,
    setCurrentStroke,
    setDrawingStartPos,
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
  // Track initial tap position/time for single-finger tap detection
  const tapStarts = useRef<Map<number, { x: number; y: number; t: number }>>(new Map());
  // Track potential single-finger pan start (activate after small threshold)
  const pendingPanStart = useRef<{ x: number; y: number } | null>(null);
  const initialPinch = useRef<{ distance: number; midpointX: number; midpointY: number; initialScale: number } | null>(null);
  const { handleDrawingStart } = useDrawingInteractions();
  // Track touch-based erasing (there is no buttons bitfield on touch)
  const eraseActiveRef = useRef<boolean>(false);
  // Track last two-finger midpoint for drag-to-pan
  const lastTwoFingerMidRef = useRef<{ x: number; y: number } | null>(null);
  // Track long-press for opening context menu on touch
  const longPressTimerRef = useRef<number | null>(null);
  const longPressTriggeredRef = useRef<boolean>(false);
  // Track a candidate for touch-based note dragging (when no tool active)
  const touchDragCandidateRef = useRef<null | {
    id: string;
    startClientX: number;
    startClientY: number;
    initialCanvasX: number;
    initialCanvasY: number;
  }>(null);

  // touch-action is handled by CSS (touch-none on canvas). No effect needed.

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    // Ignore mouse here; desktop uses existing mouse handlers
    if (e.pointerType === 'mouse') return;
    // capture pointer
    (e.target as Element).setPointerCapture?.(e.pointerId);

    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    // Record tap start for single-pointer gestures
    if (pointers.current.size === 1) {
      tapStarts.current.set(e.pointerId, { x: e.clientX, y: e.clientY, t: Date.now() });
    }

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const { canvasX, canvasY } = screenToCanvasCoords(e.clientX, e.clientY, rect, transform);

    // If two pointers are now active, initialize pinch regardless of tool mode
    if (pointers.current.size === 2) {
      const rect2 = canvasRef.current?.getBoundingClientRect();
      if (!rect2) return;
      const pts = Array.from(pointers.current.values());
      const dist = distanceBetween(pts[0], pts[1]);
      const m = midpoint(pts[0], pts[1]);
      // Cancel any active single-finger tool gestures when pinch starts
      if (toolMode === 'draw' && isDrawing) {
        setIsDrawing(false);
        setCurrentStroke?.([]);
        setDrawingStartPos?.(null);
      }
      if (toolMode === 'erase') {
        eraseActiveRef.current = false;
      }
      if (selectionBox?.dragging) {
        setSelectionBox?.(null);
      }
      // Cancel long-press and candidate drag on pinch start
      if (longPressTimerRef.current) {
        window.clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
      longPressTriggeredRef.current = false;
      touchDragCandidateRef.current = null;
      initialPinch.current = {
        // Clamp initial distance to reduce sensitivity when fingers start very close
        distance: Math.max(dist, 10),
        midpointX: (m.x - rect2.left) - rect2.width / 2,
        midpointY: m.y - rect2.top,
        initialScale: transform.scale
      };
      // Two-finger gesture should cancel follow-playhead
      setIsFollowingPlayhead(false);
      setIsPanning(true);
      lastTwoFingerMidRef.current = { x: (m.x - rect2.left) - rect2.width / 2, y: m.y - rect2.top };
      return;
    }

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

    // On touch: if no tool is active and a note is under the finger, prepare for note drag or long-press menu
    if (!toolMode && pointers.current.size === 1) {
      const clickedNote = findNoteAtPosition(
        canvasX,
        canvasY,
        notes,
        transform.scale,
        NOTE_LABEL_HIDE_THRESHOLD,
        true // exclude drawings: only text notes are draggable/contextable
      );
      if (clickedNote) {
        // Candidate for dragging this note if finger moves beyond threshold
        touchDragCandidateRef.current = {
          id: clickedNote.id,
          startClientX: e.clientX,
          startClientY: e.clientY,
          initialCanvasX: clickedNote.canvasX,
          initialCanvasY: clickedNote.canvasY,
        };
        // Start long-press to open context menu
        if (longPressTimerRef.current) window.clearTimeout(longPressTimerRef.current);
        longPressTriggeredRef.current = false;
        longPressTimerRef.current = window.setTimeout(() => {
          // If user hasn't moved far and still only one finger, open menu
          const cand = touchDragCandidateRef.current;
          if (!cand) return;
          if (pointers.current.size !== 1) return;
          longPressTriggeredRef.current = true;
          setIsPanning(false);
          setDragOccurred(true);
          // Open at current finger position
          ctx.setContextMenu?.({ isOpen: true, x: e.clientX, y: e.clientY, noteId: cand.id });
          // Clear candidate so we don't start dragging afterwards
          touchDragCandidateRef.current = null;
        }, 450);
        return;
      }
    }

    if (isDrawingMode && toolMode === 'draw') {
      handleDrawingStart(canvasX, canvasY);
      return;
    }

    // For single pointer with no active tool and no note under finger, prepare to pan (after threshold)
    if (pointers.current.size === 1 && !toolMode && !touchDragCandidateRef.current) {
      pendingPanStart.current = { x: e.clientX, y: e.clientY };
      // Do not set isPanning yet; wait for small movement to preserve tap-to-seek
    }
  }, [isDrawingMode, toolMode, setIsPanning, setIsFollowingPlayhead, canvasRef, transform, setDragOccurred, handleDrawingStart, notes, NOTE_LABEL_HIDE_THRESHOLD, selectionBox, setSelectionBox, selectedDrawingIds, isDrawing, setIsDrawing, setCurrentStroke, setDrawingStartPos, ctx]);

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

    // Pinch-zoom + two-finger pan when two pointers are active (takes precedence over tools)
    if (pointers.current.size === 2) {
      const pinchState = initialPinch.current;
      if (!pinchState) return; // not initialized yet
      // Process pinch on any pointer move to keep midpoint updates smooth
      // Ensure any single-finger actions are cancelled during pinch move
      if (isDrawing) {
        setIsDrawing(false);
        setCurrentStroke?.([]);
        setDrawingStartPos?.(null);
      }
      eraseActiveRef.current = false;
      if (selectionBox?.dragging) {
        setSelectionBox?.(null);
      }
      const pts = Array.from(pointers.current.values());
      const dist = distanceBetween(pts[0], pts[1]);
      const m = midpoint(pts[0], pts[1]);
      // Current midpoint in screen-space coordinates used by transform mapping
      const curMidX = (m.x - rect.left) - rect.width / 2;
      const curMidY = m.y - rect.top;
      // Two-finger drag delta
      const last = lastTwoFingerMidRef.current ?? { x: curMidX, y: curMidY };
      const dx = curMidX - last.x;
      const dy = curMidY - last.y;
      setDragOccurred(true);
      setTransform(prev => {
        // Compute scale against initial distance and initial scale to avoid compounding
        const { newScale } = computePinchScale(pinchState.distance, dist, pinchState.initialScale);
        // Use prev.scale for consistency to avoid jumps from stale closures
        const scaleChange = newScale / prev.scale;
        // Tiny deadzone to avoid micro teleports when gesture is jittery
        const effectiveScaleChange = Math.abs(scaleChange - 1) < 0.005 ? 1 : scaleChange;
        // Apply panning by midpoint delta first
        let nextOffsetX = prev.offsetX + dx;
        let nextOffsetY = prev.offsetY + dy;
        // Apply zoom around the original pivot point from gesture start
        nextOffsetX = nextOffsetX - (pinchState.midpointX - nextOffsetX) * (effectiveScaleChange - 1);
        nextOffsetY = nextOffsetY - (pinchState.midpointY - nextOffsetY) * (effectiveScaleChange - 1);
        return {
          scale: effectiveScaleChange === 1 ? prev.scale : newScale,
          offsetX: nextOffsetX,
          offsetY: nextOffsetY,
        };
      });
      // Prevent any browser-level gesture handling just in case
      const ne = e.nativeEvent as PointerEvent;
      if (ne.cancelable) e.preventDefault();
      // Update last midpoint for next move
      lastTwoFingerMidRef.current = { x: curMidX, y: curMidY };
      return;
    }

    // Cancel long-press if moving beyond small threshold
    const start = tapStarts.current.get(e.pointerId);
    if (start) {
      const dx0 = Math.abs(e.clientX - start.x);
      const dy0 = Math.abs(e.clientY - start.y);
      if (dx0 > 6 || dy0 > 6) {
        if (longPressTimerRef.current) {
          window.clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
        }
      }
    }

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

    // Touch note dragging when no tool is active
    if (!toolMode && touchDragCandidateRef.current) {
      const cand = touchDragCandidateRef.current;
      const movedX = Math.abs(e.clientX - cand.startClientX);
      const movedY = Math.abs(e.clientY - cand.startClientY);
      if (movedX > 6 || movedY > 6) {
        // Begin dragging the note
        setDragOccurred(true);
        setDragging({
          id: cand.id,
          startX: cand.startClientX,
          startY: cand.startClientY,
          initialCanvasX: cand.initialCanvasX,
          initialCanvasY: cand.initialCanvasY,
        });
        history.beginMove(cand.id, { x: cand.initialCanvasX, y: cand.initialCanvasY });
        // Cancel long-press and candidate
        if (longPressTimerRef.current) {
          window.clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
        }
        longPressTriggeredRef.current = false;
        touchDragCandidateRef.current = null;
        return;
      }
    }

    // Otherwise, panning for single pointer
    // If no tool is active, enable one-finger pan after a small movement threshold
    if (!toolMode && !touchDragCandidateRef.current && pointers.current.size === 1 && !isPanning && pendingPanStart.current) {
      const dx0 = Math.abs(e.clientX - pendingPanStart.current.x);
      const dy0 = Math.abs(e.clientY - pendingPanStart.current.y);
      if (dx0 > 6 || dy0 > 6) {
        setIsPanning(true);
        setLastPanPoint({ x: e.clientX, y: e.clientY });
        setIsFollowingPlayhead(false);
        // Clear pending to avoid re-trigger
        pendingPanStart.current = null;
      }
    }
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
  }, [canvasRef, transform, isPanning, lastPanPoint, setTransform, toolMode, selectionBox, setDragOccurred, ctx, isDrawing, setCurrentStroke, setDrawingStartPos, setIsDrawing, setSelectionBox, setIsPanning, setIsFollowingPlayhead, setLastPanPoint, setDragging]);

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
    // Clear pending pan start when gesture ends
    pendingPanStart.current = null;
    // Cancel long-press timer on up
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    const wasLongPress = longPressTriggeredRef.current;
    longPressTriggeredRef.current = false;
    // Clear any dormant candidate
    touchDragCandidateRef.current = null;
    // Single-finger tap-to-seek: only when gesture ends and it was a tap (no drag/pan)
    const start = tapStarts.current.get(e.pointerId);
    tapStarts.current.delete(e.pointerId);
    if (
      start &&
      pointers.current.size === 0 && // gesture ended
      !isPanning &&
      !wasLongPress &&
      duration > 0
    ) {
      const dx = Math.abs(e.clientX - start.x);
      const dy = Math.abs(e.clientY - start.y);
      const dt = Date.now() - start.t;
      if (dx <= 6 && dy <= 6 && dt <= 300) {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (rect) {
          const { canvasX, canvasY } = screenToCanvasCoords(e.clientX, e.clientY, rect, transform);
          // Seek to note if tapped on note and not in drawing mode
          const clickedNote = findNoteAtPosition(canvasX, canvasY, notes, transform.scale, NOTE_LABEL_HIDE_THRESHOLD, !isDrawingMode);
          if (clickedNote && !isDrawingMode) {
            seekToTime(clickedNote.time);
            return;
          }
          // Otherwise, seek to waveform time if inside bounds
          const { waveformX, waveformWidth, waveformHeight } = getWaveformDimensions(rect.width, rect.height, duration);
          if (isClickInWaveform(canvasX, waveformX, waveformWidth)) {
            const time = getTimeFromCanvasY(canvasY, waveformHeight, duration);
            seekToTime(time);
          }
        }
      }
    }
  }, [setIsPanning, isPanning, canvasRef, duration, isDrawingMode, notes, NOTE_LABEL_HIDE_THRESHOLD, seekToTime, transform]);

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
