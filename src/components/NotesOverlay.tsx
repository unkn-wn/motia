import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Edit3, Trash2, Clock, X, Check } from 'lucide-react';
import { getColorCode } from '../utils/colorUtils';
import { formatTime } from '../utils/timeUtils';
import { calculateWaveformDimensions } from '../utils/canvasUtils';
import {
  optimizeDrawingPoints,
  compressDrawingAdaptive
} from '../utils/drawingUtils';
import { decompressSession } from '../utils/advancedCompression';
import type {
  Note,
  DrawingPoint,
  DrawingStroke,
  DrawingSession,
  CanvasTransform
} from '../types';

interface NotesOverlayProps {
  notes: Note[];
  onUpdateNote: (id: string, content: string) => void;
  onDeleteNote: (id: string) => void;
  onMoveNote?: (id: string, canvasX: number, canvasY: number) => void;
  onSeek?: (time: number) => void;
  duration?: number;
  canvasTransform?: CanvasTransform;
  onWheel?: (e: React.WheelEvent) => void;
  // Drawing mode props
  isDrawingMode?: boolean;
  onAddDrawing?: (time: number, canvasX: number, canvasY: number, drawing: Note['drawing']) => void;
}

const NotesOverlay: React.FC<NotesOverlayProps> = ({
  notes,
  onUpdateNote,
  onDeleteNote,
  onMoveNote,
  onSeek,
  duration = 0,
  canvasTransform = { offsetX: 0, offsetY: 0, scale: 1 },
  onWheel,
  isDrawingMode = false,
  onAddDrawing,
}) => {
  const [editingNote, setEditingNote] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [dragging, setDragging] = useState<{
    id: string;
    startX: number;
    startY: number;
    initialCanvasX: number;
    initialCanvasY: number;
  } | null>(null);
  const [dragOccurred, setDragOccurred] = useState(false);

  // Drawing state
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentStroke, setCurrentStroke] = useState<DrawingPoint[]>([]);
  const [drawingStartPos, setDrawingStartPos] = useState<{ x: number; y: number } | null>(null);

  // Drawing session state - accumulates all strokes until drawing mode is turned off
  const [drawingSession, setDrawingSession] = useState<DrawingSession | null>(null);

  // Zoom threshold below which note labels will be hidden (only dots remain)
  const NOTE_LABEL_HIDE_THRESHOLD = 0;

  // Handle drawing mode changes
  useEffect(() => {
    if (isDrawingMode && !drawingSession) {
      // Drawing mode just turned on - initialize new drawing session
      setDrawingSession({
        strokes: [],
        startTime: Date.now(),
        startPosition: { x: 0, y: 0 } // Will be set when first stroke starts
      });
    } else if (!isDrawingMode && drawingSession && drawingSession.strokes.length > 0) {
      // Drawing mode just turned off - save the complete drawing session
      saveDrawingSession(drawingSession);
      setDrawingSession(null);
    } else if (!isDrawingMode && drawingSession) {
      // Drawing mode turned off but no strokes - just clear the session
      setDrawingSession(null);
    }
  }, [isDrawingMode, drawingSession]);

  // Function to save the complete drawing session
  const saveDrawingSession = useCallback((session: DrawingSession) => {
    if (!onAddDrawing || session.strokes.length === 0) return;

    // Use adaptive compression for the entire drawing session
    const compressionResult = compressDrawingAdaptive(session.strokes);

    console.log('Drawing session compression metrics:', {
      originalSize: compressionResult.originalSize,
      compressedSize: compressionResult.compressedSize,
      reductionPercentage: compressionResult.reduction,
      strokeCount: session.strokes.length
    });

    // Calculate bounds for the entire drawing
    const allPoints = session.strokes.flatMap(stroke => stroke.points);
    const minX = Math.min(...allPoints.map(p => p.x));
    const maxX = Math.max(...allPoints.map(p => p.x));
    const minY = Math.min(...allPoints.map(p => p.y));
    const maxY = Math.max(...allPoints.map(p => p.y));

    const drawing = {
      compressed: compressionResult.strokes,
      bounds: {
        width: maxX - minX + 20, // Add padding
        height: maxY - minY + 20
      },
      originalSize: compressionResult.originalSize,
      compressedSize: compressionResult.compressedSize,
      compressionRatio: compressionResult.reduction
    };

    // Calculate the time based on drawing position
    const waveformHeight = Math.max(window.innerHeight * 3, duration * 100);
    const timeProgress = session.startPosition.y / waveformHeight;
    const time = Math.max(0, Math.min(duration, timeProgress * duration));

    // Save the complete drawing session as one note
    onAddDrawing(time, session.startPosition.x, session.startPosition.y, drawing);
  }, [onAddDrawing, duration]);

  // Global mouse handlers for improved dragging
  useEffect(() => {
    if (!dragging) return;

    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (!onMoveNote || !dragging) return;

      const deltaX = e.clientX - dragging.startX;
      const deltaY = e.clientY - dragging.startY;

      // If there's significant movement, mark as dragged
      if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) {
        setDragOccurred(true);
      }

      // Convert screen delta to canvas delta
      const canvasDeltaX = deltaX / canvasTransform.scale;
      const canvasDeltaY = deltaY / canvasTransform.scale;

      // Update note position in canvas space
      onMoveNote(dragging.id, dragging.initialCanvasX + canvasDeltaX, dragging.initialCanvasY + canvasDeltaY);
    };

    const handleGlobalMouseUp = () => {
      setDragging(null);
      // Reset drag flag after a short delay to prevent immediate click
      setTimeout(() => setDragOccurred(false), 10);
    };

    document.addEventListener('mousemove', handleGlobalMouseMove);
    document.addEventListener('mouseup', handleGlobalMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleGlobalMouseMove);
      document.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [dragging, onMoveNote, canvasTransform.scale]);

  const handleEditStart = (note: Note) => {
    setEditingNote(note.id);
    setEditContent(note.content);
  };

  const handleEditSave = (noteId: string) => {
    onUpdateNote(noteId, editContent);
    setEditingNote(null);
    setEditContent('');
  };

  const handleEditCancel = () => {
    setEditingNote(null);
    setEditContent('');
  };

  // Drawing event handlers
  const handleDrawingMouseDown = useCallback((e: React.MouseEvent) => {
    if (!isDrawingMode || !onAddDrawing) return;

    e.stopPropagation();
    e.preventDefault();

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Convert screen coordinates to canvas coordinates
    const canvasX = (x - canvasTransform.offsetX) / canvasTransform.scale;
    const canvasY = (y - canvasTransform.offsetY) / canvasTransform.scale;

    setIsDrawing(true);
    setDrawingStartPos({ x: canvasX, y: canvasY });
    setCurrentStroke([{ x: canvasX, y: canvasY }]);
  }, [isDrawingMode, onAddDrawing, canvasTransform]);

  const handleDrawingMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDrawing || !isDrawingMode) return;

    e.preventDefault();

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Convert screen coordinates to canvas coordinates
    const canvasX = (x - canvasTransform.offsetX) / canvasTransform.scale;
    const canvasY = (y - canvasTransform.offsetY) / canvasTransform.scale;

    // Optimize drawing by only adding points if they're far enough apart
    const lastPoint = currentStroke[currentStroke.length - 1];
    const distance = Math.sqrt((canvasX - lastPoint.x) ** 2 + (canvasY - lastPoint.y) ** 2);

    if (distance > 2) { // Minimum distance to prevent excessive points
      const newPoints = [...currentStroke, { x: canvasX, y: canvasY }];

      // Check memory limits before adding more points
      if (newPoints.length > 1000) {
        // Optimize points if we have too many
        const optimizedPoints = optimizeDrawingPoints(newPoints, 1.5);
        setCurrentStroke(optimizedPoints);
      } else {
        setCurrentStroke(newPoints);
      }
    }
  }, [isDrawing, isDrawingMode, currentStroke, canvasTransform]);

  const handleDrawingMouseUp = useCallback(() => {
    if (!isDrawing || !drawingStartPos || currentStroke.length < 2) {
      setIsDrawing(false);
      setCurrentStroke([]);
      setDrawingStartPos(null);
      return;
    }

    // Optimize the current stroke before adding to session
    const optimizedPoints = optimizeDrawingPoints(currentStroke, 1.0);

    // Create a new stroke with the optimized points
    const newStroke: DrawingStroke = {
      points: optimizedPoints,
      color: '#6b7280', // Default gray color
      strokeWidth: 2
    };

    // Add stroke to the current drawing session
    setDrawingSession(prevSession => {
      if (!prevSession) {
        // Initialize session if this is the first stroke
        return {
          strokes: [newStroke],
          startTime: Date.now(),
          startPosition: { x: drawingStartPos.x, y: drawingStartPos.y }
        };
      } else {
        // Add stroke to existing session
        return {
          ...prevSession,
          strokes: [...prevSession.strokes, newStroke]
        };
      }
    });

    // Reset current stroke state (but keep drawing session active)
    setIsDrawing(false);
    setCurrentStroke([]);
    setDrawingStartPos(null);
  }, [isDrawing, drawingStartPos, currentStroke]);  // Global drawing mouse handlers
  useEffect(() => {
    if (!isDrawing) return;

    const handleGlobalMouseUp = () => {
      handleDrawingMouseUp();
    };

    document.addEventListener('mouseup', handleGlobalMouseUp);

    return () => {
      document.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [isDrawing, handleDrawingMouseUp]);

  const handleTextareaKeyDown = (e: React.KeyboardEvent, noteId: string) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.shiftKey || e.metaKey)) {
      e.preventDefault();
      handleEditSave(noteId);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleEditCancel();
    }
  };

  const handleMouseDown = useCallback((e: React.MouseEvent, note: Note) => {
    e.preventDefault();
    e.stopPropagation();

    setDragOccurred(false); // Reset drag flag
    setDragging({
      id: note.id,
      startX: e.clientX,
      startY: e.clientY,
      initialCanvasX: note.canvasX,
      initialCanvasY: note.canvasY
    });
  }, []);

  const handleNoteClick = useCallback((e: React.MouseEvent, note: Note) => {
    e.stopPropagation();
    // Only seek if no drag occurred and not clicking on buttons
    if (!dragOccurred && !(e.target as HTMLElement).closest('button')) {
      onSeek?.(note.time);
    }
  }, [dragOccurred, onSeek]);

  // Memoize waveform dimensions calculation
  const waveformDimensions = useMemo(() =>
    calculateWaveformDimensions(duration),
    [duration]
  );

  return (
    <div
      className={`absolute inset-0 z-20 ${isDrawingMode ? 'pointer-events-auto cursor-crosshair' : 'pointer-events-none'}`}
      style={{
        pointerEvents: isDrawingMode ? 'auto' : 'none',
        background: isDrawingMode ? 'rgba(59, 130, 246, 0.02)' : 'transparent' // Subtle blue tint when drawing
      }}
      onMouseDown={isDrawingMode ? handleDrawingMouseDown : undefined}
      onMouseMove={isDrawingMode ? handleDrawingMouseMove : undefined}
      onWheel={onWheel}
    >
      {/* Container that applies the same transform as the canvas - much more performant */}
      <div
        className="absolute inset-0"
        style={{
          transform: `translate(${canvasTransform.offsetX}px, ${canvasTransform.offsetY}px) scale(${canvasTransform.scale})`,
          transformOrigin: '0 0',
        }}
      >
        {/* SVG for connecting lines - now uses canvas coordinates directly */}
        <svg
          className="absolute pointer-events-none"
          style={{
            left: '0',
            top: '0',
            width: `${window.innerWidth}px`,
            height: `${waveformDimensions.height}px`,
            zIndex: 15,
          }}
        >
          {/* Render existing drawings */}
          {notes.map((note) => {
            if (note.type === 'drawing' && note.drawing) {
              // Handle both compressed and raw stroke formats
              let strokes: DrawingStroke[] = [];

              if (note.drawing.strokes) {
                // Use raw strokes directly
                strokes = note.drawing.strokes;
              } else if (note.drawing.compressed) {
                // Decompress adaptive compression format using session decompression
                strokes = decompressSession(note.drawing.compressed);
              }

              return (
                <g key={`drawing-${note.id}`}>
                  {strokes.map((stroke, strokeIndex) => {
                    if (stroke.points.length < 2) return null;

                    const pathData = stroke.points.reduce((path, point, index) => {
                      const command = index === 0 ? 'M' : 'L';
                      return path + `${command} ${point.x} ${point.y} `;
                    }, '');

                    return (
                      <path
                        key={strokeIndex}
                        d={pathData}
                        stroke={stroke.color}
                        strokeWidth={stroke.strokeWidth}
                        fill="none"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    );
                  })}
                </g>
              );
            }
            return null;
          })}

          {/* Render current drawing session strokes */}
          {isDrawingMode && drawingSession && drawingSession.strokes.length > 0 && (
            <g key="drawing-session">
              {drawingSession.strokes.map((stroke, strokeIndex) => {
                if (stroke.points.length < 2) return null;

                const pathData = stroke.points.reduce((path, point, index) => {
                  const command = index === 0 ? 'M' : 'L';
                  return path + `${command} ${point.x} ${point.y} `;
                }, '');

                return (
                  <path
                    key={`session-${strokeIndex}`}
                    d={pathData}
                    stroke={stroke.color}
                    strokeWidth={stroke.strokeWidth}
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity="0.9"
                  />
                );
              })}
            </g>
          )}

          {/* Render current drawing stroke while drawing */}
          {isDrawing && currentStroke.length > 1 && (
            <g key="current-drawing">
              {(() => {
                const pathData = currentStroke.reduce((path, point, index) => {
                  const command = index === 0 ? 'M' : 'L';
                  return path + `${command} ${point.x} ${point.y} `;
                }, '');

                return (
                  <path
                    d={pathData}
                    stroke="#6b7280"
                    strokeWidth="2"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity="0.8"
                  />
                );
              })()}
            </g>
          )}

          {/* Render connecting lines and dots for text notes */}
          {notes.map((note) => {
            if (note.type === 'drawing') return null; // Skip drawing notes for connecting lines

            // Calculate the waveform position in canvas space - no screen conversion needed!
            const timeProgress = duration > 0 ? note.time / duration : 0;
            const waveformCanvasY = timeProgress * waveformDimensions.height;

            return (
              <g key={`line-${note.id}`}>
                {/* Connecting line from waveform to note - using canvas coordinates directly */}
                <line
                  x1={waveformDimensions.centerX}
                  y1={waveformCanvasY}
                  x2={note.canvasX}
                  y2={note.canvasY}
                  stroke="#6b7280"
                  strokeWidth="1"
                  strokeDasharray="3,3"
                  opacity="0.5"
                />
                {/* Dot at waveform position */}
                <circle
                  cx={waveformDimensions.centerX}
                  cy={waveformCanvasY}
                  r="4"
                  fill={getColorCode(note.color)}
                  stroke="#1f2937"
                  strokeWidth="2"
                />
              </g>
            );
          })}
        </svg>

        {/* Notes positioned using canvas coordinates directly - CSS handles transform */}
        {notes.map((note) => {
          // Skip drawing notes - they're already rendered in SVG
          if (note.type === 'drawing') return null;

          // Show note labels only when zoomed in enough
          const showNoteLabels = canvasTransform.scale > NOTE_LABEL_HIDE_THRESHOLD;

          return (
            <div key={note.id}>
              {showNoteLabels && editingNote === note.id ? (
                /* Editing mode */
                <div
                  className="absolute pointer-events-auto bg-neutral-800/95 backdrop-blur-sm rounded-lg shadow-2xl border border-neutral-600/50 w-72 z-30"
                  style={{
                    left: `${note.canvasX}px`,
                    top: `${note.canvasY}px`,
                    transform: 'translate(-50%, -50%)',
                  }}
                >
                  <div className="relative h-auto">
                    <textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      onKeyDown={(e) => handleTextareaKeyDown(e, note.id)}
                      className="block w-full field-sizing-content p-3 pr-14 bg-neutral-900/80 text-white text-lg rounded-lg resize-none
                          focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:bg-neutral-900
                          placeholder-neutral-500 leading-relaxed"
                      placeholder="Empty note..."
                      autoFocus
                    />
                    {/* Clean floating action buttons */}
                    <div className="absolute top-2 right-2 flex space-x-1">
                      <button
                        onClick={handleEditCancel}
                        className="p-1 hover:bg-red-600/50 rounded-md text-neutral-300 hover:text-white
                            transition-all duration-200 shadow-sm hover:shadow-md"
                        title="Cancel (Esc)"
                      >
                        <X className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleEditSave(note.id)}
                        className="p-1 hover:bg-green-600/50 rounded-md text-neutral-300 hover:text-white
                            transition-all duration-200 shadow-sm hover:shadow-md"
                        title="Save (Ctrl+Enter)"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                /* Display mode - only show when zoomed in enough */
                showNoteLabels && (
                  <div
                    className="absolute pointer-events-auto group cursor-pointer z-30"
                    style={{
                      left: `${note.canvasX}px`,
                      top: `${note.canvasY}px`,
                      transform: 'translate(-50%, -50%)',
                    }}
                    onMouseDown={(e) => handleMouseDown(e, note)}
                    onClick={(e) => handleNoteClick(e, note)}
                    onWheel={onWheel}
                    title="Click to jump to this timestamp, drag to move"
                  >
                    <div
                      className="bg-neutral-800 rounded-lg shadow-lg border border-neutral-600 p-2 w-60 hover:shadow-xl transition-all"
                      style={{
                        borderLeftColor: getColorCode(note.color),
                        borderLeftWidth: '3px',
                      }}
                    >
                      {/* Header */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2 text-lg text-neutral-400">
                          <Clock className="w-4 h-4" />
                          <span>{formatTime(note.time)}</span>
                        </div>
                        <div className="flex space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => handleEditStart(note)}
                            className="p-1 hover:bg-neutral-600 rounded text-neutral-400 hover:text-white cursor-pointer"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => onDeleteNote(note.id)}
                            className="p-1 hover:bg-red-600 rounded text-neutral-400 hover:text-white cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* Content */}
                      <p
                        className="text-lg text-neutral-200 leading-relaxed whitespace-pre-wrap break-words"
                      >
                        {note.content || 'Empty note'}
                      </p>
                    </div>
                  </div>
                )
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default NotesOverlay;
