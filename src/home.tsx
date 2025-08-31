import { useState, useCallback, useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import FileUploader from './components/FileUploader';
import WaveformPlayer, { type WaveformPlayerRef } from './components/WaveformPlayer';
import NotesSidebar from './components/NotesSidebar';
import type { Note } from './components/NotesOverlay';
import { createNote } from './utils/notesUtils';
import './style.css';

function Home() {
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [notes, setNotes] = useState<Note[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const waveformPlayerRef = useRef<WaveformPlayerRef>(null);

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
  }, []);

  const handleUpdateNote = useCallback((id: string, content: string) => {
    setNotes(prev => prev.map(note =>
      note.id === id ? { ...note, content } : note
    ));
  }, []);

  const handleDeleteNote = useCallback((id: string) => {
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
    setNotes(prev => prev.map(note =>
      note.id === id ? { ...note, color } : note
    ));
  }, []);

  const handleCurrentTimeChange = useCallback((time: number) => {
    setCurrentTime(time);
  }, []);

  const handlePlayStateChange = useCallback((playing: boolean) => {
    setIsPlaying(playing);
  }, []);

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      {!audioFile ? (
        <div className="h-screen flex items-center justify-center p-6">
          <FileUploader
            onFileSelect={handleFileSelect}
            isLoading={isLoading}
          />
        </div>
      ) : (
        <div className="relative h-screen overflow-hidden">
          <WaveformPlayer
            ref={waveformPlayerRef}
            audioFile={audioFile}
            onAddNote={handleAddNote}
            onCurrentTimeChange={handleCurrentTimeChange}
            onPlayStateChange={handlePlayStateChange}
            notes={notes}
            onUpdateNote={handleUpdateNote}
            onDeleteNote={handleDeleteNote}
            onMoveNote={handleMoveNote}
          />

          {/* Sidebar Toggle Button - positioned on the side and moves with panel */}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className={`fixed top-20 -translate-y-1/2 z-30 bg-neutral-900 hover:bg-neutral-950 text-white p-2 cursor-pointer rounded-l-lg shadow-lg transition-all duration-300 ease-in-out ${
              sidebarOpen ? 'right-80' : 'right-0'
            }`}
            title={sidebarOpen ? 'Hide notes' : 'Show notes'}
          >
            <div className="flex items-center space-x-2">
              {sidebarOpen ? (
                <ChevronRight className="w-4 h-4" />
              ) : (
                <ChevronLeft className="w-4 h-4" />
              )}
              <span className="text-sm font-medium">{notes.length}</span>
            </div>
          </button>

          {/* Collapsible Sidebar */}
          <div className={`fixed right-0 top-8 h-full z-20 transform transition-transform duration-300 ease-in-out ${
            sidebarOpen ? 'translate-x-0' : 'translate-x-full'
          }`}>
            <NotesSidebar
              notes={notes}
              onDeleteNote={handleDeleteNote}
              onJumpToTime={handleJumpToTime}
              onChangeNoteColor={handleChangeNoteColor}
              onUpdateNote={handleUpdateNote}
              currentTime={currentTime}
              isPlaying={isPlaying}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default Home;
