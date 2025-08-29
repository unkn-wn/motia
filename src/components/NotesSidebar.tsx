import React from 'react';
import type { Note } from './NotesOverlay';
import { Clock, Trash2, Edit3, Palette } from 'lucide-react';

interface NotesSidebarProps {
  notes: Note[];
  onDeleteNote: (id: string) => void;
  onJumpToTime: (time: number) => void;
  onChangeNoteColor: (id: string, color: string) => void;
}

const NotesSidebar: React.FC<NotesSidebarProps> = ({
  notes,
  onDeleteNote,
  onJumpToTime,
  onChangeNoteColor,
}) => {
  const colors = ['yellow', 'blue', 'green', 'pink', 'purple'];

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const getColorClasses = (color: string) => {
    const colorMap: Record<string, string> = {
      yellow: 'bg-yellow-100 border-yellow-300',
      blue: 'bg-blue-100 border-blue-300',
      green: 'bg-green-100 border-green-300',
      pink: 'bg-pink-100 border-pink-300',
      purple: 'bg-purple-100 border-purple-300',
    };
    return colorMap[color] || colorMap.yellow;
  };

  const sortedNotes = [...notes].sort((a, b) => a.time - b.time);

  return (
    <div className="w-80 bg-white border-l border-gray-200 h-full overflow-y-auto">
      <div className="p-4 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-800 flex items-center space-x-2">
          <Edit3 className="w-5 h-5" />
          <span>Notes ({notes.length})</span>
        </h2>
      </div>

      <div className="p-4 space-y-3">
        {sortedNotes.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
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
                  className="flex items-center space-x-1 text-sm text-gray-600 hover:text-purple-600 transition-colors"
                >
                  <Clock className="w-4 h-4" />
                  <span>{formatTime(note.time)}</span>
                </button>

                <div className="flex items-center space-x-1">
                  <div className="relative group">
                    <button className="p-1 hover:bg-gray-200 rounded transition-colors">
                      <Palette className="w-4 h-4" />
                    </button>
                    <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg p-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
                      <div className="flex space-x-1">
                        {colors.map((color) => (
                          <button
                            key={color}
                            onClick={() => onChangeNoteColor(note.id, color)}
                            className={`w-6 h-6 rounded-full border-2 ${
                              note.color === color ? 'border-gray-800' : 'border-gray-300'
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
                    className="p-1 hover:bg-red-100 text-red-600 rounded transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <p className="text-sm text-gray-700 whitespace-pre-wrap break-words">
                {note.content || 'Empty note'}
              </p>

              <div className="text-xs text-gray-500 mt-2">
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
