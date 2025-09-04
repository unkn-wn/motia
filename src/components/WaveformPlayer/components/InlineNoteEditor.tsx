import React, { useEffect, useMemo, useRef } from 'react';
import { useWaveformContext } from '@contexts/WaveformContext';
import { isNoteEditSubmitCombo, isNoteEditCancelKey } from '@utils/shortcutsUtils';

export const InlineNoteEditor: React.FC = () => {
  const { editingNote, setEditingNote, editContent, setEditContent, notes, transform, onUpdateNote } = useWaveformContext();
  const boxRef = useRef<HTMLTextAreaElement>(null);

  const pos = useMemo(() => {
    if (!editingNote) return null;
    const note = notes.find(n => n.id === editingNote);
    if (!note) return null;
    const left = note.canvasX * transform.scale + transform.offsetX;
    const top = note.canvasY * transform.scale + transform.offsetY;
    return { left, top };
  }, [editingNote, notes, transform]);

  useEffect(() => {
    if (editingNote) {
      setTimeout(() => boxRef.current?.focus(), 0);
    }
  }, [editingNote]);

  if (!editingNote || !pos) return null;

  const save = () => {
    const note = notes.find(n => n.id === editingNote);
    if (note && onUpdateNote) onUpdateNote(note.id, editContent);
    setEditingNote(null);
    setEditContent('');
  };
  const cancel = () => { setEditingNote(null); setEditContent(''); };

  return (
    <div
      className="absolute z-40"
      style={{ left: pos.left, top: pos.top, transform: 'translate(-4px, -4px)' }}
    >
      <div className="relative shadow-lg">
        <textarea
          ref={boxRef}
          value={editContent}
          onChange={(e) => setEditContent(e.target.value)}
          onKeyDown={(e) => { if (isNoteEditSubmitCombo(e)) { e.preventDefault(); save(); } else if (isNoteEditCancelKey(e)) { e.preventDefault(); cancel(); } }}
          className="w-72 field-sizing-content bg-neutral-800 text-neutral-100 rounded-md p-3 pr-14 outline-none ring-1 ring-neutral-600 focus:ring-blue-500/40"
          placeholder="Edit note..."
        />
        <div className="absolute top-2 right-2 flex gap-1">
          <button onClick={cancel} title="Cancel (Esc)" className="p-1 rounded hover:bg-red-600/60 text-neutral-300">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
          <button onClick={save} title="Save (Shift/Ctrl/⌘+Enter)" className="p-1 rounded hover:bg-green-600/60 text-neutral-300">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7" /></svg>
          </button>
        </div>
      </div>
    </div>
  );
};
