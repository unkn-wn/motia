import React, { useCallback, useEffect, useRef } from 'react';
import { useWaveformContext } from '@contexts/WaveformContext';
import { useMouseInteractions } from '../hooks/useMouseInteractions';
import { usePointerInteractions } from '../hooks/usePointerInteractions';
import { useDrawingInteractions } from '../hooks/useDrawingInteractions';
import { screenToCanvasCoords, findNoteAtPosition, isClickInWaveform, getTimeFromCanvasY, getWaveformDimensions } from '@utils/canvasUtils';
import { useAudio } from '@contexts/AudioContext';

export const WaveformCanvas: React.FC = () => {
  const {
    canvasRef,
    transform,
    isDrawingMode,
    isPanning,
    dragOccurred,
    notes,
    NOTE_LABEL_HIDE_THRESHOLD
  } = useWaveformContext();

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
    if (isDrawingMode && e.button === 0) {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;

      const { canvasX, canvasY } = screenToCanvasCoords(e.clientX, e.clientY, rect, transform);
      handleDrawingStart(canvasX, canvasY);
    }
  }, [handleMouseDown, isDrawingMode, canvasRef, transform, handleDrawingStart]);

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
    const clickedNote = findNoteAtPosition(canvasX, canvasY, notes, transform.scale, NOTE_LABEL_HIDE_THRESHOLD, false);

    // Only allow menu for notes
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

  return (
    <canvas
      ref={canvasRef}
      className={`w-full h-full touch-none ${isDrawingMode ? 'bg-neutral-700/50 cursor-crosshair' :
        isPanning ? 'bg-neutral-800 cursor-grabbing' :
          'bg-neutral-800 cursor-grab'
        }`}
      onClick={handleCanvasClick}
      onMouseDown={(e) => { handleMouseDownForMenu(e); enhancedHandleMouseDown(e); }}
      onMouseMove={handleMouseMove}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onWheel={handleWheel}
      onContextMenu={handleContextMenu}
    />
  );
};
