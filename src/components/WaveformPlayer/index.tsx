import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef, useCallback } from 'react';
import WaveSurfer from 'wavesurfer.js';
import { useAudio } from '@contexts/AudioContext';
import type { Note, CanvasTransform } from '@types';
import type { DrawingPoint, DrawingSession } from '@types';

// Import refactored components and hooks
import { WaveformProvider } from '@contexts/WaveformContext';
import { WaveformPlayerContent } from './components/WaveformPlayerContent';

export interface WaveformPlayerProps {
  audioFile: File;
  onAddNote: (time: number, canvasX: number, canvasY: number) => void;
  notes: Note[];
  onUpdateNote: (id: string, content: string) => void;
  onDeleteNote: (id: string) => void;
  onMoveNote?: (id: string, canvasX: number, canvasY: number) => void;
  // Drawing props
  isDrawingMode?: boolean;
  onAddDrawing?: (time: number, canvasX: number, canvasY: number, drawing: Note['drawing']) => string;
  onUpdateDrawing?: (id: string, drawing: Note['drawing']) => void;
}

export interface WaveformPlayerRef {
  seekToTime: (time: number) => void;
  getCanvasTransform: () => { offsetX: number; offsetY: number; scale: number };
  playPause: () => void;
  skipBack: () => void;
  skipForward: () => void;
  addNoteAtCurrentTime: () => void;
  volumeUp: () => void;
  volumeDown: () => void;
}

const WaveformPlayer = forwardRef<WaveformPlayerRef, WaveformPlayerProps>(({
  audioFile,
  onAddNote,
  notes,
  onUpdateNote,
  onDeleteNote,
  onMoveNote,
  isDrawingMode = false,
  onAddDrawing,
  onUpdateDrawing
}, ref) => {
  const waveformRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // No local wavesurfer ref needed; the instance is stored in AudioContext via setWavesurferRef

  // Use audio context for shared state
  const {
    currentTime,
    duration,
    setIsPlaying,
    setCurrentTime,
    setDuration,
    setWaveformData,
    setWavesurferRef,
    playPause,
    skipBack,
    skipForward,
    seekToTime,
    volumeUp,
    volumeDown,
    setRecenterToPlayhead,
  } = useAudio();

  // Canvas panning and transform state
  const [transform, setTransform] = useState<CanvasTransform>({ offsetX: 0, offsetY: 150, scale: 1 });
  const [isPanning, setIsPanning] = useState(false);
  const [lastPanPoint, setLastPanPoint] = useState({ x: 0, y: 0 });
  const [isFollowingPlayhead, setIsFollowingPlayhead] = useState(false);
  const transformRef = useRef(transform);

  // Note interaction state
  const [editingNote, setEditingNote] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [dragging, setDragging] = useState<{
    id: string;
    startX: number;
    startY: number;
    initialCanvasX: number;
    initialCanvasY: number;
  } | null>(null);
  const [dragOccurred, setDragOccurred] = useState(false);

  // Context menu and delete-confirm state
  const [contextMenu, setContextMenu] = useState<{ isOpen: boolean; x: number; y: number; noteId: string | null }>({ isOpen: false, x: 0, y: 0, noteId: null });
  const [deleteConfirmNoteId, setDeleteConfirmNoteId] = useState<string | null>(null);

  // Drawing state
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentStroke, setCurrentStroke] = useState<DrawingPoint[]>([]);
  const [drawingStartPos, setDrawingStartPos] = useState<{ x: number; y: number } | null>(null);
  const [drawingSession, setDrawingSession] = useState<DrawingSession | null>(null);
  const [drawingNoteId, setDrawingNoteId] = useState<string | null>(null);

  // Note interaction constants
  const NOTE_LABEL_HIDE_THRESHOLD = 0;

  // Initialize WaveSurfer
  useEffect(() => {
    if (!waveformRef.current) return;

  // Show loading overlay via duration===0 until wavesurfer is ready

    // Create a hidden wavesurfer for audio processing
    const hiddenDiv = document.createElement('div');
    hiddenDiv.style.position = 'absolute';
    hiddenDiv.style.left = '-9999px';
    document.body.appendChild(hiddenDiv);

    const wavesurfer = WaveSurfer.create({
      container: hiddenDiv,
      waveColor: '#6b7280',
      progressColor: '#9ca3af',
      cursorColor: '#f3f4f6',
      barWidth: 2,
      height: 100,
      normalize: true,
      backend: 'WebAudio',
      interact: false,
    });

    setWavesurferRef(wavesurfer);

    // Load audio file
    const audioUrl = URL.createObjectURL(audioFile);
    wavesurfer.load(audioUrl);

    // Event listeners
  wavesurfer.on('ready', () => {
      const audioDuration = wavesurfer.getDuration();
      setDuration(audioDuration);

      // Extract waveform data for custom rendering
      try {
        const decodedData = wavesurfer.getDecodedData();
        if (decodedData) {
          const data = decodedData.getChannelData(0);
          const duration = wavesurfer.getDuration();
          // Scale samples based on duration (more samples for longer audio)
          const samples = Math.min(2000, Math.max(500, Math.floor(duration * 50)));
          const blockSize = Math.floor(data.length / samples);
          const filteredData = [];

          for (let i = 0; i < samples; i++) {
            let sum = 0;
            for (let j = 0; j < blockSize; j++) {
              sum += Math.abs(data[i * blockSize + j] || 0);
            }
            filteredData.push(sum / blockSize);
          }

          setWaveformData(filteredData);
        }
      } catch (error) {
        console.warn('Could not extract waveform data:', error);
        // Fallback: create dummy waveform data
        const dummyData = Array.from({ length: 1000 }, () => Math.random() * 0.5);
        setWaveformData(dummyData);
      }
    });

    wavesurfer.on('audioprocess', () => {
      const time = wavesurfer.getCurrentTime();
      setCurrentTime(time);
    });

    wavesurfer.on('interaction', () => {
      const time = wavesurfer.getCurrentTime();
      setCurrentTime(time);
    });

    wavesurfer.on('play', () => {
      setIsPlaying(true);
    });
    wavesurfer.on('pause', () => {
      setIsPlaying(false);
    });

  return () => {
      wavesurfer.destroy();
      document.body.removeChild(hiddenDiv);
      URL.revokeObjectURL(audioUrl);
    };
  }, [audioFile, setDuration, setWaveformData, setCurrentTime, setIsPlaying, setWavesurferRef]);

  // Keep transformRef in sync with transform state
  useEffect(() => {
    transformRef.current = transform;
  }, [transform]);

  // Follow playhead effect - continuously update transform when following is enabled
  useEffect(() => {
    if (!isFollowingPlayhead || !canvasRef.current || duration === 0) return;

    const canvas = canvasRef.current;
    const canvasHeight = canvas.getBoundingClientRect().height;

    // Calculate where the playhead should be in canvas coordinates
    const timeProgress = currentTime / duration;
    const baseWaveformHeight = Math.max(canvasHeight * 3, duration * 100);
    const scaledWaveformHeight = baseWaveformHeight * transform.scale;
    const targetPlayheadY = timeProgress * scaledWaveformHeight;
    const playheadPositionY = canvasHeight * 0.33; // Position at 33% from top

    setTransform(prev => ({
      offsetX: prev.offsetX, // Don't change X position
      offsetY: playheadPositionY - targetPlayheadY, // Keep playhead centered
      scale: prev.scale // Maintain current zoom level
    }));
  }, [currentTime, duration, transform.scale, isFollowingPlayhead, canvasRef, setTransform]);

  const handleAddNoteAtCurrentTime = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (!canvasRef.current || duration === 0) return;

    const rect = canvasRef.current.getBoundingClientRect();

    // Position note further to the right of the waveform in canvas space
    const waveformWidth = 120;
    const waveformX = (rect.width - waveformWidth) / 2;
    const noteCanvasX = waveformX + waveformWidth + 150;

    // Calculate Y position based on current playback time
    const waveformHeight = Math.max(rect.height * 3, duration * 100);
    const timeProgress = currentTime / duration;
    const noteCanvasY = timeProgress * waveformHeight;

    onAddNote(currentTime, noteCanvasX, noteCanvasY);

    // Small delay to allow React to update the notes array before enabling interactions
    setTimeout(() => {
      setDragOccurred(false);
    }, 50);
  }, [canvasRef, duration, currentTime, onAddNote, setDragOccurred]);

  const handleRecenterToPlayhead = useCallback(() => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const canvasHeight = canvas.height;

    // Calculate where the playhead should be in canvas coordinates (accounting for current zoom)
    const timeProgress = duration > 0 ? currentTime / duration : 0;
    const baseWaveformHeight = Math.max(canvasHeight * 3, duration * 100);
    const scaledWaveformHeight = baseWaveformHeight * transform.scale;
    const targetPlayheadY = timeProgress * scaledWaveformHeight;
    const playheadPositionY = canvasHeight * 0.33; // Position at 33% from top

    setTransform(prev => ({
      offsetX: prev.offsetX, // Don't change X position - preserve user's horizontal view
      offsetY: playheadPositionY - targetPlayheadY, // Position playhead at desired Y position
      scale: prev.scale // Maintain current zoom level
    }));

    // Enable playhead following mode
    setIsFollowingPlayhead(true);
  }, [currentTime, duration, transform.scale, setTransform, setIsFollowingPlayhead]);

  // Register the recenter function with the context
  useEffect(() => {
    setRecenterToPlayhead(handleRecenterToPlayhead);
  }, [setRecenterToPlayhead, handleRecenterToPlayhead]);

  // Expose methods to parent component
  useImperativeHandle(ref, () => ({
    seekToTime: seekToTime,
    getCanvasTransform: () => transform,
    playPause: playPause,
    skipBack: skipBack,
    skipForward: skipForward,
    addNoteAtCurrentTime: () => {
      const syntheticEvent = {
        stopPropagation: () => { },
      } as React.MouseEvent;
      handleAddNoteAtCurrentTime(syntheticEvent);
    },
    volumeUp: volumeUp,
    volumeDown: volumeDown,
  }));

  // Create context value
  const contextValue = {
    // Canvas state
    transform,
    setTransform,

    // Interaction state
    isPanning,
    setIsPanning,
    lastPanPoint,
    setLastPanPoint,
    isFollowingPlayhead,
    setIsFollowingPlayhead,

    // Note state
    notes,
    editingNote,
    setEditingNote,
    editContent,
    setEditContent,
    dragging,
    setDragging,
    dragOccurred,
    setDragOccurred,

    // Drawing state
    isDrawingMode,
    isDrawing,
    setIsDrawing,
    currentStroke,
    setCurrentStroke,
    drawingStartPos,
    setDrawingStartPos,
    drawingSession,
    setDrawingSession,
    drawingNoteId,
    setDrawingNoteId,

    // Event handlers
    onAddNote,
    onUpdateNote,
    onDeleteNote,
    onMoveNote,
    onAddDrawing,
    onUpdateDrawing,

    // Refs
    canvasRef,

    // Constants
    NOTE_LABEL_HIDE_THRESHOLD,

    // Context menu
    contextMenu,
    setContextMenu,

    // Delete confirmation
    deleteConfirmNoteId,
    setDeleteConfirmNoteId,
  };

  return (
    <WaveformProvider value={contextValue}>
      {/* Main content area with waveform */}
      <div className="flex h-screen pb-12">
        {/* Canvas Waveform Container */}
        <div className="flex-1 overflow-hidden bg-neutral-900 relative rounded-2xl">
          <div className="absolute inset-0">
            <WaveformPlayerContent />
            <div ref={waveformRef} className="hidden" />
            {/* Loading overlay - shows until audio duration known */}
            {duration === 0 && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-[1px]">
                <div className="flex items-center space-x-3 text-neutral-200 text-sm">
                  <div className="h-2 w-2 rounded-full bg-neutral-300 animate-bounce [animation-delay:-0.2s]" />
                  <div className="h-2 w-2 rounded-full bg-neutral-300 animate-bounce" />
                  <div className="h-2 w-2 rounded-full bg-neutral-300 animate-bounce [animation-delay:0.2s]" />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </WaveformProvider>
  );
});

WaveformPlayer.displayName = 'WaveformPlayer';

export default WaveformPlayer;
