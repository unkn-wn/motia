import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { AudioLinesIcon, Trash2Icon } from '@/assets/icons';

export interface ProjectCardProps {
  id: string;
  title: string;
  updatedAt?: Date | number | null;
  durationSec?: number | null;
  thumbnailUrl?: string;
  onRename?: (id: string, newTitle: string) => void | Promise<void>;
  onDelete?: (id: string) => void;
  isBusy?: boolean;
}

function formatMeta(updatedAt?: Date | number | null, durationSec?: number | null) {
  const bits: string[] = [];
  if (durationSec != null) bits.push(`${Math.round(durationSec)}s`);
  if (updatedAt) bits.push(`Updated ${new Date(updatedAt).toLocaleString()}`);
  return bits.join(' • ');
}

export const ProjectCard: React.FC<ProjectCardProps> = ({ id, title, updatedAt, durationSec, thumbnailUrl, onRename, onDelete, isBusy }) => {
  const MAX_TITLE_LEN = 64;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  useEffect(() => {
    if (!editing) setDraft(title);
  }, [title, editing]);

  const startEditing = useCallback((e: React.MouseEvent) => {
    if (!onRename || isBusy) return;
    e.preventDefault();
    e.stopPropagation();
    setEditing(true);
  }, [onRename, isBusy]);

  const commit = useCallback(async () => {
    if (!onRename) return setEditing(false);
    const next = draft.slice(0, MAX_TITLE_LEN).trim();
    setEditing(false);
    if (next && next !== title) {
      await onRename(id, next);
    }
  }, [onRename, draft, id, title]);

  const cancel = useCallback((e?: React.KeyboardEvent) => {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    setDraft(title);
    setEditing(false);
  }, [title]);

  return (
    <li className="list-none h-full">
      <Link
        to="/project/$projectId"
        params={{ projectId: id }}
        className="group block h-full rounded-xl ring-1 ring-neutral-800 bg-neutral-900/60 hover:bg-neutral-900 transition-colors shadow-sm hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500/40"
        onClick={(e) => { if (editing) { e.preventDefault(); e.stopPropagation(); } }}
      >
        <div className="p-4 h-full flex flex-col justify-between gap-4">
          <div className="min-w-0">
            <div className="mb-2 relative rounded-md overflow-hidden bg-neutral-800 h-32 w-full">
              {thumbnailUrl ? (
                <img src={thumbnailUrl} alt="" className="absolute inset-0 h-full w-full object-cover" loading="lazy" decoding="async" />
              ) : (
                <div className="absolute inset-0 h-full w-full bg-gradient-to-r from-neutral-800 via-neutral-750 to-neutral-900">
                  <AudioLinesIcon className="w-12 h-12 text-neutral-600 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                </div>
              )}
            </div>
            {editing ? (
              <input
                ref={inputRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                maxLength={MAX_TITLE_LEN}
                draggable={false}
                onPointerDownCapture={(e) => e.stopPropagation()}
                onMouseDownCapture={(e) => e.stopPropagation()}
                onDragStart={(e) => { e.preventDefault(); e.stopPropagation(); }}
                onBlur={commit}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); commit(); }
                  if (e.key === 'Escape') cancel(e);
                }}
                className="w-full bg-neutral-800 text-neutral-100 font-medium rounded px-2 py-1 border border-neutral-700 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                disabled={isBusy}
              />
            ) : (
              <button
                type="button"
                onClick={startEditing}
                className="text-left w-fit text-neutral-100 font-medium truncate hover:underline decoration-neutral-500/60 cursor-text text-wrap"
                title="Click to rename"
              >
                {title}
              </button>
            )}
            <p className="text-sm text-neutral-400 mt-1 truncate">{formatMeta(updatedAt, durationSec) || ' '}</p>
          </div>
          <div className="flex items-center gap-2 self-end">
            {onDelete && (
              <button
                type="button"
                title="Delete"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete(id); }}
                className="md:opacity-0 md:group-hover:opacity-100 md:transition-opacity p-1 rounded hover:bg-neutral-800 text-neutral-400 hover:text-red-300 cursor-pointer"
              >
                <Trash2Icon className="w-4 h-4" />
              </button>
            )}
            <div className="text-neutral-500 group-hover:text-neutral-300 transition-transform translate-x-0 group-hover:translate-x-0.5" aria-hidden>
              <span>→</span>
            </div>
          </div>
        </div>
      </Link>
    </li>
  );
};

export default ProjectCard;
