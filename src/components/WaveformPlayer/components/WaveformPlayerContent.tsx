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
  const { isPanning, isDrawing, dragging, transform, notes, editingNote, setEditingNote, setEditContent, deleteConfirmNoteId, setDeleteConfirmNoteId, contextMenu, setContextMenu } = useWaveformContext();
  const frameRef = useRef<number | null>(null);
  const activeRef = useRef(false);
  const suppressContextUntilRef = useRef<number>(0);
  const rcOriginInsideEditorRef = useRef<boolean>(false);

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

  // Global Escape handling: close editor or modal if open
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (contextMenu.isOpen) {
          e.preventDefault();
          setContextMenu(m => ({ ...m, isOpen: false }));
          return;
        }
        if (editingNote) {
          e.preventDefault();
          setEditingNote(null);
          setEditContent('');
          return;
        }
        if (deleteConfirmNoteId) {
          e.preventDefault();
          setDeleteConfirmNoteId(null);
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [contextMenu.isOpen, editingNote, deleteConfirmNoteId, setEditingNote, setEditContent, setDeleteConfirmNoteId, setContextMenu]);

  // Temporary suppression of native context menu for ~500ms after any right mouseup
  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (e.button === 2) {
        const target = e.target as Element | null;
        rcOriginInsideEditorRef.current = !!target && !!(target as Element).closest?.('[data-inline-editor="true"]');
      }
    };
    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 2) {
        // Only suppress if the right-click did NOT originate inside the inline editor
        if (!rcOriginInsideEditorRef.current) {
          suppressContextUntilRef.current = Date.now() + 500;
        }
        rcOriginInsideEditorRef.current = false;
      }
    };
    const onContext = (e: MouseEvent) => {
      if (Date.now() < suppressContextUntilRef.current) {
        e.preventDefault();
      }
    };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mouseup', onMouseUp);
    document.addEventListener('contextmenu', onContext, { capture: true });
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('contextmenu', onContext, { capture: true } as unknown as EventListenerOptions);
    };
  }, []);

  return (
    <>
      <WaveformCanvas />
      <NoteContextMenu />
      <InlineNoteEditor />
      <DeleteConfirmModal />
    </>
  );
};
