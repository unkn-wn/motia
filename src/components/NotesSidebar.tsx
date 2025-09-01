import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import type { Note } from '../types';
import { Clock, Trash2, Edit3, Palette, X, Check } from 'lucide-react';
import { formatTime } from '../utils/timeUtils';
import { getColorClasses } from '../utils/colorUtils';
import { sortNotesByTime, findActiveNote } from '../utils/notesUtils';

interface NotesSidebarProps {
  notes: Note[];
  onDeleteNote: (id: string) => void;
  onJumpToTime: (time: number) => void;
  onChangeNoteColor: (id: string, color: string) => void;
  onUpdateNote: (id: string, content: string) => void;
  currentTime?: number;
  isPlaying?: boolean;
}

const NotesSidebar: React.FC<NotesSidebarProps> = ({
  notes,
  onDeleteNote,
  onJumpToTime,
  onChangeNoteColor,
  onUpdateNote,
  currentTime = 0,
  isPlaying = false,
}) => {
  const sidebarRef = useRef<HTMLDivElement>(null);
  const activeNoteRef = useRef<HTMLDivElement>(null);

  // Editing state
  const [editingNote, setEditingNote] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');

  const colors = ['yellow', 'blue', 'green', 'pink', 'purple'];

  const sortedNotes = useMemo(() =>
    sortNotesByTime(notes.filter(note => note.type !== 'drawing')), // Filter out drawings from sidebar
    [notes]
  );

  const activeNote = useMemo(() =>
    findActiveNote(notes.filter(note => note.type !== 'drawing'), currentTime), // Only find active text notes
    [notes, currentTime]
  );

  // Editing handlers
  const handleEditStart = useCallback((note: Note) => {
    setEditingNote(note.id);
    setEditContent(note.content);
  }, []);

  const handleEditSave = useCallback((noteId: string) => {
    onUpdateNote(noteId, editContent);
    setEditingNote(null);
    setEditContent('');
  }, [onUpdateNote, editContent]);

  const handleEditCancel = useCallback(() => {
    setEditingNote(null);
    setEditContent('');
  }, []);

  const handleTextareaKeyDown = useCallback((e: React.KeyboardEvent, noteId: string) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.shiftKey || e.metaKey)) {
      e.preventDefault();
      handleEditSave(noteId);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleEditCancel();
    }
  }, [handleEditSave, handleEditCancel]);

  const handleDoubleClick = useCallback((note: Note) => {
    handleEditStart(note);
  }, [handleEditStart]);

  // Auto-scroll to active note during playback
  useEffect(() => {
    if (isPlaying && activeNote && activeNoteRef.current && sidebarRef.current) {
      activeNoteRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }, [isPlaying, activeNote?.id]);

  return (
    <div
      ref={sidebarRef}
      className="w-80 rounded-xl bg-neutral-900/95 backdrop-blur-sm border-neutral-700 h-5/6 overflow-y-auto shadow-2xl"
    >
      <div className="p-4 space-y-3">
        {sortedNotes.length === 0 ? (
          <div className="text-center py-8 text-neutral-400">
            <Edit3 className="w-8 h-8 mx-auto mb-3 opacity-50" />
            <p>No notes yet</p>
            <p className="text-sm">Press 'N' or the plus to add a note!</p>
          </div>
        ) : (
          sortedNotes.map((note) => {
            const isActiveNote = activeNote?.id === note.id;
            return (
              <div
                key={note.id}
                ref={isActiveNote ? activeNoteRef : null}
                className={`border rounded-lg p-2 transition-all hover:shadow-md text-neutral-200 ${getColorClasses(note.color)} ${
                  isActiveNote && isPlaying ? 'ring-2 ring-white/60 shadow-lg bg-neutral-800/50' : ''
                }`}
              >
              <div className="flex items-center justify-between mb-1">
                <button
                  onClick={() => onJumpToTime(note.time)}
                  className="flex items-center space-x-1 text-sm hover:text-neutral-100 cursor-pointer transition-colors"
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
                            className={`w-6 h-6 rounded-full border-2 hover:ring-1 cursor-pointer ${
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
                    className="p-1 hover:bg-red-600/50 hover:bg-opacity-50 text-red-400 rounded cursor-pointer transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Note content - editable on double click */}
              {editingNote === note.id ? (
                /* Editing mode */
                <div className="relative mb-2">
                  <textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    onKeyDown={(e) => handleTextareaKeyDown(e, note.id)}
                    className="w-full field-sizing-content p-2 pr-12 bg-neutral-900/80 text-white text-sm rounded border border-neutral-600
                              focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:bg-neutral-900
                              placeholder-neutral-500 leading-relaxed resize-none"
                    placeholder="Empty note..."
                    autoFocus
                  />
                  {/* Action buttons */}
                  <div className="absolute top-2 right-2 flex space-x-1">
                    <button
                      onClick={handleEditCancel}
                      className="p-1 hover:bg-red-600/50 rounded text-neutral-300 hover:text-white
                                transition-all duration-200"
                      title="Cancel (Esc)"
                    >
                      <X className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => handleEditSave(note.id)}
                      className="p-1 hover:bg-green-600/50 rounded text-neutral-300 hover:text-white
                                transition-all duration-200"
                      title="Save (Ctrl+Enter)"
                    >
                      <Check className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ) : (
                /* Display mode */
                <p
                  className="text-sm whitespace-pre-wrap break-words cursor-pointer hover:bg-neutral-800/30 p-1 rounded transition-colors"
                  onDoubleClick={() => handleDoubleClick(note)}
                  title="Double-click to edit"
                >
                  {note.content || 'Empty note'}
                </p>
              )}

              <div className="text-xs text-neutral-500 mt-2">
                {new Date(note.createdAt).toLocaleString()}
              </div>
            </div>
          );
          })
        )}
      </div>
    </div>
  );
};

export default NotesSidebar;
