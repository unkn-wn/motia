import React from 'react';
import { useWaveformContext } from '../contexts/WaveformContext';
import { getColorCode } from '@utils/colorUtils';

export const NoteEditingOverlay: React.FC = () => {
  const {
    editingNote,
    setEditingNote,
    editContent,
    setEditContent,
    notes,
    transform,
    onUpdateNote
  } = useWaveformContext();

  const handleEditSave = () => {
    if (editingNote && onUpdateNote) {
      onUpdateNote(editingNote, editContent);
      setEditingNote(null);
      setEditContent('');
    }
  };

  const handleEditCancel = () => {
    setEditingNote(null);
    setEditContent('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.shiftKey || e.metaKey)) {
      e.preventDefault();
      handleEditSave();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleEditCancel();
    }
  };

  if (!editingNote) return null;

  const editingNoteData = notes.find(n => n.id === editingNote);
  if (!editingNoteData) return null;

  return (
    <div
      className="absolute z-50 bg-neutral-800/95 backdrop-blur-sm rounded-lg shadow-2xl border border-neutral-600/50 w-72"
      style={{
        left: `${editingNoteData.canvasX * transform.scale + transform.offsetX}px`,
        top: `${editingNoteData.canvasY * transform.scale + transform.offsetY}px`,
        transform: 'translate(-50%, -50%)',
        borderLeftColor: getColorCode(editingNoteData.color || 'blue'),
        borderLeftWidth: '3px'
      }}
    >
      <div className="relative h-auto">
        <textarea
          value={editContent}
          onChange={(e) => setEditContent(e.target.value)}
          onKeyDown={handleKeyDown}
          className="block w-full field-sizing-content p-3 pr-14 bg-neutral-900/80 text-white text-lg rounded-lg resize-none
              focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:bg-neutral-900
              placeholder-neutral-500 leading-relaxed"
          placeholder="Empty note..."
          autoFocus
        />
        {/* Clean floating action buttons - matching original */}
        <div className="absolute top-2 right-2 flex space-x-1">
          <button
            onClick={handleEditCancel}
            className="p-1 hover:bg-red-600/50 rounded-md text-neutral-300 hover:text-white
                transition-all duration-200 shadow-sm hover:shadow-md"
            title="Cancel (Esc)"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <button
            onClick={handleEditSave}
            className="p-1 hover:bg-green-600/50 rounded-md text-neutral-300 hover:text-white
                transition-all duration-200 shadow-sm hover:shadow-md"
            title="Save (Ctrl+Enter)"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
};
