import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { WaveformCanvas } from './WaveformCanvas';
import { NoteContextMenu } from './NoteContextMenu';
import { InlineNoteEditor } from './InlineNoteEditor';
import { DeleteConfirmModal } from './DeleteConfirmModal';
import { useCanvasRenderer } from '../hooks/useCanvasRenderer';
import { useGlobalMouseHandlers } from '../hooks/useGlobalMouseHandlers';
import { useAudio } from '@contexts/objects/AudioContextObject';
import { useWaveformContext } from '@contexts/objects/WaveformContextObject';
import { deleteSelection } from '../hooks/mouse/selectionMouseHandlers';
import { useStoryboard } from '@/features/storyboard/StoryboardContext';
import { thumbnailStore } from '@/features/storyboard/canvas/thumbnails';
import { currentTimeStore } from '@components/AudioControls/state';
import { isFrameEditorOpen, isUserTyping } from '@utils/shortcutsUtils';

export const WaveformPlayerContent: React.FC = () => {
  const { renderCanvas } = useCanvasRenderer();
  const { isPlaying } = useAudio();
  const ctx = useWaveformContext();
  const { renderPaused, isPanning, isDrawing, dragging, transform, notes, editingNote, setEditingNote, setEditContent, deleteConfirmNoteId, setDeleteConfirmNoteId, contextMenu, setContextMenu, selectionBox, selectedDrawingIds, selectedStrokeGroups, erasingStrokeIds, eraserCursor, toolMode, movingStrokePreview, canvasRef } = ctx;
  const activeRef = useRef(false);
  const suppressContextUntilRef = useRef<number>(0);
  const rcOriginInsideEditorRef = useRef<boolean>(false);

  // Keep a fresh ref of context for stable keyboard handler
  const ctxRef = useRef(ctx);
  useEffect(() => { ctxRef.current = ctx; }, [ctx]);
  const storyboard = useStoryboard();
  const storyboardRef = useRef(storyboard);
  useEffect(() => { storyboardRef.current = storyboard; }, [storyboard]);

  // Set up global mouse handlers
  useGlobalMouseHandlers();

  // The loop draws with the latest renderer. While following the playhead the view moves every frame, so the
  // renderer changes every frame: it must not restart the loop. A restart cancels the frame the loop was waiting for,
  // and when the playback clock's own frame runs first (it updates the time, which re-renders and settles this
  // effect before the canvas's frame), every frame is cancelled and the canvas stops drawing.
  const renderRef = useRef(renderCanvas);
  useLayoutEffect(() => { renderRef.current = renderCanvas; }, [renderCanvas]);

  // Animated while something changes continuously (playback, panning, drawing, dragging, erasing); nothing to draw
  // while the frame editor covers the canvas. Only becoming active or idle starts or stops the loop.
  const active = !renderPaused && (isPlaying || isPanning || isDrawing || !!dragging || !!selectionBox?.dragging || toolMode === 'erase');
  useEffect(() => {
    activeRef.current = active;
    if (!active) {
      // Idle: draw once with the latest state
      renderRef.current();
      return;
    }
    let frame = requestAnimationFrame(function tick() {
      renderRef.current();
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [active]);

  // A time change while nothing animates (a seek, a click on the waveform) redraws the playhead once
  useEffect(
    () =>
      currentTimeStore.subscribe(() => {
        if (!activeRef.current) renderRef.current();
      }),
    []
  );

  // Bumps when frame thumbnails finish rendering
  const thumbnailVersion = useSyncExternalStore(thumbnailStore.subscribe, thumbnailStore.getVersion);

  // When static, re-render on key data changes (transform/notes/thumbnails) to reflect updates
  useEffect(() => {
    if (!activeRef.current) {
      renderCanvas();
    }
    // Only when transform or notes identity changes
  }, [transform, notes, selectionBox, selectedDrawingIds, selectedStrokeGroups, erasingStrokeIds, eraserCursor, movingStrokePreview, renderCanvas, thumbnailVersion]);

  // Global Escape handling: close editor or modal if open
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isFrameEditorOpen()) return;
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

  // Delete/Backspace: delete selected strokes when selection tool is active
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      if (isUserTyping() || isFrameEditorOpen()) return;
      // Ignore if modifiers are held (Ctrl+Backspace = browser back, etc.)
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const currentCtx = ctxRef.current;
      if (currentCtx.toolMode !== 'select') return;
      if (!currentCtx.selectedStrokeGroups?.length && currentCtx.selectedFrameIds.size === 0) return;
      e.preventDefault();
      deleteSelection(currentCtx, storyboardRef.current);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // Stable callback for the mobile delete button
  const handleDeleteSelection = useCallback(() => {
    deleteSelection(ctxRef.current, storyboardRef.current);
  }, []);

  // Temporary suppression of native context menu for ~100ms after any right mouseup
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
          suppressContextUntilRef.current = Date.now() + 100;
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

  // Show delete popup only when user tapped inside selection on touch device (showSelectionActions toggled by pointer handler)
  const { showSelectionActions } = ctx;
  const showDeleteButton = showSelectionActions
    && toolMode === 'select'
    && selectionBox
    && !selectionBox.dragging
    && ((selectedStrokeGroups?.length ?? 0) > 0 || ctx.selectedFrameIds.size > 0);

  const deleteButtonPos = useMemo(() => {
    if (!showDeleteButton || !canvasRef.current) return null;
    const rect = canvasRef.current.getBoundingClientRect();
    // Canvas→element pixel coords (no rect.left/top needed since button is position:absolute inside the canvas parent)
    const centerCanvasX = selectionBox!.x + selectionBox!.w / 2;
    const topCanvasY = selectionBox!.y;
    const pixelX = centerCanvasX * transform.scale + transform.offsetX + rect.width / 2 - 40;
    const pixelY = topCanvasY * transform.scale + transform.offsetY;
    return { x: pixelX, y: pixelY };
  }, [showDeleteButton, selectionBox, transform, canvasRef]);

  return (
    <>
      <WaveformCanvas />
      <NoteContextMenu />
      <InlineNoteEditor />
      <DeleteConfirmModal />
      {showDeleteButton && deleteButtonPos && (
        <button
          type="button"
          onClick={handleDeleteSelection}
          aria-label="Delete selection"
          style={{
            position: 'absolute',
            left: deleteButtonPos.x,
            top: deleteButtonPos.y - 48,
            transform: 'translateX(-50%)',
            zIndex: 50,
            backgroundColor: 'rgba(0, 0, 0, 0.85)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            boxShadow: '0 2px 12px rgba(0, 0, 0, 0.4)',
          }}
          className="px-5 py-2 rounded-xl
            text-white text-sm font-normal tracking-wide
            select-none touch-none
            animate-fade-in-up
            active:opacity-60
            cursor-pointer"
        >
          Delete
        </button>
      )}
    </>
  );
};

