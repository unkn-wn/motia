import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useWaveformContext } from '@contexts/objects/WaveformContextObject';
import { useAudio } from '@contexts/objects/AudioContextObject';
import { useStoryboard } from '@/features/storyboard/StoryboardContext';
import { cardPositionAt } from '../hooks/frameCanvas';
import { duplicateTime } from '@/features/storyboard/timeline';
import { getColorCode, NOTE_COLORS } from '@utils/colorUtils';

type MenuItem = { key: string; label: string; icon?: React.ReactNode; danger?: boolean; disabled?: boolean; run: () => void; color?: string };

const EditIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" /></svg>
);
const DeleteIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" /></svg>
);

// Right-hold / long-press menu for a note card or a frame card on the canvas.
// Desktop hold gesture: keep the right button down, hover an item, release to choose it.
// Mounted only while open, so playback time updates don't re-render it.
export const NoteContextMenu: React.FC = () => {
  const { contextMenu } = useWaveformContext();
  return contextMenu.isOpen ? <OpenContextMenu /> : null;
};

const OpenContextMenu: React.FC = () => {
  const { contextMenu, setContextMenu, setEditingNote, setEditContent, notes, setDeleteConfirmNoteId, frames, board, orientation, canvasRef, onChangeNoteColor } = useWaveformContext();
  const { currentTime, duration } = useAudio();
  const { openFrameEditor, handleDuplicateFrame, handleUpdateFrame, handleDeleteFrames } = useStoryboard();
  const ref = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  // Keep latest hovered action accessible inside event listeners without re-subscribing
  const hoveredRef = useRef<string | null>(null);
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

  // Then pull it back inside the viewport by its real size (it opens down and to the right of the press)
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.transform = '';
    const r = el.getBoundingClientRect();
    const margin = 8;
    const dx = Math.min(0, window.innerWidth - margin - r.right);
    const dy = Math.min(0, window.innerHeight - margin - r.bottom);
    if (dx || dy) el.style.transform = `translate(${dx}px, ${dy}px)`;
  }, [position]);

  const note = contextMenu.noteId ? notes.find((n) => n.id === contextMenu.noteId) : undefined;
  const frame = contextMenu.frameId ? frames.find((f) => f.id === contextMenu.frameId) : undefined;

  const items = useMemo<MenuItem[]>(() => {
    if (note && note.type !== 'drawing') {
      // The five colours (the only place a note's colour changes), then Edit and Delete
      const colors: MenuItem[] = onChangeNoteColor
        ? NOTE_COLORS.map((c) => ({ key: `color-${c}`, label: c, color: c, disabled: note.color === c, run: () => onChangeNoteColor(note.id, c) }))
        : [];
      return [
        ...colors,
        { key: 'edit', label: 'Edit', icon: EditIcon, run: () => { setEditingNote(note.id); setEditContent(note.content || ''); } },
        { key: 'delete', label: 'Delete', icon: DeleteIcon, danger: true, run: () => setDeleteConfirmNoteId(note.id) },
      ];
    }
    if (!frame) return [];
    const duplicate = () => {
      const time = duplicateTime(frame, currentTime, duration);
      handleDuplicateFrame(frame.id, { time, ...cardPositionAt(canvasRef.current, time, duration, orientation ?? 'vertical', frames, board) }, duration);
    };
    const setStart = () => {
      // A span that would end before its new start is cleared
      const keepEnd = frame.endTime !== undefined && frame.endTime > currentTime;
      handleUpdateFrame(frame.id, keepEnd ? { time: currentTime } : { time: currentTime, endTime: undefined }, 'SetFrameStart');
    };
    return [
      { key: 'open', label: 'Open', run: () => openFrameEditor(frame.id) },
      { key: 'duplicate', label: 'Duplicate', run: duplicate },
      { key: 'start', label: 'Set start to playhead', run: setStart },
      { key: 'end', label: 'Set end to playhead', disabled: currentTime <= frame.time, run: () => handleUpdateFrame(frame.id, { endTime: currentTime }, 'SetFrameEnd') },
      { key: 'clear', label: 'Clear end', disabled: frame.endTime === undefined, run: () => handleUpdateFrame(frame.id, { endTime: undefined }, 'ClearFrameEnd') },
      { key: 'delete', label: 'Delete', icon: DeleteIcon, danger: true, run: () => handleDeleteFrames(new Set([frame.id])) },
    ];
  }, [note, frame, frames, board, orientation, canvasRef, currentTime, duration, setEditingNote, setEditContent, setDeleteConfirmNoteId, openFrameEditor, handleDuplicateFrame, handleUpdateFrame, handleDeleteFrames, onChangeNoteColor]);

  const itemsRef = useRef(items);
  itemsRef.current = items;

  useEffect(() => {
    const onClickAway = (e: MouseEvent | PointerEvent) => {
      if (!ref.current) return;
      // ignore right-button while menu open; we use it for selection
      if ('button' in e && e.button === 2) return;
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
      // Use pointerdown to support touch tap outside
      document.addEventListener('pointerdown', onClickAway as EventListener);
      document.addEventListener('mousedown', onClickAway);
      document.addEventListener('contextmenu', onContext);
      document.addEventListener('keydown', onKeyDown);
      // Right-button release selects hovered action
      const onMouseUp = (e: MouseEvent) => {
        if (!contextMenu.isOpen) return;
        // Only handle the special right-button hover-select flow here
        if (e.button === 2) {
          const item = itemsRef.current.find((i) => i.key === hoveredRef.current);
          if (item && !item.disabled) item.run();
          // Close after right-button selection
          setContextMenu(m => ({ ...m, isOpen: false }));
        }
      };
      document.addEventListener('mouseup', onMouseUp);
      return () => {
        document.removeEventListener('pointerdown', onClickAway as EventListener);
        document.removeEventListener('mousedown', onClickAway);
        document.removeEventListener('contextmenu', onContext);
        document.removeEventListener('keydown', onKeyDown);
        document.removeEventListener('mouseup', onMouseUp);
      };
    }
    return () => { };
  }, [contextMenu.isOpen, setContextMenu]);

  if (!contextMenu.isOpen || items.length === 0) return null;

  const hover = (key: string | null) => { setHovered(key); hoveredRef.current = key; };

  return (
    <div
      ref={ref}
      className="fixed z-50 bg-neutral-800 rounded-md border border-neutral-700 shadow-lg p-1 select-none"
      style={position}
      role="menu"
      tabIndex={-1}
      onContextMenu={(e) => e.preventDefault()}
      onMouseLeave={() => hover(null)}
    >
      {items.some((i) => i.color) ? (
        <div className="flex items-center gap-1 px-2 py-1.5" role="group" aria-label="Colour">
          {items
            .filter((i) => i.color)
            .map((item) => (
              <button
                key={item.key}
                type="button"
                role="menuitemradio"
                aria-checked={item.disabled}
                aria-label={item.label}
                title={item.label}
                onMouseEnter={() => hover(item.key)}
                onMouseLeave={() => hover(null)}
                onClick={() => {
                  if (!item.disabled) item.run();
                  setContextMenu((m) => ({ ...m, isOpen: false }));
                }}
                className={`h-6 w-6 grid place-items-center rounded-full cursor-pointer ${hovered === item.key || item.disabled ? 'ring-2 ring-neutral-300' : ''}`}
              >
                <span className="h-4 w-4 rounded-full" style={{ backgroundColor: getColorCode(item.color!) }} />
              </button>
            ))}
        </div>
      ) : null}
      {items.filter((i) => !i.color).map((item) => {
        const active = hovered === item.key && !item.disabled;
        const tone = item.danger
          ? `text-red-300 ${active ? 'bg-red-700/50' : 'hover:bg-red-700/50'}`
          : `text-neutral-200 ${active ? 'bg-neutral-700' : 'hover:bg-neutral-700'}`;
        return (
          <button
            key={item.key}
            onMouseEnter={() => hover(item.key)}
            onMouseLeave={() => hover(null)}
            onClick={() => {
              item.run();
              setContextMenu(m => ({ ...m, isOpen: false }));
            }}
            disabled={item.disabled}
            className={`flex items-center w-full gap-2 px-3 py-2 rounded ${item.disabled ? 'text-neutral-500 cursor-default' : tone}`}
            title={item.label}
            role="menuitem"
            type="button"
          >
            {item.icon}
            <span className="text-sm">{item.label}</span>
          </button>
        );
      })}
    </div>
  );
};
