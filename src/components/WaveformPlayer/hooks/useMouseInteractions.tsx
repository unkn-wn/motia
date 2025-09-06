import { useCallback } from 'react';
import { useWaveformContext } from '@contexts/WaveformContext';
import { screenToCanvasCoords, findNoteAtPosition } from '@utils/canvasUtils';
import { history } from '@utils/history';
import { getPreferences } from '@utils/shortcutsUtils';

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
    const prefs = getPreferences();
    const desired = prefs.panMouseButton; // 'Left' | 'Middle' | 'Right'

    // Map mouse button to label
    const buttonLabel = e.button === 0 ? 'Left' : e.button === 1 ? 'Middle' : e.button === 2 ? 'Right' : 'Left';

    // Common rect/clicked note calculation where needed
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const { canvasX, canvasY } = screenToCanvasCoords(e.clientX, e.clientY, rect, transform);
    const clickedNote = findNoteAtPosition(canvasX, canvasY, notes, transform.scale, NOTE_LABEL_HIDE_THRESHOLD, !isDrawingMode);

    // If clicking on a note with left button and not drawing, start dragging
    if (buttonLabel === 'Left' && clickedNote && !isDrawingMode) {
      e.preventDefault();
      setDragOccurred(false);
      setDragging({
        id: clickedNote.id,
        startX: e.clientX,
        startY: e.clientY,
        initialCanvasX: clickedNote.canvasX,
        initialCanvasY: clickedNote.canvasY
      });
      // Start a coalesced move entry for history
      history.beginMove(clickedNote.id, { x: clickedNote.canvasX, y: clickedNote.canvasY });
      return;
    }

    // Drawing start is handled in WaveformCanvas; when in drawing mode, block panning for Left only
    if (isDrawingMode && buttonLabel === 'Left') {
      return;
    }

    // Start panning only when the pressed mouse button matches preference
    if (buttonLabel === desired) {
      e.preventDefault();
      setIsPanning(true);
      setLastPanPoint({ x: e.clientX, y: e.clientY });
      setIsFollowingPlayhead(false);
      // One-shot global cleanup to avoid "stuck" panning if the effect-based listeners haven't attached yet
      const onUp = () => {
        setIsPanning(false);
        window.removeEventListener('mouseup', onUp, true);
        window.removeEventListener('pointerup', onUp as unknown as EventListener, true);
        window.removeEventListener('blur', onBlur, true);
        window.removeEventListener('contextmenu', onUp, true);
      };
      const onBlur = () => onUp();
      window.addEventListener('mouseup', onUp, { capture: true } as AddEventListenerOptions);
      window.addEventListener('pointerup', onUp as unknown as EventListener, { capture: true } as AddEventListenerOptions);
      window.addEventListener('blur', onBlur, { capture: true } as AddEventListenerOptions);
      window.addEventListener('contextmenu', onUp, { capture: true } as AddEventListenerOptions);
      return;
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
    if (e.cancelable) {
      e.preventDefault();
    }
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
