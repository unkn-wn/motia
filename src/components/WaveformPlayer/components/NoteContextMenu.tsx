import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useWaveformContext } from '@contexts/WaveformContext';

export const NoteContextMenu: React.FC = () => {
  const { contextMenu, setContextMenu, setEditingNote, setEditContent, notes, setDeleteConfirmNoteId } = useWaveformContext();
  const ref = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState<'edit' | 'delete' | null>(null);
  // Keep latest hovered action accessible inside event listeners without re-subscribing
  const hoveredRef = useRef<'edit' | 'delete' | null>(null);
  useEffect(() => {
    hoveredRef.current = hovered;
  }, [hovered]);

  // Reset hover state whenever menu opens
  useEffect(() => {
    if (contextMenu.isOpen) {
      setHovered(null);
      hoveredRef.current = null;
    }
  }, [contextMenu.isOpen]);

  const position = useMemo(() => {
    // Keep menu within viewport bounds with small margin
    const margin = 8;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const x = Math.min(Math.max(contextMenu.x, margin), vw - margin);
    const y = Math.min(Math.max(contextMenu.y, margin), vh - margin);
    return { left: x, top: y };
  }, [contextMenu.x, contextMenu.y]);

  useEffect(() => {
    const onClickAway = (e: MouseEvent) => {
      if (!ref.current) return;
      // ignore right-button while menu open; we use it for selection
      if (e.button === 2) return;
      if (!ref.current.contains(e.target as Node)) {
        setContextMenu((m) => ({ ...m, isOpen: false }));
      }
    };
    const onContext = (e: MouseEvent) => {
      if (contextMenu.isOpen) e.preventDefault();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setContextMenu(m => ({ ...m, isOpen: false }));
      }
    };
    if (contextMenu.isOpen) {
      document.addEventListener('mousedown', onClickAway);
      document.addEventListener('contextmenu', onContext);
      document.addEventListener('keydown', onKeyDown);
      // Right-button release selects hovered action
      const onMouseUp = (e: MouseEvent) => {
        if (!contextMenu.isOpen) return;
        if (e.button === 2) {
          const current = hoveredRef.current;
          if (current === 'edit') {
            const note = notes.find(n => n.id === contextMenu.noteId!);
            if (note) {
              setEditingNote(note.id);
              setEditContent(note.content || '');
            }
          } else if (current === 'delete') {
            if (contextMenu.noteId) setDeleteConfirmNoteId(contextMenu.noteId);
          }
        }
        // Always close on mouseup (any button)
        setContextMenu(m => ({ ...m, isOpen: false }));
      };
      document.addEventListener('mouseup', onMouseUp);
      return () => {
        document.removeEventListener('mousedown', onClickAway);
        document.removeEventListener('contextmenu', onContext);
        document.removeEventListener('keydown', onKeyDown);
        document.removeEventListener('mouseup', onMouseUp);
      };
    }
    return () => { };
  }, [contextMenu.isOpen, contextMenu.noteId, setContextMenu, notes, setEditingNote, setEditContent, setDeleteConfirmNoteId]);

  if (!contextMenu.isOpen || !contextMenu.noteId) return null;
  const note = notes.find(n => n.id === contextMenu.noteId);
  if (!note) return null;

  const handleEdit = () => {
    setEditingNote(note.id);
    setEditContent(note.content || '');
    setContextMenu(m => ({ ...m, isOpen: false }));
  };
  const handleDelete = () => {
    setDeleteConfirmNoteId(note.id);
    setContextMenu(m => ({ ...m, isOpen: false }));
  };

  return (
    <div
      ref={ref}
      className="fixed z-50 bg-neutral-800 rounded-md border border-neutral-700 shadow-lg p-1 select-none"
      style={position}
      onContextMenu={(e) => e.preventDefault()}
      onMouseLeave={() => { setHovered(null); hoveredRef.current = null; }}
    >
      <button
        onMouseEnter={() => { setHovered('edit'); hoveredRef.current = 'edit'; }}
        onMouseLeave={() => { setHovered(null); hoveredRef.current = null; }}
        onClick={handleEdit}
        className={`flex items-center w-full gap-2 px-3 py-2 rounded text-neutral-200 ${hovered === 'edit' ? 'bg-neutral-700' : 'hover:bg-neutral-700'}`}
        title="Edit"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" /></svg>
        <span className="text-sm">Edit</span>
      </button>
      <button
        onMouseEnter={() => { setHovered('delete'); hoveredRef.current = 'delete'; }}
        onMouseLeave={() => { setHovered(null); hoveredRef.current = null; }}
        onClick={handleDelete}
        className={`flex items-center w-full gap-2 px-3 py-2 rounded text-red-300 ${hovered === 'delete' ? 'bg-red-700/50' : 'hover:bg-red-700/50'}`}
        title="Delete"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" /></svg>
        <span className="text-sm">Delete</span>
      </button>
    </div>
  );
};
