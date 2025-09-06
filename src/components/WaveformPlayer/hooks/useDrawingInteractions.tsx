import { useCallback, useEffect } from 'react';
import { useWaveformContext } from '@contexts/objects/WaveformContextObject';
import { compressDrawingAdaptive } from '@utils/drawingUtils';
import { decompressSession } from '@utils/advancedCompression';
import type { DrawingSession } from '@types';

export const useDrawingInteractions = () => {
  const {
    isDrawingMode,
    isDrawing,
    setIsDrawing,
    currentStroke,
    setCurrentStroke,
    drawingStartPos,
    setDrawingStartPos,
    drawingSession,
    setDrawingSession,
    drawingNoteId,
    setDrawingNoteId,
    onAddDrawing,
    onUpdateDrawing,
    canvasRef,
    notes
  } = useWaveformContext();

  const handleDrawingStart = useCallback((canvasX: number, canvasY: number) => {
    if (!isDrawingMode || !onAddDrawing) return;

    setIsDrawing(true);
    setDrawingStartPos({ x: canvasX, y: canvasY });
    setCurrentStroke([{ x: canvasX, y: canvasY }]);

    // Initialize drawing session only if it doesn't exist yet
    setDrawingSession(prevSession => {
      if (!prevSession) {
        return {
          strokes: [],
          startTime: Date.now(),
          startPosition: { x: canvasX, y: canvasY }
        };
      }
      // If session exists, keep it as is - don't modify the start position
      return prevSession;
    });
  }, [isDrawingMode, onAddDrawing, setIsDrawing, setDrawingStartPos, setCurrentStroke, setDrawingSession]);

  const handleDrawingEnd = useCallback(() => {

    // Always clear drawing state first
    setIsDrawing(false);

    if (!drawingStartPos || currentStroke.length < 2) {
      // Invalid stroke - just clear state and return
      setCurrentStroke([]);
      setDrawingStartPos(null);
      return;
    }

    // Build base from current note state to stay in sync with undo/redo
    let baseStrokes: DrawingSession['strokes'] = [];
    let baseStartPos = drawingStartPos!;
    if (drawingNoteId) {
      const note = notes.find(n => n.id === drawingNoteId);
      baseStrokes = note?.drawing?.compressed ? decompressSession(note.drawing.compressed as unknown as import('@types').CompressedStroke[]) : [];
      baseStartPos = note ? { x: note.canvasX, y: note.canvasY } : baseStartPos;
    } else if (drawingSession) {
      baseStrokes = drawingSession.strokes;
      baseStartPos = drawingSession.startPosition || baseStartPos;
    }

    const nextStrokes = [
      ...baseStrokes,
      { points: currentStroke, color: '#9ca3af', strokeWidth: 2 },
    ];

    // Compress the entire session (advanced adaptive already optimizes per stroke and at session-level)
    const compressionResult = compressDrawingAdaptive(nextStrokes);

    // Calculate bounds
    const allPoints = nextStrokes.flatMap(stroke => stroke.points);
    const minX = Math.min(...allPoints.map(p => p.x));
    const maxX = Math.max(...allPoints.map(p => p.x));
    const minY = Math.min(...allPoints.map(p => p.y));
    const maxY = Math.max(...allPoints.map(p => p.y));

    const drawing = {
      compressed: compressionResult.strokes,
      bounds: { width: maxX - minX + 20, height: maxY - minY + 20 },
      originalSize: compressionResult.originalSize,
      compressedSize: compressionResult.compressedSize,
      compressionRatio: compressionResult.reduction,
    };

    // Calculate time for first stroke only
    const rect = canvasRef.current?.getBoundingClientRect();
    const waveformHeight = rect ? Math.max(rect.height * 3, 100) : 100;
    const timeProgress = (baseStartPos?.y ?? 0) / waveformHeight;
    const time = Math.max(0, Math.min(100, timeProgress * 100));

    if (!drawingNoteId) {
      if (onAddDrawing) {
        const newId = onAddDrawing(time, baseStartPos.x, baseStartPos.y, drawing);
        setDrawingNoteId(newId ?? null);
      }
    } else {
      onUpdateDrawing?.(drawingNoteId, drawing);
    }

    // Update local session for live rendering of current stroke behavior
    setDrawingSession({ strokes: nextStrokes, startTime: Date.now(), startPosition: baseStartPos });

    // Clear the live stroke
    setCurrentStroke([]);
    setDrawingStartPos(null);
  }, [drawingStartPos, currentStroke, setIsDrawing, setCurrentStroke, setDrawingStartPos, setDrawingSession, canvasRef, drawingNoteId, onAddDrawing, onUpdateDrawing, setDrawingNoteId, notes, drawingSession]);

  // Save drawing session
  const saveDrawingSession = useCallback((session: DrawingSession) => {
    if (!onAddDrawing || session.strokes.length === 0) return;

    const compressionResult = compressDrawingAdaptive(session.strokes);

    // Calculate bounds
    const allPoints = session.strokes.flatMap(stroke => stroke.points);
    const minX = Math.min(...allPoints.map(p => p.x));
    const maxX = Math.max(...allPoints.map(p => p.x));
    const minY = Math.min(...allPoints.map(p => p.y));
    const maxY = Math.max(...allPoints.map(p => p.y));

    const drawing = {
      compressed: compressionResult.strokes,
      bounds: {
        width: maxX - minX + 20,
        height: maxY - minY + 20
      },
      originalSize: compressionResult.originalSize,
      compressedSize: compressionResult.compressedSize,
      compressionRatio: compressionResult.reduction
    };

    // Calculate time
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const waveformHeight = Math.max(rect.height * 3, 100);
    const timeProgress = session.startPosition.y / waveformHeight;
    const time = Math.max(0, Math.min(100, timeProgress * 100)); // Fallback duration

    onAddDrawing(time, session.startPosition.x, session.startPosition.y, drawing);
  }, [onAddDrawing, canvasRef]);

  // Handle drawing mode changes - clear state on exit (note is already kept up to date)
  useEffect(() => {
    if (isDrawingMode && !drawingSession) {
      // Drawing mode just turned on - initialize session
      setDrawingSession({
        strokes: [],
        startTime: Date.now(),
        startPosition: { x: 0, y: 0 }
      });
    } else if (!isDrawingMode) {
      // Exiting drawing mode: reset ephemeral state; drawing note already persisted incrementally
      setDrawingSession(null);
      setDrawingNoteId(null);
    }
    // Don't clear the session if we're still in drawing mode or actively drawing
  }, [isDrawingMode, drawingSession, isDrawing, setDrawingSession, setDrawingNoteId]);

  // Rely on global history for undo/redo of drawing updates

  return {
    handleDrawingStart,
    handleDrawingEnd,
    saveDrawingSession
  };
};
