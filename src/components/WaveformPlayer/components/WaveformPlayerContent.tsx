import React, { useEffect, useRef } from 'react';
import { WaveformCanvas } from './WaveformCanvas';
import { NoteContextMenu } from './NoteContextMenu';
import { InlineNoteEditor } from './InlineNoteEditor';
import { DeleteConfirmModal } from './DeleteConfirmModal';
import { useCanvasRenderer } from '../hooks/useCanvasRenderer';
import { useGlobalMouseHandlers } from '../hooks/useGlobalMouseHandlers';
import { useAudio } from '@contexts/AudioContext';
import { useWaveformContext } from '@contexts/WaveformContext';

export const WaveformPlayerContent: React.FC = () => {
  const { renderCanvas } = useCanvasRenderer();
  const { isPlaying } = useAudio();
  const { isPanning, isDrawing, dragging, transform, notes } = useWaveformContext();
  const frameRef = useRef<number | null>(null);
  const activeRef = useRef(false);

  // Set up global mouse handlers
  useGlobalMouseHandlers();

  // RAF-driven render when actively changing (playback, panning, drawing, dragging)
  useEffect(() => {
    const active = isPlaying || isPanning || isDrawing || !!dragging;
    activeRef.current = active;

    if (!active) {
      // If not active, render once to reflect latest state
      renderCanvas();
      // Ensure any pending RAF is canceled
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
      return;
    }

    const tick = () => {
      renderCanvas();
      frameRef.current = requestAnimationFrame(tick);
    };

    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [isPlaying, isPanning, isDrawing, dragging, renderCanvas]);

  // When static, re-render on key data changes (transform/notes) to reflect updates
  useEffect(() => {
    if (!activeRef.current) {
      renderCanvas();
    }
    // Only when transform or notes identity changes
  }, [transform, notes, renderCanvas]);

  return (
    <>
      <WaveformCanvas />
  <NoteContextMenu />
  <InlineNoteEditor />
  <DeleteConfirmModal />
    </>
  );
};
