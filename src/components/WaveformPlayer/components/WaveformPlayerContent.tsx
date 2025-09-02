import React, { useEffect } from 'react';
import { WaveformCanvas } from './WaveformCanvas';
import { NoteEditingOverlay } from './NoteEditingOverlay';
import { useCanvasRenderer } from '../hooks/useCanvasRenderer';
import { useGlobalMouseHandlers } from '../hooks/useGlobalMouseHandlers';

export const WaveformPlayerContent: React.FC = () => {
  const { renderCanvas } = useCanvasRenderer();

  // Set up global mouse handlers
  useGlobalMouseHandlers();

  // Render canvas when dependencies change
  useEffect(() => {
    renderCanvas();
  });

  return (
    <>
      <WaveformCanvas />
      <NoteEditingOverlay />
    </>
  );
};
