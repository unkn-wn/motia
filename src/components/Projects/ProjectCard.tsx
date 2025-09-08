import React from 'react';
import { Link } from '@tanstack/react-router';

export interface ProjectCardProps {
  id: string;
  title: string;
  updatedAt?: Date | number | null;
  durationSec?: number | null;
}

function formatMeta(updatedAt?: Date | number | null, durationSec?: number | null) {
  const bits: string[] = [];
  if (durationSec != null) bits.push(`${Math.round(durationSec)}s`);
  if (updatedAt) bits.push(`Updated ${new Date(updatedAt).toLocaleString()}`);
  return bits.join(' • ');
}

export const ProjectCard: React.FC<ProjectCardProps> = ({ id, title, updatedAt, durationSec }) => {
  return (
    <li className="list-none">
      <Link
        to="/project/$projectId"
        params={{ projectId: id }}
        className="group block rounded-xl ring-1 ring-neutral-800 bg-neutral-900/60 hover:bg-neutral-900 transition-colors shadow-sm hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500/40"
      >
        <div className="p-4 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h3 className="text-neutral-100 font-medium truncate">{title}</h3>
            <p className="text-sm text-neutral-400 mt-1 truncate">{formatMeta(updatedAt, durationSec) || ' '}</p>
          </div>
          <div className="text-neutral-500 group-hover:text-neutral-300 transition-transform translate-x-0 group-hover:translate-x-0.5" aria-hidden>
            <span>→</span>
          </div>
        </div>
      </Link>
    </li>
  );
};

export default ProjectCard;
