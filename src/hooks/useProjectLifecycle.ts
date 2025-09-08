import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from '@tanstack/react-router';
import { useAuth } from '@contexts/objects/FirebaseAuthContextObject';
import { auth } from '@/lib/firebase';
import { createProject, fetchProjectMeta, fetchProjectNotes } from '@/lib/db';
import { getLocalAudio, saveLocalAudio } from '@/lib/localAudio';
import type { Note } from '@types';
// Autosave is handled by the page to avoid double-instantiation of hooks

export function useProjectLifecycle(opts: {
  setNotes: (notes: Note[]) => void;
  onCurrentTimeChange: (t: number) => void;
}) {
  const { setNotes, onCurrentTimeChange } = opts;
  const navigate = useNavigate();
  const params = useParams({ strict: false }) as { projectId?: string };
  const { user, loading: authLoading, signOut, signInGuest, lastMigratedProjectId, clearMigrationRedirect, migrationBusy } = useAuth();

  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [loadingProject, setLoadingProject] = useState(false);
  const [loadingWaveform, setLoadingWaveform] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);

  // redirect after migration
  useEffect(() => {
    if (user && lastMigratedProjectId) {
      navigate({ to: '/project/$projectId', params: { projectId: lastMigratedProjectId } });
      clearMigrationRedirect?.();
    }
  }, [user, lastMigratedProjectId, navigate, clearMigrationRedirect]);

  const shouldRedirectToProjects = !!(
    user &&
    !params.projectId &&
    // Don't redirect while a migration is ongoing or immediately after it
    !migrationBusy &&
    !lastMigratedProjectId
  );

  // project loader
  useEffect(() => {
    const fromRoute = params.projectId;
    let aborted = false;
    (async () => {
      if (fromRoute && authLoading) return;
      if (!fromRoute) {
        setProjectId(null);
        return;
      }
      if (!user) {
        navigate({ to: '/' });
        return;
      }
      setLoadingProject(true);
      try {
        const meta = await fetchProjectMeta(user.uid, fromRoute);
        if (!meta) {
          if (!aborted) navigate({ to: '/' });
          return;
        }
        const loadedNotes = await fetchProjectNotes(user.uid, fromRoute);
        if (aborted) return;
        setProjectId(fromRoute);
        if (loadedNotes) setNotes(loadedNotes);
        const cached = await getLocalAudio(fromRoute);
        if (!aborted && cached) setAudioFile(cached);
      } finally {
        if (!aborted) setLoadingProject(false);
      }
    })();
    return () => { aborted = true; };
  }, [user, authLoading, params.projectId, navigate, setNotes]);

  const handleFileSelect = useCallback(async (file: File) => {
    setIsLoading(true);
    try {
      await new Promise(r => setTimeout(r, 600));
      let uid = user?.uid ?? null;
      if (!uid) {
        await signInGuest();
        uid = auth.currentUser?.uid ?? null;
      }
      if (!uid) {
        setProjectId(null);
        setAudioFile(file);
        return;
      }
      const pid = await createProject(uid, { audio: { name: file.name, size: file.size, type: file.type } });
      await saveLocalAudio(pid, file);
      setAudioFile(file);
      setProjectId(pid);
      navigate({ to: '/project/$projectId', params: { projectId: pid } });
    } finally {
      setIsLoading(false);
    }
  }, [user, navigate, signInGuest]);

  const handleRelinkSelected = useCallback(async (file: File | null) => {
    if (!file || !projectId) return;
    setIsLoading(true);
    try {
      await saveLocalAudio(projectId, file);
      setAudioFile(file);
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  const handleSignOut = useCallback(async () => {
    await signOut();
    setProjectId(null);
    setAudioFile(null);
    setNotes([]);
    navigate({ to: '/' });
  }, [signOut, navigate, setNotes]);

  const handleCurrentTimeChange = useCallback((t: number) => {
    setCurrentTime(t);
    onCurrentTimeChange(t);
  }, [onCurrentTimeChange]);

  return {
    // routing/auth
    user,
    authLoading,
    shouldRedirectToProjects,
    params,

    // project/audio state
    audioFile,
    setAudioFile,
    projectId,
    setProjectId,
    loadingProject,
    loadingWaveform,
    setLoadingWaveform,
    isLoading,
    setIsLoading,
    currentTime,
    setCurrentTime,

    // actions
    handleFileSelect,
    handleRelinkSelected,
    handleSignOut,
    handleCurrentTimeChange,

  } as const;
}
