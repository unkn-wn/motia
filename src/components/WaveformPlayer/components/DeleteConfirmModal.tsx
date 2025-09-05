import React, { useEffect } from 'react';
import { useWaveformContext } from '@contexts/WaveformContext';

export const DeleteConfirmModal: React.FC = () => {
  const { deleteConfirmNoteId, setDeleteConfirmNoteId, onDeleteNote } = useWaveformContext();

  const cancel = () => setDeleteConfirmNoteId(null);
  const confirm = () => { if (onDeleteNote && deleteConfirmNoteId) onDeleteNote(deleteConfirmNoteId); cancel(); };

  // Always call hooks in the same order; gate effect logic by state
  useEffect(() => {
    if (!deleteConfirmNoteId) return; // no modal open, no listeners

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        cancel();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [deleteConfirmNoteId]);

  if (!deleteConfirmNoteId) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-[320px] max-w-[90vw] bg-neutral-900 border border-neutral-700 rounded-lg shadow-xl p-4">
        <div className="text-neutral-100 mb-4">Delete this note?</div>
        <div className="flex justify-end gap-2">
          <button onClick={cancel} className="px-3 py-1 rounded bg-neutral-800 border border-neutral-700 text-neutral-300 hover:bg-neutral-700">Cancel</button>
          <button onClick={confirm} className="px-3 py-1 rounded bg-red-600 text-white hover:bg-red-500">Delete</button>
        </div>
      </div>
    </div>
  );
};
