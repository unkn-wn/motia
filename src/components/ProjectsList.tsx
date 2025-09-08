import React, { Suspense, use } from 'react';
import { useAuth } from '@contexts/objects/FirebaseAuthContextObject';
import { listUserProjects } from '@/lib/db';
import ProjectCard from '@/components/Projects/ProjectCard';
import ProjectCardSkeleton from '@/components/Projects/ProjectCardSkeleton';
import { Navigate } from '@tanstack/react-router';

type Item = { id: string; title: string; updatedAt?: Date | number | null; durationSec?: number | null };

// Simple in-memory cache to stabilize Suspense promises per user
const projectsCache = new Map<string, Promise<Item[]>>();

function getProjectsPromise(uid: string): Promise<Item[]> {
  const cached = projectsCache.get(uid);
  if (cached) return cached;
  const p = listUserProjects(uid).then(rows => {
    const mapped: Item[] = rows.map(r => ({
      id: r.id,
      title: r.meta.title ?? r.meta.audio?.name ?? r.id,
  updatedAt: r.meta.updatedAt ? r.meta.updatedAt.toDate() : null,
  durationSec: r.meta.audio?.durationSec ?? null,
    }));
    mapped.sort((a, b) => ((b.updatedAt ? +new Date(b.updatedAt) : 0) - (a.updatedAt ? +new Date(a.updatedAt) : 0)));
    return mapped;
  });
  projectsCache.set(uid, p);
  return p;
}

const ProjectsList: React.FC = () => {
  const { user, loading } = useAuth();
  if (loading) return (
    <div className="min-h-screen p-6" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <div className="mx-auto max-w-5xl">
        <h1 className="text-2xl font-semibold text-neutral-100 mb-4">Your Projects</h1>
        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <ProjectCardSkeleton key={i} />)}
        </ul>
      </div>
    </div>
  );
  if (!user) return <Navigate to="/" />;

  return (
    <div className="min-h-screen p-6" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <div className="mx-auto max-w-5xl">
        <h1 className="text-2xl font-semibold text-neutral-100 mb-4">Your Projects</h1>
        <Suspense fallback={
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => <ProjectCardSkeleton key={i} />)}
          </ul>
        }>
          <ProjectsGrid uid={user.uid} />
        </Suspense>
      </div>
    </div>
  );
};

const ProjectsGrid: React.FC<{ uid: string }> = ({ uid }) => {
  const items = use(getProjectsPromise(uid));

  if (items.length === 0) {
    return <div className="text-neutral-400">No projects yet.</div>;
  }

  return (
    <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {items.map(p => (
        <ProjectCard key={p.id} id={p.id} title={p.title} updatedAt={p.updatedAt ?? undefined} durationSec={p.durationSec ?? undefined} />
      ))}
    </ul>
  );
};

export default ProjectsList;
