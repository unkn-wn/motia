import { useState, useCallback, useRef, useEffect } from 'react';
import FileUploader from '@components/FileUploader';
import WaveformPlayer, { type WaveformPlayerRef } from '@components/WaveformPlayer';
import AudioControls from '@components/AudioControlsContainer';
import NotesSidebarContainer from '@components/NotesSidebar/NotesSidebarContainer';
import KeyboardShortcuts from '@components/KeyboardShortcuts';
import FloatingDock from '@components/FloatingDock';
import { AudioProvider } from '@contexts/AudioContext';
import type { Note } from '@types';
import { createNote } from '@utils/notesUtils';
import { DEFAULT_SHORTCUTS, type KeyboardShortcut, createKeyboardHandler, resetAllShortcutsAndPreferences, isUserTyping, getPreferences } from '@utils/shortcutsUtils';
import { history } from '@utils/history';
import { ChevronLeftIcon, ChevronRightIcon } from '@assets/icons';
import './style.css';

function Home() {
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [notes, setNotes] = useState<Note[]>([]);
  const notesRef = useRef<Note[]>([]);
  const [currentTime, setCurrentTime] = useState(0);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [shortcuts, setShortcuts] = useState<KeyboardShortcut[]>(DEFAULT_SHORTCUTS);
  const [isDrawingMode, setIsDrawingMode] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const waveformPlayerRef = useRef<WaveformPlayerRef>(null);

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
    // Simulate processing time
    await new Promise(resolve => setTimeout(resolve, 1000));
    setAudioFile(file);
    setIsLoading(false);
  }, []);

  const handleAddNote = useCallback((time: number, canvasX: number, canvasY: number) => {
    const newNote = createNote(time, canvasX, canvasY, '', 'blue');
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
  }, [shortcuts, handleAddNoteAtCurrentTime]); const handleUpdateNote = useCallback((id: string, content: string) => {
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
        <div className="h-screen flex items-center justify-center p-6">
          <FileUploader
            onFileSelect={handleFileSelect}
            isLoading={isLoading}
          />
        </div>
      ) : (
        <AudioProvider
          onCurrentTimeChange={handleCurrentTimeChange}
        >
          <div className="relative h-screen overflow-hidden">
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
