import { useState, useCallback, useRef } from 'react';
import { Edit3 } from 'lucide-react';
import FileUploader from './components/FileUploader';
import WaveformPlayer, { type WaveformPlayerRef } from './components/WaveformPlayer';
import NotesSidebar from './components/NotesSidebar';
import type { Note } from './components/NotesOverlay';
import './style.css';

function Home() {
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [notes, setNotes] = useState<Note[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const waveformPlayerRef = useRef<WaveformPlayerRef>(null);

  const handleFileSelect = useCallback(async (file: File) => {
    setIsLoading(true);
    // Simulate processing time
    await new Promise(resolve => setTimeout(resolve, 1000));
    setAudioFile(file);
    setIsLoading(false);
  }, []);

  const handleAddNote = useCallback((time: number, canvasX: number, canvasY: number) => {
    const newNote: Note = {
      id: `note_${Date.now()}_${Math.random()}`,
      time,
      canvasX,
      canvasY,
      content: '',
      color: 'blue', // Default consistent color - users can change later
      createdAt: new Date(),
    };

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

  const handleDurationChange = useCallback((newDuration: number) => {
    // Duration is used for waveform calculations, but we don't need to store it in state
    // since the WaveformPlayer manages it internally
    console.log('Audio duration:', newDuration);
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
            onDurationChange={handleDurationChange}
            notes={notes}
            onUpdateNote={handleUpdateNote}
            onDeleteNote={handleDeleteNote}
            onMoveNote={handleMoveNote}
          />

          {/* Sidebar Toggle Button */}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="fixed top-4 right-4 z-30 bg-neutral-700 hover:bg-neutral-600 text-white p-3 rounded-lg shadow-lg transition-all"
            title={sidebarOpen ? 'Hide notes' : 'Show notes'}
          >
            <div className="flex items-center space-x-2">
              <Edit3 className="w-5 h-5" />
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
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default Home;
