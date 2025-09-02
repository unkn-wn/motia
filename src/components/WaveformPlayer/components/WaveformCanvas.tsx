import React, { useCallback } from 'react';
import { useWaveformContext } from '../contexts/WaveformContext';
import { useMouseInteractions } from '../hooks/useMouseInteractions';
import { useDrawingInteractions } from '../hooks/useDrawingInteractions';
import { screenToCanvasCoords, findNoteAtPosition, isClickInWaveform, getTimeFromCanvasY, getWaveformDimensions } from '../utils/canvasUtils';
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
  const { handleDrawingStart } = useDrawingInteractions();

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

  return (
    <canvas
      ref={canvasRef}
      className={`w-full h-full touch-none ${
        isDrawingMode ? 'bg-neutral-700/50 cursor-crosshair' :
        isPanning ? 'bg-neutral-800 cursor-grabbing' :
        'bg-neutral-800 cursor-grab'
      }`}
      onClick={handleCanvasClick}
      onMouseDown={enhancedHandleMouseDown}
      onMouseMove={handleMouseMove}
      onWheel={handleWheel}
    />
  );
};
