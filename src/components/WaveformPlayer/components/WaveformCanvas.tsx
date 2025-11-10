import React, { useCallback, useEffect, useRef } from 'react';
import { useWaveformContext } from '@contexts/objects/WaveformContextObject';
import { useMouseInteractions } from '../hooks/useMouseInteractions';
import { usePointerInteractions } from '../hooks/usePointerInteractions';
import { useDrawingInteractions } from '../hooks/useDrawingInteractions';
import { screenToCanvasCoords, findNoteAtPosition, isClickInWaveform, getTimeFromCanvasY, getWaveformDimensions } from '@utils/canvasUtils';
import { useAudio } from '@contexts/objects/AudioContextObject';

export const WaveformCanvas: React.FC = () => {
  const {
    canvasRef,
    transform,
    isDrawingMode,
    toolMode,
    isPanning,
    dragOccurred,
    notes,
    NOTE_LABEL_HIDE_THRESHOLD
  } = useWaveformContext();
  // Selection / drawings state pulled once (avoid calling hook inside handlers)
  const { selectionBox, setSelectionBox, selectedDrawingIds } = useWaveformContext();

  const { duration, seekToTime } = useAudio();
  const { handleMouseDown, handleMouseMove, handleWheel } = useMouseInteractions();
  const { handlePointerDown, handlePointerMove, handlePointerUp } = usePointerInteractions();
  const { handleDrawingStart } = useDrawingInteractions();
  const { setContextMenu, setIsPanning } = useWaveformContext();
  // Right-click hold timer state
  const holdTimerRef = useRef<number | null>(null);
  const rightButtonDownRef = useRef(false);
  const lastRCDownPosRef = useRef<{ x: number; y: number } | null>(null);

  // Enhanced mouse down handler that includes drawing
  const enhancedHandleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    // First call the base mouse handler
    handleMouseDown(e);

    // Then handle drawing if in drawing mode
    // Selection tool start
    if (toolMode === 'select' && e.button === 0) {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const { canvasX, canvasY } = screenToCanvasCoords(e.clientX, e.clientY, rect, transform);
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

    if (isDrawingMode && e.button === 0 && toolMode === 'draw') {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;

      const { canvasX, canvasY } = screenToCanvasCoords(e.clientX, e.clientY, rect, transform);
      handleDrawingStart(canvasX, canvasY);
    }
  }, [handleMouseDown, isDrawingMode, toolMode, canvasRef, transform, handleDrawingStart, selectionBox, setSelectionBox, selectedDrawingIds, notes]);

  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current || duration === 0 || isPanning || dragOccurred) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const { canvasX, canvasY } = screenToCanvasCoords(e.clientX, e.clientY, rect, transform);

    // Check if clicking on a note - exclude drawings when not in drawing mode
    const clickedNote = findNoteAtPosition(canvasX, canvasY, notes, transform.scale, NOTE_LABEL_HIDE_THRESHOLD, !isDrawingMode);

    if (clickedNote && !isDrawingMode) {
      // Seek to note time
      seekToTime(clickedNote.time);
      return;
    }

    // Check if click is within waveform bounds for seeking
    const { waveformX, waveformWidth, waveformHeight } = getWaveformDimensions(rect.width, rect.height, duration);

    if (isClickInWaveform(canvasX, waveformX, waveformWidth)) {
      const time = getTimeFromCanvasY(canvasY, waveformHeight, duration);
      seekToTime(time);
    }
  }, [canvasRef, duration, isPanning, dragOccurred, transform, notes, NOTE_LABEL_HIDE_THRESHOLD, isDrawingMode, seekToTime]);

  const handleContextMenu = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    // Always suppress the default browser menu; opening our menu is managed by right-hold logic
    e.preventDefault();
  }, []);

  // Also support right-button press (mousedown with button === 2) to open menu immediately for hold-select gesture
  const handleMouseDownForMenu = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button !== 2) return;
    if (!canvasRef.current) return;
    // Start hold detection for right-click
    rightButtonDownRef.current = true;
    lastRCDownPosRef.current = { x: e.clientX, y: e.clientY };
    e.preventDefault();

    const rect = canvasRef.current.getBoundingClientRect();
    const { canvasX, canvasY } = screenToCanvasCoords(e.clientX, e.clientY, rect, transform);
    const clickedNote = findNoteAtPosition(
      canvasX,
      canvasY,
      notes,
      transform.scale,
      NOTE_LABEL_HIDE_THRESHOLD,
      true // exclude drawings: only text notes can open context menu
    );

    // Only allow menu for non-drawing notes
    if (!clickedNote) return;

    // Open after a short hold; cancel if mouseup happens first
    if (holdTimerRef.current) window.clearTimeout(holdTimerRef.current);
    holdTimerRef.current = window.setTimeout(() => {
      if (rightButtonDownRef.current) {
        // If panning is still flagged, clear it before opening menu
        if (isPanning) setIsPanning(false);
        const pos = lastRCDownPosRef.current || { x: e.clientX, y: e.clientY };
        setContextMenu({ isOpen: true, x: pos.x, y: pos.y, noteId: clickedNote.id });
      }
    }, 100); // 100ms hold right click to open menu
  }, [canvasRef, transform, notes, NOTE_LABEL_HIDE_THRESHOLD, setContextMenu, isPanning, setIsPanning]);

  // Cancel hold if right button released anywhere
  useEffect(() => {
    const onDocMouseUp = (ev: MouseEvent) => {
      if (ev.button === 2) {
        rightButtonDownRef.current = false;
        if (holdTimerRef.current) {
          window.clearTimeout(holdTimerRef.current);
          holdTimerRef.current = null;
        }
      }
    };
    document.addEventListener('mouseup', onDocMouseUp);
    return () => {
      document.removeEventListener('mouseup', onDocMouseUp);
      if (holdTimerRef.current) {
        window.clearTimeout(holdTimerRef.current);
        holdTimerRef.current = null;
      }
    };
  }, []);

  // Prevent default touch behavior to stop text selection on mobile
  const handleTouchStart = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    // Prevent text selection on double-tap-and-hold
    if (toolMode === 'draw' || toolMode === 'select' || toolMode === 'erase') {
      e.preventDefault();
    }
  }, [toolMode]);

  return (
    <canvas
      ref={canvasRef}
      className={`w-full h-full touch-none select-none touch-callout-none no-user-drag no-tap-highlight ${toolMode === 'draw'
        ? 'bg-neutral-700/50 cursor-crosshair'
        : toolMode === 'erase'
          ? 'bg-neutral-800 cursor-cell'
          : toolMode === 'select'
            ? 'bg-neutral-800 cursor-crosshair'
            : isPanning
              ? 'bg-neutral-800 cursor-grabbing'
              : 'bg-neutral-800 cursor-grab'
        }`}
      draggable={false}
      onDragStart={(e) => e.preventDefault()}
      onTouchStart={handleTouchStart}
      onClick={handleCanvasClick}
      onMouseDown={(e) => { handleMouseDownForMenu(e); enhancedHandleMouseDown(e); }}
      onMouseMove={handleMouseMove}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onWheel={handleWheel}
      onContextMenu={handleContextMenu}
    />
  );
};
