import React, { Suspense, use, useState, useCallback } from 'react';
import { useAuth } from '@contexts/objects/FirebaseAuthContextObject';
import { createProject, listUserProjects } from '@/lib/db';
import ProjectCard from '@/components/Projects/ProjectCard';
import ProjectCardSkeleton from '@/components/Projects/ProjectCardSkeleton';
import { Navigate, useNavigate } from '@tanstack/react-router';
import ProfileModal from '@/components/ProfileModal';
import SignInSaveBanner from '@/components/SignInSaveBanner';
import { UserIcon } from '@/assets/icons';
import FileDropzone from '@/components/FileDropzone';
import { saveLocalAudio } from '@/lib/localAudio';

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
  const navigate = useNavigate();
  const [profileOpen, setProfileOpen] = useState(false);
  const openProfile = useCallback(() => setProfileOpen(true), []);
  const [uploading, setUploading] = useState(false);
  const handleUpload = useCallback(async (file: File) => {
    if (!user) return;
    setUploading(true);
    try {
      const pid = await createProject(user.uid, {
        audio: { name: file.name, size: file.size, type: file.type },
      });
      await saveLocalAudio(pid, file);
      navigate({ to: '/project/$projectId', params: { projectId: pid } });
    } finally {
      setUploading(false);
    }
  }, [user, navigate]);
  if (loading) return (
    <FileDropzone onFileSelect={handleUpload} isLoading={uploading}>
      <div className="min-h-screen p-6" style={{ backgroundColor: 'var(--bg-primary)' }}>
        <div className="mx-auto max-w-5xl">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-2xl font-semibold text-neutral-100">Your Projects</h1>
            <button
              onClick={openProfile}
              className="group cursor-pointer bg-neutral-800 hover:bg-neutral-700 text-white rounded-full p-2.5 shadow-md transition-all duration-300"
              title="Account"
            >
              <UserIcon className="w-5 h-5" />
            </button>
          </div>
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => <ProjectCardSkeleton key={i} />)}
          </ul>
        </div>
        <ProfileModal open={profileOpen} onClose={() => setProfileOpen(false)} />
      </div>
    </FileDropzone>
  );
  if (!user) return <Navigate to="/" />;
  if (user.isAnonymous) {
    return (
      <div className="min-h-screen p-6" style={{ backgroundColor: 'var(--bg-primary)' }}>
        <SignInSaveBanner />
        <div className="mx-auto max-w-2xl pt-16">
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/70 p-6 text-center">
            <p className="mt-2 text-neutral-400">Please sign in or create an account to view and manage your projects.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <FileDropzone onFileSelect={handleUpload} isLoading={uploading}>
      <div className="min-h-screen p-6" style={{ backgroundColor: 'var(--bg-primary)' }}>
        <div className="mx-auto max-w-5xl">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-2xl font-semibold text-neutral-100">Your Projects</h1>
            <button
              onClick={openProfile}
              className="group cursor-pointer bg-neutral-800 hover:bg-neutral-700 text-white rounded-full p-2.5 shadow-md transition-all duration-300"
              title="Account"
            >
              <UserIcon className="w-5 h-5" />
            </button>
          </div>
          <Suspense fallback={
            <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => <ProjectCardSkeleton key={i} />)}
            </ul>
          }>
            <ProjectsGrid uid={user.uid} onUpload={handleUpload} uploading={uploading} />
          </Suspense>
        </div>
        <ProfileModal open={profileOpen} onClose={() => setProfileOpen(false)} />
      </div>
    </FileDropzone>
  );
};

const ProjectsGrid: React.FC<{ uid: string; onUpload: (file: File) => void; uploading: boolean }> = ({ uid, onUpload, uploading }) => {
  const items = use(getProjectsPromise(uid));

  if (items.length === 0) {
    return (
      <div className="grid min-h-[calc(100vh-8rem)] place-items-center text-neutral-400">
        <div className="text-center">
          <div className="mb-4 text-sm font-mono">No projects yet</div>
          <FileDropzone onFileSelect={onUpload} isLoading={uploading} />
        </div>
      </div>
    );
  }

  return (
    <>
      <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {items.map(p => (
          <ProjectCard key={p.id} id={p.id} title={p.title} updatedAt={p.updatedAt ?? undefined} durationSec={p.durationSec ?? undefined} />
        ))}
      </ul>
      {/* Sticky bottom uploader (hover- and focus-reveal) */}
      <div className="fixed bottom-0 left-0 right-0 z-40 flex justify-center pointer-events-none">
        <div className="pointer-events-auto group">
          <div className="translate-y-[72%] group-hover:translate-y-[30%] group-focus-within:translate-y-[30%] transition-transform duration-300 ease-out">
            <FileDropzone onFileSelect={onUpload} isLoading={uploading} />
          </div>
        </div>
      </div>
    </>
  );
};

export default ProjectsList;
