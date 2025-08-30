import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef, useCallback } from 'react';
import WaveSurfer from 'wavesurfer.js';

import { Plus } from 'lucide-react';
import AudioControls from './AudioControls';
import NotesOverlay, { type Note } from './NotesOverlay';

interface WaveformPlayerProps {
  audioFile: File;
  onAddNote: (time: number, canvasX: number, canvasY: number) => void;
  onDurationChange?: (duration: number) => void;
  notes: Note[];
  onUpdateNote: (id: string, content: string) => void;
  onDeleteNote: (id: string) => void;
  onMoveNote?: (id: string, canvasX: number, canvasY: number) => void;
}

export interface WaveformPlayerRef {
  seekToTime: (time: number) => void;
  getCanvasTransform: () => { offsetX: number; offsetY: number; scale: number };
}

interface CanvasTransform {
  offsetX: number;
  offsetY: number;
  scale: number;
}

const WaveformPlayer = forwardRef<WaveformPlayerRef, WaveformPlayerProps>(({
  audioFile,
  onAddNote,
  onDurationChange,
  notes,
  onUpdateNote,
  onDeleteNote,
  onMoveNote
}, ref) => {
  const waveformRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.5);
  const [waveformData, setWaveformData] = useState<number[]>([]);

  // Canvas panning and transform state
  const [transform, setTransform] = useState<CanvasTransform>({ offsetX: 0, offsetY: 150, scale: 1 });
  const [isPanning, setIsPanning] = useState(false);
  const [lastPanPoint, setLastPanPoint] = useState({ x: 0, y: 0 });

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // Add note with 'N' key
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        if (duration > 0) {
          // Create a synthetic mouse event for the handler
          const syntheticEvent = {
            stopPropagation: () => { },
          } as React.MouseEvent;
          handleAddNoteAtCurrentTime(syntheticEvent);
        }
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [duration, currentTime, transform]);

  useEffect(() => {
    if (!waveformRef.current) return;

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

    wavesurferRef.current = wavesurfer;

    // Load audio file
    const audioUrl = URL.createObjectURL(audioFile);
    wavesurfer.load(audioUrl);

    // Event listeners
    wavesurfer.on('ready', () => {
      const audioDuration = wavesurfer.getDuration();
      setDuration(audioDuration);
      onDurationChange?.(audioDuration);

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
      setCurrentTime(wavesurfer.getCurrentTime());
    });

    wavesurfer.on('interaction', () => {
      setCurrentTime(wavesurfer.getCurrentTime());
    });

    wavesurfer.on('play', () => setIsPlaying(true));
    wavesurfer.on('pause', () => setIsPlaying(false));

    return () => {
      wavesurfer.destroy();
      document.body.removeChild(hiddenDiv);
      URL.revokeObjectURL(audioUrl);
    };
  }, [audioFile]);

  // Custom vertical waveform rendering with panning support
  useEffect(() => {
    if (!canvasRef.current || waveformData.length === 0) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas to full container size
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    const width = rect.width;
    const height = rect.height;

    // Apply transform
    ctx.save();
    ctx.translate(transform.offsetX, transform.offsetY);
    ctx.scale(transform.scale, transform.scale);

    ctx.clearRect(-transform.offsetX / transform.scale, -transform.offsetY / transform.scale,
      width / transform.scale, height / transform.scale);

    // Calculate waveform dimensions - make it much taller for vertical scrolling
    const waveformHeight = Math.max(height * 3, duration * 100); // Scale based on duration
    const barHeight = waveformHeight / waveformData.length;
    const waveformWidth = 120;
    const waveformX = (width - waveformWidth) / 2;

    // Draw background for waveform area
    ctx.fillStyle = 'rgb(23, 23, 23, 0.8)';
    ctx.fillRect(waveformX - 10, 0, waveformWidth + 20, waveformHeight);

    // Draw waveform bars
    waveformData.forEach((amplitude, index) => {
      const y = index * barHeight;
      const barWidth = amplitude * waveformWidth * 0.8;
      const progress = duration > 0 ? currentTime / duration : 0;

      // Color based on progress
      const isPlayed = index / waveformData.length < progress;
      ctx.fillStyle = isPlayed ? '#404040' : '#a3a3a3';

      // Draw centered bar
      const x = waveformX + (waveformWidth - barWidth) / 2;
      ctx.fillRect(x, y, barWidth, barHeight - 1);
    });

    // Draw current position indicator
    if (duration > 0) {
      const progress = currentTime / duration;
      const indicatorY = progress * waveformHeight;
      ctx.strokeStyle = '#f3f4f6';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(waveformX - 20, indicatorY);
      ctx.lineTo(waveformX + waveformWidth + 20, indicatorY);
      ctx.stroke();

      // Draw time indicator circle
      ctx.fillStyle = '#f3f4f6';
      ctx.beginPath();
      ctx.arc(waveformX + waveformWidth / 2, indicatorY, 6, 0, 2 * Math.PI);
      ctx.fill();
    }

    // Draw time markers every 5 seconds
    if (duration > 0) {
      ctx.fillStyle = '#737373';
      ctx.font = '24px monospace';
      ctx.textAlign = 'center';

      for (let time = 0; time <= duration; time += 5) {
        const y = (time / duration) * waveformHeight;
        const minutes = Math.floor(time / 60);
        const seconds = Math.floor(time % 60);
        const timeLabel = `${minutes}:${seconds.toString().padStart(2, '0')}`;

        // Draw marker line
        ctx.strokeStyle = '#737373';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(waveformX - 10, y);
        ctx.lineTo(waveformX + 10, y);
        ctx.stroke();

        // Draw time text
        ctx.fillText(timeLabel, waveformX - 50, y + 4);
      }
    }

    ctx.restore();
  }, [waveformData, currentTime, duration, transform]);

  // Mouse event handlers for panning
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button === 0) { // Middle mouse button
      e.preventDefault();
      setIsPanning(true);
      setLastPanPoint({ x: e.clientX, y: e.clientY });
    }

    document.addEventListener(
      'mouseup',
      () => {
        setIsPanning(false);
      },
      { once: true }
    );
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isPanning) {
      e.preventDefault();
      const deltaX = e.clientX - lastPanPoint.x;
      const deltaY = e.clientY - lastPanPoint.y;

      setTransform(prev => ({
        ...prev,
        offsetX: prev.offsetX + deltaX,
        offsetY: prev.offsetY + deltaY
      }));

      setLastPanPoint({ x: e.clientX, y: e.clientY });
    }
  }, [isPanning, lastPanPoint]);


  const handleWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const scaleFactor = e.deltaY > 0 ? 0.9 : 1.1;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    setTransform(prev => {
      const newScale = Math.max(0.1, Math.min(3, prev.scale * scaleFactor)); // Allow more zoom out
      const scaleChange = newScale / prev.scale;

      return {
        scale: newScale,
        offsetX: prev.offsetX - (mouseX - prev.offsetX) * (scaleChange - 1),
        offsetY: prev.offsetY - (mouseY - prev.offsetY) * (scaleChange - 1)
      };
    });
  }, []);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current || duration === 0 || isPanning) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Convert screen coordinates to canvas coordinates
    const canvasX = (x - transform.offsetX) / transform.scale;
    const canvasY = (y - transform.offsetY) / transform.scale;

    // Check if click is within waveform bounds (in canvas space)
    const waveformWidth = 120;
    const waveformX = (rect.width - waveformWidth) / 2; // This matches the canvas drawing
    const waveformLeft = waveformX;
    const waveformRight = waveformX + waveformWidth;

    // Only seek if clicking within the waveform area
    if (canvasX >= waveformLeft && canvasX <= waveformRight) {
      const waveformHeight = Math.max(rect.height * 3, duration * 100);
      const relativeY = canvasY / waveformHeight;
      const time = Math.max(0, Math.min(duration, relativeY * duration));
      handleSeek(time);
    }
  };

  const handleCanvasMouseLeave = () => {
    //
  };

  const handleAddNoteAtCurrentTime = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!canvasRef.current || duration === 0) return;

    const rect = canvasRef.current.getBoundingClientRect();

    // Position note further to the right of the waveform in canvas space
    const waveformWidth = 120;
    const waveformX = (rect.width - waveformWidth) / 2; // This matches the canvas drawing
    const noteCanvasX = waveformX + waveformWidth + 300; // 300px to the right of waveform (more offset)

    // Calculate Y position based on current playback time
    const waveformHeight = Math.max(rect.height * 3, duration * 100);
    const timeProgress = currentTime / duration;
    const noteCanvasY = timeProgress * waveformHeight;

    onAddNote(currentTime, noteCanvasX, noteCanvasY);
  }; const handlePlayPause = () => {
    if (wavesurferRef.current) {
      wavesurferRef.current.playPause();
    }
  };

  const handleSkipBack = () => {
    if (wavesurferRef.current) {
      const currentTime = wavesurferRef.current.getCurrentTime();
      const newPos = Math.max(0, currentTime - 5);
      wavesurferRef.current.seekTo(newPos / duration);
      setCurrentTime(newPos);
    }
  };

  const handleSkipForward = () => {
    if (wavesurferRef.current) {
      const currentTime = wavesurferRef.current.getCurrentTime();
      const newPos = Math.min(duration, currentTime + 5);
      wavesurferRef.current.seekTo(newPos / duration);
      setCurrentTime(newPos);
    }
  };

  const handleSeek = (time: number) => {
    if (wavesurferRef.current && duration > 0) {
      const seekPosition = time / duration;
      wavesurferRef.current.seekTo(seekPosition);
      // Immediately update the current time state for responsive UI
      setCurrentTime(time);
    }
  };

  // Expose methods to parent component
  useImperativeHandle(ref, () => ({
    seekToTime: handleSeek,
    getCanvasTransform: () => transform,
  }));

  const handleVolumeChange = (newVolume: number) => {
    setVolume(newVolume);
    if (wavesurferRef.current) {
      wavesurferRef.current.setVolume(newVolume);
    }
  };

  return (
    <>
      {/* Main content area with waveform */}
      <div className="flex h-screen pb-12">
        {/* Canvas Waveform Container */}
        <div className="flex-1 overflow-hidden bg-neutral-900 relative">
          <div className="absolute inset-0">
            <canvas
              ref={canvasRef}
              className="w-full h-full bg-neutral-800 cursor-grab active:cursor-grabbing"
              onClick={handleCanvasClick}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              // onMouseUp={handleMouseUp}
              onMouseLeave={handleCanvasMouseLeave}
              onWheel={handleWheel}
              onContextMenu={(e) => e.preventDefault()}
              title="Left click waveform to seek • Middle click and drag to pan • Scroll to zoom • Press 'N' to add note"
              style={{ cursor: isPanning ? 'grabbing' : 'grab' }}
            />

            {/* Modern Add Note Button - positioned over waveform center */}
            {duration > 0 && (
              <button
                onClick={handleAddNoteAtCurrentTime}
                className="group absolute bg-neutral-700
                          text-white rounded-full p-3 shadow-xl hover:shadow-2xl transition-all duration-300
                          z-50 add-note-button pointer-events-auto
                          border-2 border-white/20 hover:border-white/40"
                style={{
                  left: '50%',
                  top: '24px',
                  transform: 'translateX(-50%)',
                }}
                title={`Add note at current time (${Math.floor(currentTime / 60)}:${Math.floor(currentTime % 60).toString().padStart(2, '0')}) - Press 'N' key`}
              >
                <Plus className="w-5 h-5 group-hover:rotate-90 transition-transform duration-300" />
                <div className="absolute inset-0 rounded-full
                              opacity-0 group-hover:opacity-20 transition-opacity duration-300 animate-pulse"></div>
              </button>
            )}

            <div ref={waveformRef} className="hidden" />
          </div>

          {/* Notes Overlay positioned relative to the canvas container */}
          <NotesOverlay
            notes={notes}
            onUpdateNote={onUpdateNote}
            onDeleteNote={onDeleteNote}
            onMoveNote={onMoveNote}
            onSeek={handleSeek}
            duration={duration}
            canvasTransform={transform}
          />
        </div>
      </div>

      {/* Sticky Audio Controls */}
      <AudioControls
        isPlaying={isPlaying}
        currentTime={currentTime}
        duration={duration}
        volume={volume}
        onPlayPause={handlePlayPause}
        onSkipBack={handleSkipBack}
        onSkipForward={handleSkipForward}
        onVolumeChange={handleVolumeChange}
        onSeek={handleSeek}
      />
    </>
  );
});

WaveformPlayer.displayName = 'WaveformPlayer';

export default WaveformPlayer;
