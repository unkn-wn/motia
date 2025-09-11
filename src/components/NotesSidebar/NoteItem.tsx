import React, { memo, useCallback, useState } from 'react';
import type { Note } from '../../types/notes';
import { formatTime } from '@utils/timeUtils';
import { isNoteEditSubmitCombo, isNoteEditCancelKey } from '@utils/shortcutsUtils';
import { getColorClasses } from '@utils/colorUtils';
import { getNoteItemActions } from './noteItemActions';
import {
  ClockIcon,
  Trash2Icon,
  PaletteIcon,
  XIcon,
  CheckIcon
} from '@assets/icons';

interface NoteItemProps {
  note: Note;
}

const NoteItem: React.FC<NoteItemProps> = memo(({ note }) => {

  // Local editing state for this specific note
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState('');

  const colors = ['yellow', 'blue', 'green', 'pink', 'purple'];

  // Editing handlers
  const handleEditStart = useCallback(() => {
    setIsEditing(true);
    setEditContent(note.content);
  }, [note.content]);

  const handleEditSave = useCallback(() => {
  const actions = getNoteItemActions();
  if (actions) actions.onUpdateNote(note.id, editContent);
    setIsEditing(false);
    setEditContent('');
  }, [note.id, editContent]);

  const handleEditCancel = useCallback(() => {
    setIsEditing(false);
    setEditContent('');
  }, []);

  const handleTextareaKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (isNoteEditSubmitCombo(e)) {
      e.preventDefault();
      handleEditSave();
    } else if (isNoteEditCancelKey(e)) {
      e.preventDefault();
      handleEditCancel();
    }
  }, [handleEditSave, handleEditCancel]);

  const handleDoubleClick = useCallback(() => {
    handleEditStart();
  }, [handleEditStart]);

  const handleDeleteClick = useCallback(() => {
  const actions = getNoteItemActions();
  if (actions) actions.onDeleteNote(note.id);
  }, [note.id]);

  const handleJumpClick = useCallback(() => {
  const actions = getNoteItemActions();
  if (actions) actions.onJumpToTime(note.time);
  }, [note.time]);

  const handleColorChange = useCallback((color: string) => {
  const actions = getNoteItemActions();
  if (actions) actions.onChangeNoteColor(note.id, color);
  }, [note.id]);

  return (
    <div
      className={`note-item border rounded-lg p-2 transition-all hover:shadow-md text-neutral-200 ${getColorClasses(note.color)}`}
      data-note-id={note.id}
      data-note-time={note.time}
    >
      <div className="flex items-center justify-between mb-1">
        <button
          onClick={handleJumpClick}
          className="flex items-center space-x-1 text-sm hover:text-neutral-100 cursor-pointer transition-colors"
        >
          <ClockIcon className="w-4 h-4" />
          <span>{formatTime(note.time)}</span>
        </button>

        <div className="flex items-center space-x-1">
          <div className="relative group">
            <button className="p-1 hover:bg-neutral-600 rounded transition-colors">
              <PaletteIcon className="w-4 h-4" />
            </button>
            <div className="absolute right-0 top-full mt-1 bg-neutral-800 border border-neutral-700 rounded-lg shadow-lg p-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
              <div className="flex space-x-1">
                {colors.map((color) => (
                  <button
                    key={color}
                    onClick={() => handleColorChange(color)}
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
            onClick={handleDeleteClick}
            className="p-1 hover:bg-red-600/50 hover:bg-opacity-50 text-red-400 rounded cursor-pointer transition-colors"
          >
            <Trash2Icon className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Note content - editable on double click */}
      {isEditing ? (
        /* Editing mode */
        <div className="relative mb-2">
          <textarea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            onKeyDown={handleTextareaKeyDown}
            className="w-full field-sizing-content p-2 pr-12 bg-neutral-900/80 text-white text-sm rounded ring-neutral-600
                      focus:outline-none ring-1 focus:ring-blue-500/50 focus:bg-neutral-900
                      placeholder-neutral-500 leading-relaxed resize-none"
            placeholder="Empty note..."
            autoFocus
          />
          {/* Action buttons */}
          <div className="absolute top-2 right-2 flex space-x-1">
            <button
              onClick={handleEditCancel}
              className="p-1 hover:bg-red-600/50 rounded text-neutral-300 hover:text-white
                        transition-all duration-200 cursor-pointer"
              title="Cancel (Esc)"
            >
              <XIcon className="w-3 h-3" />
            </button>
            <button
              onClick={handleEditSave}
              className="p-1 hover:bg-green-600/50 rounded text-neutral-300 hover:text-white
                        transition-all duration-200 cursor-pointer"
              title="Save (Ctrl+Enter)"
            >
              <CheckIcon className="w-3 h-3" />
            </button>
          </div>
        </div>
      ) : (
        /* Display mode */
        <p
          className="text-sm whitespace-pre-wrap break-words cursor-pointer hover:bg-neutral-800/30 p-1 rounded transition-colors"
          onDoubleClick={handleDoubleClick}
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
}, (prevProps, nextProps) => {
  // Only rerender if the note data actually changes
  // Now we have zero function prop dependencies!
  return (
    prevProps.note.id === nextProps.note.id &&
    prevProps.note.content === nextProps.note.content &&
    prevProps.note.color === nextProps.note.color &&
    prevProps.note.time === nextProps.note.time &&
    prevProps.note.createdAt === nextProps.note.createdAt
  );
});

NoteItem.displayName = 'NoteItem';

export default NoteItem;
