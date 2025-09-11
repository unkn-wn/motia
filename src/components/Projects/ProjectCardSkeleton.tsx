import React from 'react';

export const ProjectCardSkeleton: React.FC = () => (
  <li className="list-none animate-pulse">
    <div className="relative rounded-xl ring-1 ring-neutral-800 bg-neutral-900 p-4">
      <div className="h-5 w-40 bg-neutral-800 rounded" />
      <div className="h-4 w-56 bg-neutral-800 rounded mt-3" />
    </div>
  </li>
);

export default ProjectCardSkeleton;
