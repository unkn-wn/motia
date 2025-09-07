import { useState, useCallback, useRef, useEffect, useSyncExternalStore, useMemo } from 'react';
import WaveformPlayer, { type WaveformPlayerRef } from '@components/WaveformPlayer';
import AudioControls from '@components/AudioControlsContainer';
import NotesSidebarContainer from '@components/NotesSidebar/NotesSidebarContainer';
import KeyboardShortcuts from '@components/KeyboardShortcuts';
import FloatingDock from '@components/FloatingDock';
import ProfileModal from '@/components/ProfileModal';
import { AudioProvider } from '@contexts/AudioContext';
import FullscreenOverlay from '@/components/FullscreenOverlay';
import RelinkBanner from '@/components/RelinkBanner';
import HomeHero from '@components/Home/HomeHero';
import AuthModal from '@components/Home/AuthModal';
import { useAuth } from '@contexts/objects/FirebaseAuthContextObject';
import type { Note } from '@types';
import { createNote } from '@utils/notesUtils';
import { DEFAULT_SHORTCUTS, type KeyboardShortcut, createKeyboardHandler, resetAllShortcutsAndPreferences, isUserTyping, getPreferences } from '@utils/shortcutsUtils';
import { history } from '@utils/history';
import { ChevronLeftIcon, ChevronRightIcon, CheckIcon } from '@assets/icons';
import './style.css';
import { createProject, fetchProjectMeta, fetchProjectNotes } from '@/lib/db';
import { auth } from '@/lib/firebase';
import { getLocalAudio, saveLocalAudio } from '@/lib/localAudio';
import { useNavigate, useParams } from '@tanstack/react-router';
import { useFirestoreAutosave } from '@/hooks/useFirestoreAutosave';

function Home() {
  const { user, loading: authLoading, signOut, signInGuest, lastMigratedProjectId, clearMigrationRedirect } = useAuth();
  const navigate = useNavigate();
  const params = useParams({ strict: false }) as { projectId?: string };
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [notes, setNotes] = useState<Note[]>([]);
  const notesRef = useRef<Note[]>([]);
  const [currentTime, setCurrentTime] = useState(0);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [shortcuts, setShortcuts] = useState<KeyboardShortcut[]>(DEFAULT_SHORTCUTS);
  const [isDrawingMode, setIsDrawingMode] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [signInOpen, setSignInOpen] = useState(false);
  const [signUpOpen, setSignUpOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const handleOpenProfile = useCallback(() => setProfileOpen(true), []);
  const waveformPlayerRef = useRef<WaveformPlayerRef>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [loadingProject, setLoadingProject] = useState(false);
  const relinkInputRef = useRef<HTMLInputElement>(null!);
  const [loadingWaveform, setLoadingWaveform] = useState(false);
  // Load project only if user is signed in and owns it; otherwise redirect home
  useEffect(() => {
    // If we just migrated from anon -> signed-in, route to the restored project
    if (user && lastMigratedProjectId) {
      navigate({ to: '/project/$projectId', params: { projectId: lastMigratedProjectId } });
      clearMigrationRedirect?.();
    }
  }, [user, lastMigratedProjectId]);

  useEffect(() => {
    const fromRoute = params.projectId;
    let aborted = false;
    (async () => {
      // First: if routing to a project, require auth to settle before anything
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
        // Try to rehydrate audio from local IndexedDB cache
        const cached = await getLocalAudio(fromRoute);
        if (!aborted && cached) setAudioFile(cached);
      } finally {
        if (!aborted) setLoadingProject(false);
      }
    })();
    return () => { aborted = true; };
  }, [user, authLoading, params.projectId]);


  // Keep a live ref of notes for History getters
  useEffect(() => {
    notesRef.current = notes;
  }, [notes]);

  // Register History accessors once
  useEffect(() => {
    history.registerNotesAccess(() => notesRef.current, (n: Note[]) => setNotes(n));
    // Apply history cap from preferences on load
    const prefs = getPreferences();
    if (prefs?.historyMax) {
      history.setMax(prefs.historyMax);
    }
  }, []);

  const handleFileSelect = useCallback(async (file: File) => {
    setIsLoading(true);
    try {
      // Small UX delay
      await new Promise(resolve => setTimeout(resolve, 600));
      // Ensure we have an authenticated user (anonymous or signed-in)
      let uid = user?.uid ?? null;
      if (!uid) {
        await signInGuest();
        uid = auth.currentUser?.uid ?? null;
      }
      if (!uid) {
        // Fallback: keep local only if auth failed for some reason
        setProjectId(null);
        setAudioFile(file);
        return;
      }
      // Create a Firestore project and persist audio locally for this device
      const pid = await createProject(uid, {
        audio: { name: file.name, size: file.size, type: file.type },
      });
      await saveLocalAudio(pid, file);
      setAudioFile(file);
      setProjectId(pid);
      navigate({ to: '/project/$projectId', params: { projectId: pid } });
    } finally {
      setIsLoading(false);
    }
  }, [user, navigate, signInGuest]);

  const handleAddNote = useCallback((time: number, canvasX: number, canvasY: number) => {
    const prefs = getPreferences();
    const color = prefs?.defaultNoteColor ?? 'blue';
    const newNote = createNote(time, canvasX, canvasY, '', color);
    setNotes(prev => [...prev, newNote]);
    history.pushAddNote(newNote);
  }, []);

  const handleAddNoteAtCurrentTime = useCallback(() => {
    if (waveformPlayerRef.current) {
      waveformPlayerRef.current.addNoteAtCurrentTime();
    }
  }, []);

  const handleToggleDrawingMode = useCallback(() => {
    setIsDrawingMode(prev => !prev);
  }, []);
  const handleToggleSidebar = useCallback(() => {
    setSidebarOpen(prev => !prev);
  }, []);

  const handleShowShortcuts = useCallback(() => {
    setShowShortcuts(true);
  }, []);

  const handleAddDrawing = useCallback((time: number, canvasX: number, canvasY: number, drawing: Note['drawing']) => {
    const newNote = createNote(time, canvasX, canvasY, '', 'gray');
    newNote.type = 'drawing';
    newNote.drawing = drawing;
    setNotes(prev => [...prev, newNote]);
    history.pushAddNote(newNote);
    return newNote.id;
  }, []);

  const handleUpdateDrawing = useCallback((id: string, drawing: Note['drawing']) => {
    const prevNote = notesRef.current.find(n => n.id === id);
    const prevDrawing = prevNote?.drawing ?? null;
    const nextDrawing = drawing;
    // If equivalent JSON, no-op
    if (JSON.stringify(prevDrawing) === JSON.stringify(nextDrawing)) return;
    // Replace the entire note object to change identity and ensure downstream caches key by compressedSize
    setNotes(prev => prev.map(n => n.id === id ? { ...n, drawing: { ...nextDrawing } } as Note : n));
    history.pushUpdateDrawing(id, prevDrawing as Note['drawing'], nextDrawing);
  }, []);

  // Keyboard shortcuts handlers
  const handleUpdateShortcut = useCallback((id: string, newKey: string) => {
    setShortcuts(prev => prev.map(shortcut =>
      shortcut.id === id ? { ...shortcut, currentKey: newKey } : shortcut
    ));
  }, []);

  const handleResetShortcuts = useCallback(() => {
    const defaults = resetAllShortcutsAndPreferences();
    setShortcuts(defaults);
  }, []);

  // Global keyboard event handler
  useEffect(() => {
    // Create action handlers
    const actionHandlers = {
      'ADD_NOTE': handleAddNoteAtCurrentTime,
      'TOGGLE_DRAWING_MODE': handleToggleDrawingMode,
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
  }, [shortcuts, handleAddNoteAtCurrentTime, handleToggleDrawingMode, handleToggleSidebar]);

  const handleUpdateNote = useCallback((id: string, content: string) => {
    const prevNote = notesRef.current.find(n => n.id === id);
    const prevContent = prevNote?.content ?? '';
    if (prevContent === content) return; // no-op
    setNotes(prev => prev.map(note =>
      note.id === id ? { ...note, content } : note
    ));
    history.pushUpdateNoteContent(id, prevContent, content);
  }, []);

  const handleDeleteNote = useCallback((id: string) => {
    const snap = notesRef.current.find(n => n.id === id);
    if (snap) {
      history.pushDeleteNote(snap);
    }
    setNotes(prev => prev.filter(note => note.id !== id));
  }, []);

  const handleMoveNote = useCallback((id: string, canvasX: number, canvasY: number) => {
    setNotes(prev => prev.map(note =>
      note.id === id ? { ...note, canvasX, canvasY } : note
    ));
  }, []);

  const handleJumpToTime = useCallback((time: number) => {
    if (waveformPlayerRef.current) {
      waveformPlayerRef.current.seekToTime(time);
    }
  }, []);

  const handleChangeNoteColor = useCallback((id: string, color: string) => {
    const prevNote = notesRef.current.find(n => n.id === id);
    const prevColor = prevNote?.color ?? color;
    if (prevColor === color) return; // no-op
    setNotes(prev => prev.map(note =>
      note.id === id ? { ...note, color } : note
    ));
    history.pushChangeNoteColor(id, prevColor, color);
  }, []);

  // Stable Undo/Redo handlers to avoid re-rendering consumers every tick
  const handleUndo = useCallback(() => { history.undo(); }, []);
  const handleRedo = useCallback(() => { history.redo(); }, []);

  // Sign out wrapper that also clears current project/audio state
  const handleSignOut = useCallback(async () => {
    await signOut();
    // Clear app state on logout so no project remains loaded
    setProjectId(null);
    setAudioFile(null);
    setNotes([]);
    // Route back to home
    navigate({ to: '/' });
  }, [signOut]);

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
        history.redo();
        return;
      }
      // Undo: Ctrl+Z
      if (key === 'z') {
        e.preventDefault();
        history.undo();
      }
    };
    const opts = { capture: true } as AddEventListenerOptions;
    window.addEventListener('keydown', onKeyDown, opts);
    return () => window.removeEventListener('keydown', onKeyDown as EventListener, opts);
  }, []);

  const handleCurrentTimeChange = useCallback((time: number) => {
    setCurrentTime(time);
  }, []);

  // Subscribe to history for stable canUndo/canRedo without re-rendering each tick
  const historyFlags = useSyncExternalStore(
    history.subscribe.bind(history),
    () => (history.canUndo() ? 1 : 0) | (history.canRedo() ? 2 : 0)
  );
  const canUndo = (historyFlags & 1) !== 0;
  const canRedo = (historyFlags & 2) !== 0;

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
  const handleRelinkSelected = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !projectId) return;
    setIsLoading(true);
    try {
      await saveLocalAudio(projectId, file);
      setAudioFile(file);
    } finally {
      setIsLoading(false);
      if (relinkInputRef.current) relinkInputRef.current.value = '';
    }
  }, [projectId]);

  const showGlobalProjectOverlay = useMemo(() => params.projectId && (authLoading || loadingProject || loadingWaveform), [params.projectId, authLoading, loadingProject, loadingWaveform]);

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
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
          <AudioProvider onCurrentTimeChange={handleCurrentTimeChange}>
            <div className="relative h-screen overflow-hidden">
              <RelinkBanner isLoading={isLoading} onRelinkClick={handleRelinkClick} fileInputRef={relinkInputRef} onFileSelected={handleRelinkSelected} />

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
              />
              <AudioControls />
              <FloatingDock
                onAddNote={handleAddNoteAtCurrentTime}
                onShowShortcuts={handleShowShortcuts}
                canAddNote={true}
                isDrawingMode={isDrawingMode}
                onToggleDrawingMode={handleToggleDrawingMode}
                onUndo={handleUndo}
                onRedo={handleRedo}
                canUndo={canUndo}
                canRedo={canRedo}
                onOpenProfile={handleOpenProfile}
              />
              {/* Sidebar toggle + Notes sidebar remain available */}
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className={`fixed top-20 -translate-y-1/2 z-30 bg-neutral-900 hover:bg-neutral-950 text-white p-2 cursor-pointer rounded-l-lg shadow-lg transition-all duration-300 ease-in-out ${sidebarOpen ? 'right-80' : 'right-0'
                  }`}
                title={sidebarOpen ? 'Hide notes' : 'Show notes'}
              >
                <div className="flex items-center space-x-2">
                  {sidebarOpen ? (
                    <ChevronRightIcon className="w-4 h-4" />
                  ) : (
                    <ChevronLeftIcon className="w-4 h-4" />
                  )}
                  <span className="text-sm font-medium">{notes.filter(note => note.type !== 'drawing').length}</span>
                </div>
              </button>
              <div className={`fixed right-0 top-8 h-full z-20 transform transition-transform duration-300 ease-in-out ${sidebarOpen ? 'translate-x-0' : 'translate-x-full'
                }`}>
                <NotesSidebarContainer
                  notes={notes}
                  onDeleteNote={handleDeleteNote}
                  onJumpToTime={handleJumpToTime}
                  onChangeNoteColor={handleChangeNoteColor}
                  onUpdateNote={handleUpdateNote}
                  currentTime={currentTime}
                />
              </div>
            </div>
          </AudioProvider>
        ) : (
          <>
            <HomeHero
              onUpload={handleFileSelect}
              uploading={isLoading}
              onOpenSignin={() => setSignInOpen(true)}
              onOpenSignup={() => setSignUpOpen(true)}
              onSignOut={handleSignOut}
            />
            <AuthModal open={signInOpen} mode="signin" onClose={() => setSignInOpen(false)} />
            <AuthModal open={signUpOpen} mode="signup" onClose={() => setSignUpOpen(false)} />
          </>
        )
      ) : (
        <AudioProvider
          onCurrentTimeChange={handleCurrentTimeChange}
        >
          <div className="relative h-screen overflow-hidden">
            {loadingProject && (
              <div className="absolute inset-0 z-50 grid place-items-center bg-neutral-900/70 text-neutral-200">
                <div className="flex items-center gap-2">
                  <div className="h-4 w-4 border-2 border-white/80 border-t-transparent rounded-full animate-spin" />
                  <span>Loading project…</span>
                </div>
              </div>
            )}
            {/* Autosave indicator (top-left) */}
            <div className="fixed top-3 left-3 z-40 group select-none">
              <div
                className={`h-6 w-6 rounded-full grid place-items-center shadow-md ${saving ? 'bg-neutral-700 animate-pulse' : 'bg-neutral-800'} border border-neutral-600`}
                aria-live="polite"
                // aria-label={saving ? 'Saving…' : (lastSavedAt ? `Saved ${lastSavedAt.toLocaleTimeString()}` : 'Idle')}
                title={lastSavedAt ? `Last saved ${lastSavedAt.toLocaleTimeString()}` : 'Not saved yet'}
              >
                {saving ? (
                  <div className="h-3 w-3 border-2 border-white/80 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <CheckIcon className="w-3.5 h-3.5 text-neutral-300" />
                )}
              </div>
              {/* hover popover */}
              <div className="pointer-events-none absolute left-0 mt-1 px-2 py-1 rounded-md text-xs bg-neutral-800/95 text-neutral-200 border border-neutral-700 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                {saving ? 'Saving…' : (lastSavedAt ? `Saved ${lastSavedAt.toLocaleTimeString()}` : 'Not saved yet')}
              </div>
            </div>
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
            />

            {/* Audio Controls - now outside WaveformPlayer */}
            <AudioControls />

            {/* Floating Dock with Add Note and Keyboard Shortcuts */}
            <FloatingDock
              onAddNote={handleAddNoteAtCurrentTime}
              onShowShortcuts={handleShowShortcuts}
              canAddNote={!!audioFile}
              isDrawingMode={isDrawingMode}
              onToggleDrawingMode={handleToggleDrawingMode}
              onUndo={handleUndo}
              onRedo={handleRedo}
              canUndo={canUndo}
              canRedo={canRedo}
              onOpenProfile={handleOpenProfile}
            />

            {/* Sidebar Toggle Button - positioned on the side and moves with panel */}
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className={`fixed top-20 -translate-y-1/2 z-30 bg-neutral-900 hover:bg-neutral-950 text-white p-2 cursor-pointer rounded-l-lg shadow-lg transition-all duration-300 ease-in-out ${sidebarOpen ? 'right-80' : 'right-0'
                }`}
              title={sidebarOpen ? 'Hide notes' : 'Show notes'}
            >
              <div className="flex items-center space-x-2">
                {sidebarOpen ? (
                  <ChevronRightIcon className="w-4 h-4" />
                ) : (
                  <ChevronLeftIcon className="w-4 h-4" />
                )}
                <span className="text-sm font-medium">{notes.filter(note => note.type !== 'drawing').length}</span>
              </div>
            </button>

            {/* Collapsible Sidebar */}
            <div className={`fixed right-0 top-8 h-full z-20 transform transition-transform duration-300 ease-in-out ${sidebarOpen ? 'translate-x-0' : 'translate-x-full'
              }`}>
              <NotesSidebarContainer
                notes={notes}
                onDeleteNote={handleDeleteNote}
                onJumpToTime={handleJumpToTime}
                onChangeNoteColor={handleChangeNoteColor}
                onUpdateNote={handleUpdateNote}
                currentTime={currentTime}
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
