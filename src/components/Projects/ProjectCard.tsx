import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Trash2Icon } from '@/assets/icons';

export interface ProjectCardProps {
  id: string;
  title: string;
  updatedAt?: Date | number | null;
  durationSec?: number | null;
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

export const ProjectCard: React.FC<ProjectCardProps> = ({ id, title, updatedAt, durationSec, onRename, onDelete, isBusy }) => {
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
    const next = draft.trim();
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
    <li className="list-none">
      <Link
        to="/project/$projectId"
        params={{ projectId: id }}
        className="group block rounded-xl ring-1 ring-neutral-800 bg-neutral-900/60 hover:bg-neutral-900 transition-colors shadow-sm hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500/40"
        onClick={(e) => { if (editing) { e.preventDefault(); e.stopPropagation(); } }}
      >
        <div className="p-4 flex items-start justify-between gap-4">
          <div className="min-w-0">
            {editing ? (
              <input
                ref={inputRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onDrag={(e) => e.stopPropagation()}
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
                className="text-left w-fit text-neutral-100 font-medium truncate hover:underline decoration-neutral-500/60 cursor-text "
                title="Click to rename"
              >
                {title}
              </button>
            )}
            <p className="text-sm text-neutral-400 mt-1 truncate">{formatMeta(updatedAt, durationSec) || ' '}</p>
          </div>
          <div className="flex items-center gap-2">
            {onDelete && (
              <button
                type="button"
                title="Delete"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete(id); }}
                className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-neutral-800 text-neutral-400 hover:text-red-300 cursor-pointer"
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
