import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef, useCallback } from 'react';
import WaveSurfer from 'wavesurfer.js';

import AudioControls from './AudioControls';
import NotesOverlay from './NotesOverlay';
import type { Note } from '../types';
import type { CanvasTransform } from '../types';

interface WaveformPlayerProps {
  audioFile: File;
  onAddNote: (time: number, canvasX: number, canvasY: number) => void;
  onCurrentTimeChange?: (time: number) => void;
  onPlayStateChange?: (isPlaying: boolean) => void;
  notes: Note[];
  onUpdateNote: (id: string, content: string) => void;
  onDeleteNote: (id: string) => void;
  onMoveNote?: (id: string, canvasX: number, canvasY: number) => void;
  // Drawing props
  isDrawingMode?: boolean;
  onAddDrawing?: (time: number, canvasX: number, canvasY: number, drawing: Note['drawing']) => void;
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
  onCurrentTimeChange,
  onPlayStateChange,
  notes,
  onUpdateNote,
  onDeleteNote,
  onMoveNote,
  isDrawingMode = false,
  onAddDrawing
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
  const [isFollowingPlayhead, setIsFollowingPlayhead] = useState(false);

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
      onCurrentTimeChange?.(time);
    });

    wavesurfer.on('interaction', () => {
      const time = wavesurfer.getCurrentTime();
      setCurrentTime(time);
      onCurrentTimeChange?.(time);
    });

    wavesurfer.on('play', () => {
      setIsPlaying(true);
      onPlayStateChange?.(true);
    });
    wavesurfer.on('pause', () => {
      setIsPlaying(false);
      onPlayStateChange?.(false);
    });

    return () => {
      wavesurfer.destroy();
      document.body.removeChild(hiddenDiv);
      URL.revokeObjectURL(audioUrl);
    };
  }, [audioFile]);

  // Effect to follow playhead when in following mode
  useEffect(() => {
    if (!isFollowingPlayhead || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const canvasHeight = canvas.height;

    // Calculate where the playhead should be in canvas coordinates (accounting for zoom)
    const timeProgress = duration > 0 ? currentTime / duration : 0;
    const baseWaveformHeight = Math.max(canvasHeight * 3, duration * 100);
    const scaledWaveformHeight = baseWaveformHeight * transform.scale;
    const targetPlayheadY = timeProgress * scaledWaveformHeight;
    const playheadPositionY = canvasHeight * 0.33; // Keep at 33% from top

    setTransform(prev => ({
      offsetX: prev.offsetX, // Don't change X position - let user control horizontal panning
      offsetY: playheadPositionY - targetPlayheadY, // Follow playhead vertically only
      scale: prev.scale // Maintain zoom level
    }));
  }, [currentTime, duration, isFollowingPlayhead, transform.scale]);

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
      ctx.fillStyle = isPlayed ? '#a3a3a3' : '#404040';

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
    if (e.button === 0) { // Left mouse button
      e.preventDefault();
      setIsPanning(true);
      setLastPanPoint({ x: e.clientX, y: e.clientY });
      // Disable playhead following when user starts panning
      setIsFollowingPlayhead(false);
    }

    const handleMouseUp = () => {
      setIsPanning(false);
    };

    document.addEventListener('mouseup', handleMouseUp, { once: true });
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


  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.cancelable && e.preventDefault();
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

  const handleAddNoteAtCurrentTime = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!canvasRef.current || duration === 0) return;

    const rect = canvasRef.current.getBoundingClientRect();

    // Position note further to the right of the waveform in canvas space
    const waveformWidth = 120;
    const waveformX = (rect.width - waveformWidth) / 2; // This matches the canvas drawing
    const noteCanvasX = waveformX + waveformWidth + 150; // 150px to the right of waveform (more offset)

    // Calculate Y position based on current playback time
    const waveformHeight = Math.max(rect.height * 3, duration * 100);
    const timeProgress = currentTime / duration;
    const noteCanvasY = timeProgress * waveformHeight;

    onAddNote(currentTime, noteCanvasX, noteCanvasY);
  };

  const handlePlayPause = () => {
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
      onCurrentTimeChange?.(newPos);
    }
  };

  const handleSkipForward = () => {
    if (wavesurferRef.current) {
      const currentTime = wavesurferRef.current.getCurrentTime();
      const newPos = Math.min(duration, currentTime + 5);
      wavesurferRef.current.seekTo(newPos / duration);
      setCurrentTime(newPos);
      onCurrentTimeChange?.(newPos);
    }
  };

  const handleSeek = (time: number) => {
    if (wavesurferRef.current && duration > 0) {
      const seekPosition = time / duration;
      wavesurferRef.current.seekTo(seekPosition);
      // Immediately update the current time state for responsive UI
      setCurrentTime(time);
      onCurrentTimeChange?.(time);
    }
  };

  const handleRecenterToPlayhead = () => {
    if (!wavesurferRef.current || !canvasRef.current) return;

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
  };

  // Expose methods to parent component
  useImperativeHandle(ref, () => ({
    seekToTime: handleSeek,
    getCanvasTransform: () => transform,
    playPause: handlePlayPause,
    skipBack: handleSkipBack,
    skipForward: handleSkipForward,
    addNoteAtCurrentTime: () => {
      // Create a synthetic event for the handler
      const syntheticEvent = {
        stopPropagation: () => {},
      } as React.MouseEvent;
      handleAddNoteAtCurrentTime(syntheticEvent);
    },
    volumeUp: () => {
      const newVolume = Math.min(1, volume + 0.1);
      handleVolumeChange(newVolume);
    },
    volumeDown: () => {
      const newVolume = Math.max(0, volume - 0.1);
      handleVolumeChange(newVolume);
    },
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
              className="w-full h-full bg-neutral-800 cursor-grab active:cursor-grabbing touch-none"
              onClick={handleCanvasClick}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onWheel={handleWheel}
              onContextMenu={(e) => e.preventDefault()}
              style={{ cursor: isPanning ? 'grabbing' : 'grab' }}
            />

            {/* Modern Add Note Button - positioned over waveform center */}
            {/* Note: Add Note button moved to FloatingDock component for better organization */}

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
            onWheel={handleWheel}
            isDrawingMode={isDrawingMode}
            onAddDrawing={onAddDrawing}
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
        onRecenterToPlayhead={handleRecenterToPlayhead}
      />
    </>
  );
});

WaveformPlayer.displayName = 'WaveformPlayer';

export default WaveformPlayer;
