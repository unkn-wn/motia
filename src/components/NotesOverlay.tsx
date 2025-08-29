import React, { useState } from 'react';
import { Edit3, Trash2, Clock } from 'lucide-react';

export interface Note {
  id: string;
  time: number;
  x: number;
  y: number;
  content: string;
  color: string;
  createdAt: Date;
}

interface NotesOverlayProps {
  notes: Note[];
  onUpdateNote: (id: string, content: string) => void;
  onDeleteNote: (id: string) => void;
  containerWidth: number;
}

const NotesOverlay: React.FC<NotesOverlayProps> = ({
  notes,
  onUpdateNote,
  onDeleteNote,
  containerWidth,
}) => {
  const [editingNote, setEditingNote] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');

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

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const getColorClasses = (color: string) => {
    const colorMap: Record<string, string> = {
      yellow: 'bg-yellow-200 border-yellow-400 text-yellow-800',
      blue: 'bg-blue-200 border-blue-400 text-blue-800',
      green: 'bg-green-200 border-green-400 text-green-800',
      pink: 'bg-pink-200 border-pink-400 text-pink-800',
      purple: 'bg-purple-200 border-purple-400 text-purple-800',
    };
    return colorMap[color] || colorMap.yellow;
  };

  return (
    <div className="absolute inset-0 pointer-events-none">
      {notes.map((note) => (
        <div
          key={note.id}
          className="absolute pointer-events-auto"
          style={{
            left: `${(note.x / containerWidth) * 100}%`,
            top: `${note.y}px`,
            transform: 'translate(-50%, -100%)',
          }}
        >
          {editingNote === note.id ? (
            <div className="bg-white rounded-lg shadow-lg border-2 border-purple-300 p-3 w-64">
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="w-full h-20 p-2 border border-gray-300 rounded resize-none focus:outline-none focus:ring-2 focus:ring-purple-500"
                placeholder="Add your note..."
                autoFocus
              />
              <div className="flex justify-end space-x-2 mt-2">
                <button
                  onClick={handleEditCancel}
                  className="px-3 py-1 text-sm text-gray-600 hover:text-gray-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleEditSave(note.id)}
                  className="px-3 py-1 text-sm bg-purple-600 text-white rounded hover:bg-purple-700 transition-colors"
                >
                  Save
                </button>
              </div>
            </div>
          ) : (
            <div className={`rounded-lg border-2 p-3 w-64 shadow-lg ${getColorClasses(note.color)}`}>
              {/* Note indicator dot */}
              <div
                className="absolute w-3 h-3 rounded-full border-2 border-white shadow-md"
                style={{
                  left: '50%',
                  bottom: '-6px',
                  transform: 'translateX(-50%)',
                  backgroundColor: note.color === 'yellow' ? '#fbbf24' :
                                 note.color === 'blue' ? '#3b82f6' :
                                 note.color === 'green' ? '#10b981' :
                                 note.color === 'pink' ? '#ec4899' : '#8b5cf6'
                }}
              />

              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center space-x-1 text-xs opacity-75">
                  <Clock className="w-3 h-3" />
                  <span>{formatTime(note.time)}</span>
                </div>
                <div className="flex space-x-1">
                  <button
                    onClick={() => handleEditStart(note)}
                    className="p-1 hover:bg-black hover:bg-opacity-10 rounded transition-colors"
                  >
                    <Edit3 className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => onDeleteNote(note.id)}
                    className="p-1 hover:bg-red-500 hover:bg-opacity-20 rounded transition-colors"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>

              <p className="text-sm whitespace-pre-wrap break-words">
                {note.content || 'Click to add note...'}
              </p>
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export default NotesOverlay;
