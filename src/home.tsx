import { useState, useCallback, useRef, useEffect, useSyncExternalStore } from 'react';
import WaveformPlayer, { type WaveformPlayerRef } from '@components/WaveformPlayer';
import AudioControls from '@components/AudioControlsContainer';
import NotesSidebarContainer from '@components/NotesSidebar/NotesSidebarContainer';
import KeyboardShortcuts from '@components/KeyboardShortcuts';
import FloatingDock from '@components/FloatingDock';
import { AudioProvider } from '@contexts/AudioContext';
import HomeHero from '@components/Home/HomeHero';
import AuthModal from '@components/Home/AuthModal';
import { useAuth } from '@contexts/objects/FirebaseAuthContextObject';
import type { Note } from '@types';
import { createNote } from '@utils/notesUtils';
import { DEFAULT_SHORTCUTS, type KeyboardShortcut, createKeyboardHandler, resetAllShortcutsAndPreferences, isUserTyping, getPreferences } from '@utils/shortcutsUtils';
import { history } from '@utils/history';
import { ChevronLeftIcon, ChevronRightIcon, CheckIcon } from '@assets/icons';
import './style.css';
import { createProject } from '@/lib/db';
import { useFirestoreAutosave } from '@/hooks/useFirestoreAutosave';

function Home() {
  const { user } = useAuth();
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
  const waveformPlayerRef = useRef<WaveformPlayerRef>(null);
  const [projectId, setProjectId] = useState<string | null>(null);

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
      setAudioFile(file);
      // Create a Firestore project for this session if signed in
      if (user) {
        const pid = await createProject(user.uid, {
          audio: { name: file.name, size: file.size, type: file.type },
        });
        setProjectId(pid);
      } else {
        setProjectId(null);
      }
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  const handleAddNote = useCallback((time: number, canvasX: number, canvasY: number) => {
    const prefs = getPreferences();
    const color = prefs.defaultNoteColor ?? 'blue';
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
  }, [shortcuts, handleAddNoteAtCurrentTime, handleToggleDrawingMode, handleToggleSidebar]); const handleUpdateNote = useCallback((id: string, content: string) => {
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

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      {/* Keyboard Shortcuts Panel */}
      <KeyboardShortcuts
        isOpen={showShortcuts}
        onClose={() => setShowShortcuts(false)}
        shortcuts={shortcuts}
        onUpdateShortcut={handleUpdateShortcut}
        onResetShortcuts={handleResetShortcuts}
      />
  {!audioFile ? (
        <>
          <HomeHero
            onUpload={handleFileSelect}
            uploading={isLoading}
            onOpenSignin={() => setSignInOpen(true)}
            onOpenSignup={() => setSignUpOpen(true)}
          />
          <AuthModal open={signInOpen} mode="signin" onClose={() => setSignInOpen(false)} />
          <AuthModal open={signUpOpen} mode="signup" onClose={() => setSignUpOpen(false)} />
        </>
      ) : (
        <AudioProvider
          onCurrentTimeChange={handleCurrentTimeChange}
        >
          <div className="relative h-screen overflow-hidden">
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
    </div>
  );
}

export default Home;
