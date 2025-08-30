import React from 'react';
import type { Note } from './NotesOverlay';
import { Clock, Trash2, Edit3, Palette, X } from 'lucide-react';

interface NotesSidebarProps {
  notes: Note[];
  onDeleteNote: (id: string) => void;
  onJumpToTime: (time: number) => void;
  onChangeNoteColor: (id: string, color: string) => void;
  onClose?: () => void;
}

const NotesSidebar: React.FC<NotesSidebarProps> = ({
  notes,
  onDeleteNote,
  onJumpToTime,
  onChangeNoteColor,
  onClose,
}) => {
  const colors = ['yellow', 'blue', 'green', 'pink', 'purple'];

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const getColorClasses = (color: string) => {
    const colorMap: Record<string, string> = {
      yellow: 'border-yellow-600 text-yellow-200',
      blue: 'border-blue-600 text-blue-200',
      green: 'border-green-600 text-green-200',
      pink: 'border-pink-600 text-pink-200',
      purple: 'border-purple-600 text-purple-200',
    };
    return colorMap[color] || colorMap.yellow;
  };

  const sortedNotes = [...notes].sort((a, b) => a.time - b.time);

  return (
    <div className="w-80 rounded-xl bg-neutral-900/95 backdrop-blur-sm border-neutral-700 h-5/6 overflow-y-auto shadow-2xl">
      <div className="p-4 bg-neutral-800/50">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-neutral-200 flex items-center space-x-2">
            <Edit3 className="w-5 h-5" />
            <span>Notes ({notes.length})</span>
          </h2>
          {onClose && (
            <button
              onClick={onClose}
              className="p-2 hover:bg-neutral-700 rounded-lg transition-colors text-neutral-400 hover:text-white"
              title="Close notes panel"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      <div className="p-4 space-y-3">
        {sortedNotes.length === 0 ? (
          <div className="text-center py-8 text-neutral-400">
            <Edit3 className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>No notes yet</p>
            <p className="text-sm">Click on the waveform to add notes</p>
          </div>
        ) : (
          sortedNotes.map((note) => (
            <div
              key={note.id}
              className={`border rounded-lg p-3 transition-all hover:shadow-md ${getColorClasses(note.color)}`}
            >
              <div className="flex items-center justify-between mb-2">
                <button
                  onClick={() => onJumpToTime(note.time)}
                  className="flex items-center space-x-1 text-sm hover:text-neutral-100 transition-colors"
                >
                  <Clock className="w-4 h-4" />
                  <span>{formatTime(note.time)}</span>
                </button>

                <div className="flex items-center space-x-1">
                  <div className="relative group">
                    <button className="p-1 hover:bg-neutral-600 rounded transition-colors">
                      <Palette className="w-4 h-4" />
                    </button>
                    <div className="absolute right-0 top-full mt-1 bg-neutral-800 border border-neutral-700 rounded-lg shadow-lg p-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
                      <div className="flex space-x-1">
                        {colors.map((color) => (
                          <button
                            key={color}
                            onClick={() => onChangeNoteColor(note.id, color)}
                            className={`w-6 h-6 rounded-full border-2 hover:ring-1 ${
                              note.color === color ? 'border-neutral-200' : 'border-neutral-500'
                            }`}
                            style={{
                              backgroundColor:
                                color === 'yellow' ? '#fbbf24' :
                                color === 'blue' ? '#3b82f6' :
                                color === 'green' ? '#10b981' :
                                color === 'pink' ? '#ec4899' : '#8b5cf6'
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => onDeleteNote(note.id)}
                    className="p-1 hover:bg-red-600 hover:bg-opacity-50 text-red-400 rounded transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <p className="text-sm whitespace-pre-wrap break-words">
                {note.content || 'Empty note'}
              </p>

              <div className="text-xs text-neutral-500 mt-2">
                {new Date(note.createdAt).toLocaleString()}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default NotesSidebar;
