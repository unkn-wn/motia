import React, { useState, useEffect } from 'react';
import { Edit3, Trash2, Clock } from 'lucide-react';

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
}

const NotesOverlay: React.FC<NotesOverlayProps> = ({
  notes,
  onUpdateNote,
  onDeleteNote,
  onMoveNote,
  onSeek,
  duration = 0,
  canvasTransform = { offsetX: 0, offsetY: 0, scale: 1 },
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

  // Helper function to convert canvas coordinates to screen coordinates
  const canvasToScreen = (canvasX: number, canvasY: number) => {
    return {
      screenX: canvasX * canvasTransform.scale + canvasTransform.offsetX,
      screenY: canvasY * canvasTransform.scale + canvasTransform.offsetY,
    };
  };

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

  const getColorCode = (color: string) => {
    const colorMap = {
      yellow: '#eab308',
      blue: '#3b82f6',
      green: '#22c55e',
      pink: '#ec4899',
      purple: '#a855f7'
    };
    return colorMap[color as keyof typeof colorMap] || colorMap.yellow;
  };

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

  const handleMouseDown = (e: React.MouseEvent, note: Note) => {
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
  };

  const handleNoteClick = (e: React.MouseEvent, note: Note) => {
    e.stopPropagation();
    // Only seek if no drag occurred and not clicking on buttons
    if (!dragOccurred && !(e.target as HTMLElement).closest('button')) {
      onSeek?.(note.time);
    }
  };

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  return (
    <div className="absolute inset-0 pointer-events-none z-20">
      {/* SVG for connecting lines - synced with canvas transform */}
      <svg
        className="absolute pointer-events-none"
        style={{
          left: '0',
          top: '0',
          width: '100%',
          height: '100%',
          zIndex: 15,
        }}
      >
        {notes.map((note) => {
          // Calculate the waveform position in canvas space, then convert to screen space
          const timeProgress = duration > 0 ? note.time / duration : 0;
          const waveformHeight = Math.max(window.innerHeight * 3, duration * 100);
          const waveformWidth = 120;

          // Waveform position in canvas space (exactly matching WaveformPlayer calculations)
          const canvasWidth = window.innerWidth;
          const waveformX = (canvasWidth - waveformWidth) / 2; // This matches WaveformPlayer
          const waveformCanvasX = waveformX + waveformWidth / 2; // Center of waveform
          const waveformCanvasY = timeProgress * waveformHeight;

          // Convert canvas coordinates to screen coordinates for rendering
          const waveformScreenPos = canvasToScreen(waveformCanvasX, waveformCanvasY);
          const noteScreenPos = canvasToScreen(note.canvasX, note.canvasY);

          return (
            <g key={`line-${note.id}`}>
              {/* Connecting line from waveform to note */}
              <line
                x1={waveformScreenPos.screenX}
                y1={waveformScreenPos.screenY}
                x2={noteScreenPos.screenX}
                y2={noteScreenPos.screenY}
                stroke="#6b7280"
                strokeWidth="1"
                strokeDasharray="3,3"
                opacity="0.5"
              />
              {/* Dot at waveform position */}
              <circle
                cx={waveformScreenPos.screenX}
                cy={waveformScreenPos.screenY}
                r="4"
                fill={getColorCode(note.color)}
                stroke="#1f2937"
                strokeWidth="2"
              />
            </g>
          );
        })}
      </svg>

      {/* Notes positioned using canvas coordinates converted to screen coordinates */}
      {notes.map((note) => {
        // Convert canvas coordinates to screen coordinates for positioning
        const screenPos = canvasToScreen(note.canvasX, note.canvasY);

        // Show note labels only when zoomed in enough
        const showNoteLabels = canvasTransform.scale > NOTE_LABEL_HIDE_THRESHOLD;

        return (
          <div key={note.id}>
            {showNoteLabels && editingNote === note.id ? (
              /* Editing mode */
              <div
                className="absolute pointer-events-auto bg-neutral-800 rounded-lg shadow-xl border border-neutral-600 p-1 w-60 z-30"
                style={{
                  left: `${screenPos.screenX}px`,
                  top: `${screenPos.screenY}px`,
                  transform: 'translate(-50%, -50%)',
                }}
              >
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  className="w-full h-16 p-2 bg-neutral-900 text-white text-sm rounded resize-none focus:outline-none focus:ring-1 focus:ring-neutral-700"
                  placeholder=""
                  autoFocus
                />
                <div className="flex justify-end space-x-2">
                  <button
                    onClick={handleEditCancel}
                    className="px-2 py-1 text-xs text-neutral-400 hover:text-neutral-200"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleEditSave(note.id)}
                    className="px-2 py-1 text-xs bg-neutral-700 text-white rounded hover:bg-neutral-600"
                  >
                    Save
                  </button>
                </div>
              </div>
            ) : (
              /* Display mode - only show when zoomed in enough */
              showNoteLabels && (
                <div
                  className="absolute pointer-events-auto group cursor-pointer z-30"
                  style={{
                    left: `${screenPos.screenX}px`,
                    top: `${screenPos.screenY}px`,
                    transform: 'translate(-50%, -50%)',
                  }}
                  onMouseDown={(e) => handleMouseDown(e, note)}
                  onClick={(e) => handleNoteClick(e, note)}
                  title="Click to jump to this timestamp, drag to move"
                >
                <div
                  className="bg-neutral-800 rounded-lg shadow-lg border border-neutral-600 p-2 w-52 hover:shadow-xl transition-all"
                  style={{
                    borderLeftColor: getColorCode(note.color),
                    borderLeftWidth: '3px',
                  }}
                >
                  {/* Header */}
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center space-x-1 text-xs text-neutral-400">
                      <Clock className="w-3 h-3" />
                      <span>{formatTime(note.time)}</span>
                    </div>
                    <div className="flex space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => handleEditStart(note)}
                        className="p-1 hover:bg-neutral-600 rounded text-neutral-400 hover:text-white"
                      >
                        <Edit3 className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => onDeleteNote(note.id)}
                        className="p-1 hover:bg-red-600 rounded text-neutral-400 hover:text-white"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>

                  {/* Content */}
                  <p
                    className="text-sm text-neutral-200 leading-relaxed"
                  >
                    {note.content || 'Empty note' }
                  </p>
                </div>
              </div>
              )
            )}
          </div>
        );
      })}
    </div>
  );
};

export default NotesOverlay;
