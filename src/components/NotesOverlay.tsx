import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Edit3, Trash2, Clock, X, Check } from 'lucide-react';
import { getColorCode } from '../utils/colorUtils';
import { formatTime } from '../utils/timeUtils';
import { calculateWaveformDimensions } from '../utils/canvasUtils';

export interface Note {
  id: string;
  time: number;
  // Canvas-relative coordinates (not screen coordinates)
  canvasX: number;
  canvasY: number;
  content: string;
  color: string;
  createdAt: Date;
}

interface CanvasTransform {
  offsetX: number;
  offsetY: number;
  scale: number;
}

interface NotesOverlayProps {
  notes: Note[];
  onUpdateNote: (id: string, content: string) => void;
  onDeleteNote: (id: string) => void;
  onMoveNote?: (id: string, canvasX: number, canvasY: number) => void;
  onSeek?: (time: number) => void;
  duration?: number;
  canvasTransform?: CanvasTransform;
  onWheel?: (e: React.WheelEvent) => void;
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

  // Zoom threshold below which note labels will be hidden (only dots remain)
  const NOTE_LABEL_HIDE_THRESHOLD = 0.3;

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
    <div className="absolute inset-0 pointer-events-none z-20">
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
          {notes.map((note) => {
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
