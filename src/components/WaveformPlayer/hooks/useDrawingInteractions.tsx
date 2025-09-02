import { useCallback, useEffect } from 'react';
import { useWaveformContext } from '../contexts/WaveformContext';
import { compressDrawingAdaptive } from '@utils/drawingUtils';
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
    onAddDrawing,
    canvasRef
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
    // console.log('Drawing end called', {
    //   currentStrokeLength: currentStroke.length,
    //   hasDrawingStartPos: !!drawingStartPos,
    //   sessionStrokeCount: drawingSession?.strokes.length || 0
    // });

    // Always clear drawing state first
    setIsDrawing(false);

    if (!drawingStartPos || currentStroke.length < 2) {
      // Invalid stroke - just clear state and return
      setCurrentStroke([]);
      setDrawingStartPos(null);
      return;
    }

    // Add completed stroke to the drawing session
    setDrawingSession(prevSession => {
      if (!prevSession) return null;

      const newSession = {
        ...prevSession,
        strokes: [...prevSession.strokes, {
          points: currentStroke,
          color: '#9ca3af', // Default color
          strokeWidth: 2 // Default stroke width
        }]
      };

      // console.log('Added stroke to existing session', {
      //   previousCount: prevSession.strokes.length,
      //   newCount: newSession.strokes.length
      // });
      return newSession;
    });

    // Clear current stroke state
    setCurrentStroke([]);
    setDrawingStartPos(null);

    // Note: Don't clear drawingSession here - let the drawing mode change handle saving
  }, [drawingStartPos, currentStroke, drawingSession, setIsDrawing, setCurrentStroke, setDrawingStartPos, setDrawingSession]);

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

  // Handle drawing mode changes - improved session management
  useEffect(() => {
    if (isDrawingMode && !drawingSession) {
      // Drawing mode just turned on - initialize session
      setDrawingSession({
        strokes: [],
        startTime: Date.now(),
        startPosition: { x: 0, y: 0 }
      });
    } else if (!isDrawingMode && drawingSession && drawingSession.strokes.length > 0 && !isDrawing) {
      // Drawing mode turned off AND we're not currently drawing - save the session if it has strokes
      saveDrawingSession(drawingSession);
      setDrawingSession(null);
    } else if (!isDrawingMode && drawingSession && drawingSession.strokes.length === 0) {
      // Drawing mode turned off with no strokes - just clear session
      setDrawingSession(null);
    }
    // Don't clear the session if we're still in drawing mode or actively drawing
  }, [isDrawingMode, drawingSession, isDrawing, saveDrawingSession, setDrawingSession]);

  return {
    handleDrawingStart,
    handleDrawingEnd,
    saveDrawingSession
  };
};
