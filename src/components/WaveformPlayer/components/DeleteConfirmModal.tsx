import React, { useCallback } from 'react';
import { useWaveformContext } from '@contexts/objects/WaveformContextObject';
import Modal from '@/components/Modal';

export const DeleteConfirmModal: React.FC = () => {
  const { deleteConfirmNoteId, setDeleteConfirmNoteId, onDeleteNote } = useWaveformContext();

  const cancel = useCallback(() => setDeleteConfirmNoteId(null), [setDeleteConfirmNoteId]);
  const confirm = () => { if (onDeleteNote && deleteConfirmNoteId) onDeleteNote(deleteConfirmNoteId); cancel(); };

  return (
    <Modal open={!!deleteConfirmNoteId} onClose={cancel} title="Delete this note?">
      <p className="mb-2 text-neutral-300">This action cannot be undone.</p>
      <div className="mt-4 flex justify-end gap-2">
        <button onClick={cancel} className="px-3 py-1 rounded bg-neutral-800 border border-neutral-700 text-neutral-300 hover:bg-neutral-700 cursor-pointer">Cancel</button>
        <button onClick={confirm} className="px-3 py-1 rounded bg-red-600 text-white hover:bg-red-500 cursor-pointer">Delete</button>
      </div>
    </Modal>
  );
};
