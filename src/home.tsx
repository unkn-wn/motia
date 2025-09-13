import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import WaveformPlayer, { type WaveformPlayerRef } from '@components/WaveformPlayer';
import AudioControls from '@components/AudioControlsContainer';
import NotesSidebarConnected from '@components/NotesSidebar/NotesSidebarConnected';
import KeyboardShortcuts from '@components/KeyboardShortcuts';
import FloatingDock from '@components/FloatingDock';
import ProfileModal from '@/components/ProfileModal';
import { AudioProvider } from '@contexts/AudioContext';
import FullscreenOverlay from '@/components/FullscreenOverlay';
// Relink handled by TopBanner
import TopBanner, { RelinkBannerOption, SignInBannerOption } from '@/components/TopBanner';
import HomeLanding from '@components/Home/HomeLanding';
// Sign-in handled by TopBanner
import { type KeyboardShortcut, createKeyboardHandler, resetAllShortcutsAndPreferences, isUserTyping, getShortcuts, setShortcuts as setGlobalShortcuts } from '@utils/shortcutsUtils';
import './style.css';
import { Navigate, useNavigate } from '@tanstack/react-router';
import { useFirestoreAutosave } from '@/hooks/useFirestoreAutosave';
import { useNotesState } from '@/hooks/useNotesState';
import { useProjectLifecycle } from '@/hooks/useProjectLifecycle';
import { fetchProjectMeta, updateProjectThumbnail } from '@/lib/db';
import AutosaveIndicator from '@/components/AutosaveIndicator';
import SidebarToggle from '@/components/SidebarToggle';

function Home() {
  const navigate = useNavigate();
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [shortcuts, setShortcuts] = useState<KeyboardShortcut[]>(() => getShortcuts());
  const [isDrawingMode, setIsDrawingMode] = useState(false); // legacy
  const [toolMode, setToolMode] = useState<'draw' | 'select' | 'erase' | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [profileOpen, setProfileOpen] = useState(false);
  const handleOpenProfile = useCallback(() => setProfileOpen(true), []);
  const waveformPlayerRef = useRef<WaveformPlayerRef>(null);
  const relinkInputRef = useRef<HTMLInputElement>(null!);

  // Centralized notes state & actions
  const {
    notes,
    setNotes,
    handleAddNote,
    handleUpdateNote,
    handleDeleteNote,
    handleMoveNote,
    handleAddDrawing,
    handleUpdateDrawing,
    handleChangeNoteColor,
    canUndo,
    canRedo,
    handleUndo,
    handleRedo,
  } = useNotesState();

  // Project lifecycle
  const {
    user,
    authLoading,
    shouldRedirectToProjects,
    redirectTo,
    params,
    audioFile,
    projectId,
    loadingProject,
    loadingWaveform,
    setLoadingWaveform,
    isLoading,
    handleFileSelect,
    handleRelinkSelected,
    handleSignOut,
  } = useProjectLifecycle({ setNotes, onCurrentTimeChange: () => { } });

  // Add note via player button

  const handleAddNoteAtCurrentTime = useCallback(() => {
    if (waveformPlayerRef.current) {
      waveformPlayerRef.current.addNoteAtCurrentTime();
    }
  }, []);

  const handleDrawMode = useCallback(() => {
    setToolMode(m => m === 'draw' ? null : 'draw');
    setIsDrawingMode(prev => !prev);
  }, []);
  const handleSelectMode = useCallback(() => {
    setIsDrawingMode(false);
    setToolMode(m => m === 'select' ? null : 'select');
  }, []);
  const handleEraseMode = useCallback(() => {
    setIsDrawingMode(false);
    setToolMode(m => m === 'erase' ? null : 'erase');
  }, []);
  const handleToggleSidebar = useCallback(() => {
    setSidebarOpen(prev => !prev);
  }, []);

  const handleShowShortcuts = useCallback(() => {
    setShowShortcuts(true);
  }, []);

  // Stable Projects navigation for FloatingDock
  const handleGoProjects = useCallback(() => {
    if (user?.isAnonymous) return; // respect disabled state
    try { waveformPlayerRef.current?.pause(); } catch { /* ignore */ }
    navigate({ to: '/projects' });
  }, [navigate, user?.isAnonymous]);

  // drawing handlers come from notes state

  // Keyboard shortcuts handlers
  const handleUpdateShortcut = useCallback((id: string, newKey: string) => {
    setShortcuts(prev => {
      const next = prev.map(shortcut => shortcut.id === id ? { ...shortcut, currentKey: newKey } : shortcut);
      setGlobalShortcuts(next);
      return next;
    });
  }, []);

  const handleResetShortcuts = useCallback(() => {
    const defaults = resetAllShortcutsAndPreferences();
    setShortcuts(defaults);
  }, []);

  // Sync local view with global store after sign-in/settings load
  useEffect(() => {
    setShortcuts(getShortcuts());
  }, [user]);

  // Global keyboard event handler
  useEffect(() => {
    // Create action handlers
    const actionHandlers = {
      'ADD_NOTE': handleAddNoteAtCurrentTime,
      'TOOL_DRAW': handleDrawMode,
      'TOOL_SELECT': handleSelectMode,
      'TOOL_ERASE': handleEraseMode,
      'TOGGLE_SIDEBAR': handleToggleSidebar,
      'SHOW_SHORTCUTS': () => setShowShortcuts(true),
      'TOGGLE_PLAYBACK': () => {
        if (waveformPlayerRef.current) {
          waveformPlayerRef.current.playPause();
        }
      },
      'REWIND': () => {
        if (waveformPlayerRef.current) {
          waveformPlayerRef.current.skipBack();
        }
      },
      'FORWARD': () => {
        if (waveformPlayerRef.current) {
          waveformPlayerRef.current.skipForward();
        }
      },
      'VOLUME_UP': () => {
        if (waveformPlayerRef.current) {
          waveformPlayerRef.current.volumeUp();
        }
      },
      'VOLUME_DOWN': () => {
        if (waveformPlayerRef.current) {
          waveformPlayerRef.current.volumeDown();
        }
      }
    };

    // Create the centralized keyboard handler
    const keyboardHandler = createKeyboardHandler(shortcuts, actionHandlers);

    window.addEventListener('keydown', keyboardHandler);
    return () => window.removeEventListener('keydown', keyboardHandler);
  }, [shortcuts, handleAddNoteAtCurrentTime, handleDrawMode, handleSelectMode, handleEraseMode, handleToggleSidebar]);

  // note handlers provided by notes state

  const handleJumpToTime = useCallback((time: number) => {
    if (waveformPlayerRef.current) {
      waveformPlayerRef.current.seekToTime(time);
    }
  }, []);

  // color + undo/redo + sign out provided by hooks

  // Global Undo/Redo (Ctrl/Cmd+Z, Ctrl+Shift+Z only)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isUserTyping()) return;
      const isMeta = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (!isMeta) return;
      // Redo: Ctrl+Shift+Z only
      if (key === 'z' && e.shiftKey) {
        e.preventDefault();
        handleRedo();
        return;
      }
      // Undo: Ctrl+Z
      if (key === 'z') {
        e.preventDefault();
        handleUndo();
      }
    };
    const opts = { capture: true } as AddEventListenerOptions;
    window.addEventListener('keydown', onKeyDown, opts);
    return () => window.removeEventListener('keydown', onKeyDown as EventListener, opts);
  }, [handleUndo, handleRedo]);

  // Autosave notes to Firestore when possible
  const { saving, lastSavedAt } = useFirestoreAutosave({
    uid: user?.uid,
    projectId,
    notes,
  });

  // Relink audio handlers for project routes when audio is missing locally
  const handleRelinkClick = useCallback(() => {
    relinkInputRef.current?.click();
  }, []);
  const handleRelinkInputChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    await handleRelinkSelected(file);
    if (relinkInputRef.current) relinkInputRef.current.value = '';
  }, [handleRelinkSelected]);

  const showGlobalProjectOverlay = useMemo(() => params.projectId && (authLoading || loadingProject || loadingWaveform), [params.projectId, authLoading, loadingProject, loadingWaveform]);
  // Generate and persist a small thumbnail once when waveform is ready
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user || !projectId) return;
      if (loadingWaveform) return; // wait for waveform ready
      const ref = waveformPlayerRef.current;
      if (!ref || !ref.exportThumbnail) return;
      try {
        const currentMeta = await fetchProjectMeta(user.uid, projectId);
        if (cancelled) return;
        const existing = currentMeta?.thumbnail ?? null;
        const dataUrl = ref.exportThumbnail(480, 120);
        if (!dataUrl) return;
        if (existing && existing.startsWith('data:') && existing.length === dataUrl.length) return; // cheap equality heuristic
        await updateProjectThumbnail(user.uid, projectId, dataUrl);
      } catch {
        // ignore thumbnail errors
      }
    })();
    return () => { cancelled = true; };
  }, [user, projectId, loadingWaveform]);

  // Memoize text notes count to avoid unnecessary rerenders in toggle
  const textNotesCount = useMemo(() => notes.filter(n => n.type !== 'drawing').length, [notes]);


  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      {shouldRedirectToProjects ? <Navigate to="/projects" /> : null}
      {redirectTo && redirectTo !== 'PROJECTS' ? (
        <Navigate to="/project/$projectId" params={{ projectId: redirectTo }} />
      ) : null}
      {/* Top banner orchestrator: ensures only one banner shows (Relink > Sign-in) */}
      <TopBanner
        options={[
          RelinkBannerOption({
            show: !audioFile && !!params.projectId,
            isLoading,
            onRelinkClick: handleRelinkClick,
            fileInputRef: relinkInputRef,
            onFileSelected: handleRelinkInputChange,
          }),
          SignInBannerOption({ show: !!user?.isAnonymous }),
        ]}
      />
      {showGlobalProjectOverlay && <FullscreenOverlay message="Loading project…" />}
      {/* Keyboard Shortcuts Panel */}
      <KeyboardShortcuts
        isOpen={showShortcuts}
        onClose={() => setShowShortcuts(false)}
        shortcuts={shortcuts}
        onUpdateShortcut={handleUpdateShortcut}
        onResetShortcuts={handleResetShortcuts}
      />
      {!audioFile ? (
        params.projectId ? (
          <AudioProvider>
            <div className="relative h-screen overflow-hidden">
              {/* Relink banner handled by TopBanner to avoid overlap */}

              {/* Notes and UI still render against a default waveform */}
              <WaveformPlayer
                ref={waveformPlayerRef}
                audioFile={null}
                onLoadingChange={setLoadingWaveform}
                onAddNote={handleAddNote}
                notes={notes}
                onUpdateNote={handleUpdateNote}
                onDeleteNote={handleDeleteNote}
                onMoveNote={handleMoveNote}
                isDrawingMode={isDrawingMode}
                onAddDrawing={handleAddDrawing}
                onUpdateDrawing={handleUpdateDrawing}
                toolMode={toolMode}
              />
              <AudioControls />
              <FloatingDock
                onAddNote={handleAddNoteAtCurrentTime}
                onShowShortcuts={handleShowShortcuts}
                canAddNote={true}
                isDrawingMode={isDrawingMode}
                onToggleDrawingMode={handleDrawMode}
                onSelectMode={handleSelectMode}
                onEraseMode={handleEraseMode}
                toolMode={toolMode}
                onUndo={handleUndo}
                onRedo={handleRedo}
                canUndo={canUndo}
                canRedo={canRedo}
                onOpenProfile={handleOpenProfile}
                onGoHome={handleGoProjects}
                disableGoHome={!!user?.isAnonymous}
              />
              {/* Sidebar toggle + Notes sidebar remain available */}
              <SidebarToggle open={sidebarOpen} setOpen={setSidebarOpen} textNotesCount={textNotesCount} />
              <div
                data-prevent-erase
                className={`fixed right-0 top-8 h-full z-40 transform transition-transform duration-300 ease-in-out ${sidebarOpen ? 'translate-x-0' : 'translate-x-full'
                  }`}>
                <NotesSidebarConnected
                  notes={notes}
                  onDeleteNote={handleDeleteNote}
                  onJumpToTime={handleJumpToTime}
                  onChangeNoteColor={handleChangeNoteColor}
                  onUpdateNote={handleUpdateNote}
                  onClose={() => setSidebarOpen(false)}
                />
              </div>
            </div>
          </AudioProvider>
        ) : (
          <HomeLanding onUpload={handleFileSelect} uploading={isLoading} onSignOut={handleSignOut} />
        )
      ) : (
        <AudioProvider>
          <div className="relative h-screen overflow-hidden">
            {loadingProject && (
              <FullscreenOverlay message="Loading project…" />
            )}
            <AutosaveIndicator saving={saving} lastSavedAt={lastSavedAt} />
            <WaveformPlayer
              ref={waveformPlayerRef}
              audioFile={audioFile}
              onLoadingChange={setLoadingWaveform}
              onAddNote={handleAddNote}
              notes={notes}
              onUpdateNote={handleUpdateNote}
              onDeleteNote={handleDeleteNote}
              onMoveNote={handleMoveNote}
              isDrawingMode={isDrawingMode}
              onAddDrawing={handleAddDrawing}
              onUpdateDrawing={handleUpdateDrawing}
              toolMode={toolMode}
            />

            {/* Audio Controls - now outside WaveformPlayer */}
            <AudioControls />

            {/* Floating Dock with Add Note and Keyboard Shortcuts */}
            <FloatingDock
              onAddNote={handleAddNoteAtCurrentTime}
              onShowShortcuts={handleShowShortcuts}
              canAddNote={!!audioFile}
              isDrawingMode={isDrawingMode}
              onToggleDrawingMode={handleDrawMode}
              onSelectMode={handleSelectMode}
              onEraseMode={handleEraseMode}
              toolMode={toolMode}
              onUndo={handleUndo}
              onRedo={handleRedo}
              canUndo={canUndo}
              canRedo={canRedo}
              onOpenProfile={handleOpenProfile}
              onGoHome={handleGoProjects}
              disableGoHome={!!user?.isAnonymous}
            />
            {/* Sidebar Toggle Button - positioned on the side and moves with panel */}
            <SidebarToggle open={sidebarOpen} setOpen={setSidebarOpen} textNotesCount={textNotesCount} />

            {/* Collapsible Sidebar */}
            <div
              data-prevent-erase
              className={`fixed right-0 top-8 h-full z-20 transform transition-transform duration-300 ease-in-out ${sidebarOpen ? 'translate-x-0' : 'translate-x-full'
                }`}>
              <NotesSidebarConnected
                notes={notes}
                onDeleteNote={handleDeleteNote}
                onJumpToTime={handleJumpToTime}
                onChangeNoteColor={handleChangeNoteColor}
                onUpdateNote={handleUpdateNote}
                onClose={() => setSidebarOpen(false)}
              />
            </div>
          </div>
        </AudioProvider>
      )}
      {/* Profile Modal lives at root to overlay */}
      <ProfileModal open={profileOpen} onClose={() => setProfileOpen(false)} />
    </div>
  );
}

export default Home;
