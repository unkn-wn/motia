import { useState, useRef, useCallback } from 'react';
import { Music, Sparkles, Menu } from 'lucide-react';
import FileUploader from './components/FileUploader';
import WaveformPlayer from './components/WaveformPlayer';
import NotesOverlay from './components/NotesOverlay';
import type { Note } from './components/NotesOverlay';
import NotesSidebar from './components/NotesSidebar';
import './style.css';

function Home() {
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [notes, setNotes] = useState<Note[]>([]);
  const [showSidebar, setShowSidebar] = useState(true);
  const waveformContainerRef = useRef<HTMLDivElement>(null);

  const handleFileSelect = useCallback(async (file: File) => {
    setIsLoading(true);
    // Simulate processing time
    await new Promise(resolve => setTimeout(resolve, 1000));
    setAudioFile(file);
    setIsLoading(false);
  }, []);

  const handleAddNote = useCallback((time: number, x: number, y: number) => {
    const colors = ['yellow', 'blue', 'green', 'pink', 'purple'];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];

    const newNote: Note = {
      id: `note_${Date.now()}_${Math.random()}`,
      time,
      x,
      y,
      content: '',
      color: randomColor,
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

  const handleChangeNoteColor = useCallback((id: string, color: string) => {
    setNotes(prev => prev.map(note =>
      note.id === id ? { ...note, color } : note
    ));
  }, []);

  const handleJumpToTime = useCallback((time: number) => {
    // This would be implemented to seek the waveform to the specific time
    console.log('Jump to time:', time);
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-gradient-to-r from-purple-600 to-indigo-600 rounded-lg">
                <Sparkles className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">Spark</h1>
                <p className="text-sm text-gray-500">Music Annotation Studio</p>
              </div>
            </div>

            {audioFile && (
              <button
                onClick={() => setShowSidebar(!showSidebar)}
                className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <Menu className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="flex h-[calc(100vh-4rem)]">
        {/* Main Content */}
        <div className="flex-1 overflow-hidden">
          <div className="h-full p-6">
            {!audioFile ? (
              <div className="h-full flex items-center justify-center">
                <div className="text-center space-y-8">
                  <div>
                    <h2 className="text-3xl font-bold text-gray-900 mb-2">
                      Welcome to Spark
                    </h2>
                    <p className="text-lg text-gray-600 max-w-2xl mx-auto">
                      Upload your music and start annotating with visual notes.
                      Perfect for music producers, content creators, and anyone who wants to
                      organize their musical ideas.
                    </p>
                  </div>

                  <FileUploader
                    onFileSelect={handleFileSelect}
                    isLoading={isLoading}
                  />

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto text-center">
                    <div className="p-6 bg-white rounded-xl shadow-sm">
                      <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Music className="w-6 h-6 text-purple-600" />
                      </div>
                      <h3 className="font-semibold text-gray-900 mb-2">Upload Audio</h3>
                      <p className="text-sm text-gray-600">
                        Support for all major audio formats including MP3, WAV, and M4A
                      </p>
                    </div>

                    <div className="p-6 bg-white rounded-xl shadow-sm">
                      <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Sparkles className="w-6 h-6 text-blue-600" />
                      </div>
                      <h3 className="font-semibold text-gray-900 mb-2">Visual Waveform</h3>
                      <p className="text-sm text-gray-600">
                        Interactive waveform visualization with precise timeline control
                      </p>
                    </div>

                    <div className="p-6 bg-white rounded-xl shadow-sm">
                      <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Menu className="w-6 h-6 text-green-600" />
                      </div>
                      <h3 className="font-semibold text-gray-900 mb-2">Smart Notes</h3>
                      <p className="text-sm text-gray-600">
                        Click anywhere on the waveform to add time-stamped notes and ideas
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="h-full flex flex-col space-y-6">
                {/* File Info */}
                <div className="bg-white rounded-xl shadow-sm p-4">
                  <div className="flex items-center space-x-3">
                    <div className="p-2 bg-purple-100 rounded-lg">
                      <Music className="w-5 h-5 text-purple-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">{audioFile.name}</h3>
                      <p className="text-sm text-gray-500">
                        {(audioFile.size / (1024 * 1024)).toFixed(2)} MB
                      </p>
                    </div>
                  </div>
                </div>

                {/* Waveform and Notes */}
                <div className="flex-1 relative" ref={waveformContainerRef}>
                  <WaveformPlayer
                    audioFile={audioFile}
                    onAddNote={handleAddNote}
                  />
                  <NotesOverlay
                    notes={notes}
                    onUpdateNote={handleUpdateNote}
                    onDeleteNote={handleDeleteNote}
                    containerWidth={waveformContainerRef.current?.offsetWidth || 800}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        {audioFile && showSidebar && (
          <NotesSidebar
            notes={notes}
            onDeleteNote={handleDeleteNote}
            onJumpToTime={handleJumpToTime}
            onChangeNoteColor={handleChangeNoteColor}
          />
        )}
      </div>
    </div>
  );
}

export default Home;
