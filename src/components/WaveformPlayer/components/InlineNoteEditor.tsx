import React, { useEffect, useMemo, useRef } from 'react';
import { useWaveformContext } from '@contexts/objects/WaveformContextObject';
import { isNoteEditSubmitCombo, isNoteEditCancelKey, getPreferences } from '@utils/shortcutsUtils';

export const InlineNoteEditor: React.FC = () => {
  const { editingNote, setEditingNote, editContent, setEditContent, notes, transform, onUpdateNote, canvasRef } = useWaveformContext();
  const boxRef = useRef<HTMLTextAreaElement>(null);

  const pos = useMemo(() => {
    if (!editingNote) return null;
    const note = notes.find(n => n.id === editingNote);
    if (!note) return null;
    const rectW = canvasRef.current?.getBoundingClientRect().width ?? 0;
    // Match canvas render mapping: screenX = rect.width/2 + offsetX + scale * worldX
    const left = rectW / 2 + transform.offsetX + note.canvasX * transform.scale;
    const top = note.canvasY * transform.scale + transform.offsetY;
    return { left, top };
  }, [editingNote, notes, transform, canvasRef]);

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
  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (isNoteEditCancelKey(e)) { e.preventDefault(); cancel(); return; }
    if (e.key === 'Enter') {
      const behavior = getPreferences().editorEnterBehavior;
      // newline mode: Shift/Ctrl/Cmd+Enter saves; Enter inserts newline (default)
      // save mode: Enter saves; Shift+Enter inserts newline
      if (behavior === 'save') {
        if (e.shiftKey) {
          // insert newline
          e.preventDefault();
          const el = e.currentTarget;
          const { selectionStart, selectionEnd } = el;
          const newVal = editContent.slice(0, selectionStart) + '\n' + editContent.slice(selectionEnd);
          setEditContent(newVal);
          // restore caret after state update next tick
          setTimeout(() => {
            el.selectionStart = el.selectionEnd = selectionStart + 1;
          }, 0);
        } else if (!e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          save();
        } else {
          // ctrl/cmd+enter: treat as save as well
          e.preventDefault();
          save();
        }
        return;
      }
      // newline behavior (default)
      if (isNoteEditSubmitCombo(e)) { e.preventDefault(); save(); }
      // else allow default newline
    }
  };

  return (
    <div
      className="absolute z-40"
      style={{ left: pos.left, top: pos.top, transform: 'translate(-4px, -4px)' }}
      data-inline-editor="true"
    >
      <div className="relative shadow-lg">
        <textarea
          ref={boxRef}
          value={editContent}
          onChange={(e) => setEditContent(e.target.value)}
          onKeyDown={onKeyDown}
          className="w-72 field-sizing-content bg-neutral-800 text-neutral-100 rounded-md p-3 pr-14 outline-none ring-1 ring-neutral-600 focus:ring-blue-500/40"
          placeholder="Edit note..."
        />
        <div className="absolute top-2 right-2 flex gap-1">
          <button onClick={cancel} title="Cancel (Esc)" className="p-1 rounded hover:bg-red-600/60 text-neutral-300">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
          <button onClick={save} title={getPreferences().editorEnterBehavior === 'save' ? 'Save (Enter)' : 'Save (Shift/Ctrl/⌘+Enter)'} className="p-1 rounded hover:bg-green-600/60 text-neutral-300">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7" /></svg>
          </button>
        </div>
      </div>
    </div>
  );
};
