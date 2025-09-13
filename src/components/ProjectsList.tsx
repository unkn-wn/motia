import React, { Suspense, use, useState, useCallback, useRef } from 'react';
import { useAuth } from '@contexts/objects/FirebaseAuthContextObject';
import { createProject, listUserProjects, renameProject, deleteProject } from '@/lib/db';
import ProjectCard from '@/components/Projects/ProjectCard';
import ProjectCardSkeleton from '@/components/Projects/ProjectCardSkeleton';
import { Navigate, useNavigate } from '@tanstack/react-router';
import ProfileModal from '@/components/ProfileModal';
import TopBanner, { SignInBannerOption } from '@/components/TopBanner';
import { UserIcon } from '@/assets/icons';
import FileDropzone from '@/components/FileDropzone';
import FileUploader from '@/components/FileUploader';
import { saveLocalAudio, deleteLocalAudio } from '@/lib/localAudio';
import Modal from '@/components/Modal';

type Item = { id: string; title: string; updatedAt?: Date | number | null; durationSec?: number | null; thumbnail?: string | null };

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
      thumbnail: r.meta.thumbnail ?? null,
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
  const [busy, setBusy] = useState<string | null>(null); // projectId under action
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);
  const invalidate = useCallback((uid: string) => { projectsCache.delete(uid); }, []);
  // If we ever enter here from an external navigation, ensure playing audio is paused
  // (Primary pause happens in Home before navigate.)
  // No-op here otherwise to avoid coupling contexts.

  // Invalidate once per mount prior to Suspense resolution
  const invalidatedRef = useRef(false);
  if (user && !invalidatedRef.current) {
    projectsCache.delete(user.uid);
    invalidatedRef.current = true;
  }

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

  const handleRename = useCallback(async (id: string, title: string) => {
    if (!user) return;
    setBusy(id);
    try {
      await renameProject(user.uid, id, title);
      invalidate(user.uid);
    } finally {
      setBusy(null);
    }
  }, [user, invalidate]);

  const handleDelete = useCallback((id: string, title: string) => {
    setDeleteTarget({ id, title });
  }, []);

  const base = import.meta.env.BASE_URL || '/';
  if (loading) return (
    <div className="min-h-screen p-6" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <div className="mx-auto max-w-5xl">
        <div className="flex items-center justify-between mb-4">
          <img src={`${base}motia-logo-light.svg`} alt="motia" className="h-6 w-auto opacity-90 select-none" />
          <button
            onClick={openProfile}
            className="group cursor-pointer hover:bg-neutral-800 ring-1 ring-neutral-800 text-white rounded-full p-2.5 shadow-md transition-all duration-300"
            title="Account"
          >
            <UserIcon className="w-5 h-5" />
          </button>
        </div>
        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 auto-rows-fr gap-4">
          {Array.from({ length: 6 }).map((_, i) => <ProjectCardSkeleton key={i} />)}
        </ul>
      </div>
      <ProfileModal open={profileOpen} onClose={() => setProfileOpen(false)} />
    </div>
  );

  if (!user) return <Navigate to="/" />;

  if (user.isAnonymous) {
    return (
      <div className="min-h-screen p-6" style={{ backgroundColor: 'var(--bg-primary)' }}>
        <TopBanner options={[SignInBannerOption({ show: true })]} />
        <div className="mx-auto max-w-2xl pt-16">
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/70 p-6 text-center">
            <p className="mt-2 text-neutral-400">Please sign in or create an account to view and manage your projects.</p>
          </div>
        </div>
      </div>
    );
  }

  // (No session flag needed; we already invalidated once this mount)

  return (
    <FileDropzone onFileSelect={handleUpload} isLoading={uploading}>
      <div className="min-h-screen p-6" style={{ backgroundColor: 'var(--bg-primary)' }}>
        <div className="mx-auto max-w-5xl">
          <div className="flex items-center justify-between mb-4">
            <div className='flex flex-row items-center gap-2'>
              <img src={`${base}motia-logo-light.svg`} alt="motia" className="h-8 w-auto opacity-90 select-none" />
              <h1 className="text-2xl font-semibold tracking-tight text-neutral-100 -translate-y-0.5">motia</h1>
            </div>
            <button
              onClick={openProfile}
              className="group cursor-pointer hover:bg-neutral-800 ring-1 ring-neutral-800 text-white rounded-full p-2.5 shadow-md transition-all duration-300"
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
            <ProjectsGrid uid={user.uid} onUpload={handleUpload} uploading={uploading} onRename={handleRename} onDelete={handleDelete} busyId={busy} />
          </Suspense>
        </div>
        <ProfileModal open={profileOpen} onClose={() => setProfileOpen(false)} />
        {/* Delete Modal */}
        <DeleteModal
          open={!!deleteTarget}
          title={deleteTarget?.title ?? ''}
          onClose={() => setDeleteTarget(null)}
          onConfirm={async () => {
            if (!user || !deleteTarget) return;
            setBusy(deleteTarget.id);
            try {
              await deleteProject(user.uid, deleteTarget.id);
              try { await deleteLocalAudio(deleteTarget.id); } catch { /* ignore */ }
              invalidate(user.uid);
              setDeleteTarget(null);
            } finally {
              setBusy(null);
            }
          }}
        />
      </div>
    </FileDropzone>
  );
};

const ProjectsGrid: React.FC<{ uid: string; onUpload: (file: File) => void; uploading: boolean; onRename: (id: string, title: string) => void; onDelete: (id: string, title: string) => void; busyId: string | null }> = ({ uid, onUpload, uploading, onRename, onDelete, busyId }) => {
  const items = use(getProjectsPromise(uid));

  if (items.length === 0) {
    return (
      <div className="grid min-h-[calc(100vh-8rem)] place-items-center text-neutral-400">
        <div className="text-center">
          <div className="mb-4 text-sm font-mono">No projects yet</div>
          <FileUploader onFileSelect={onUpload} isLoading={uploading} />
        </div>
      </div>
    );
  }

  return (
    <>
      <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {items.map(p => (
          <div key={p.id} className="relative h-full">
            {busyId === p.id && (
              <div className="absolute inset-0 z-10 grid place-items-center bg-neutral-900/60 rounded-xl">
                <div className="h-5 w-5 border-2 border-white/80 border-t-transparent rounded-full animate-spin" />
              </div>
            )}
            <ProjectCard
              id={p.id}
              title={p.title}
              updatedAt={p.updatedAt ?? undefined}
              durationSec={p.durationSec ?? undefined}
              thumbnailUrl={p.thumbnail ?? undefined}
              onRename={onRename}
              onDelete={(id) => onDelete(id, p.title)}
              isBusy={busyId === p.id}
            />
          </div>
        ))}
      </ul>
      {/* Sticky bottom uploader (hover- and focus-reveal) */}
      <div className="fixed bottom-0 left-0 right-0 z-40 flex justify-center pointer-events-none">
        <div className="pointer-events-auto group">
          <div className="translate-y-[72%] group-hover:translate-y-[30%] group-focus-within:translate-y-[30%] transition-transform duration-300 ease-out">
            <FileUploader onFileSelect={onUpload} isLoading={uploading} />
          </div>
        </div>
      </div>
    </>
  );
};

export default ProjectsList;

// --- Local modals ---
const DeleteModal: React.FC<{ open: boolean; title: string; onClose: () => void; onConfirm: () => void }> = ({ open, title, onClose, onConfirm }) => {
  return (
    <Modal open={open} onClose={onClose} title="Delete project">
      <p>Are you sure you want to delete “{title}”? This will remove the project and all its notes.</p>
      <div className="mt-4 flex justify-end gap-2">
        <button onClick={onClose} className="px-3 py-1.5 rounded border border-neutral-700 bg-neutral-800 text-neutral-200 hover:bg-neutral-700">Cancel</button>
        <button onClick={onConfirm} className="px-3 py-1.5 rounded border border-red-600/40 bg-red-600/20 text-red-100 hover:bg-red-600/30">Delete</button>
      </div>
    </Modal>
  );
};
