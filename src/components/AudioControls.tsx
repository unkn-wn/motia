import React, { useEffect, useCallback } from 'react';
import { Play, Pause, SkipBack, SkipForward, Volume2 } from 'lucide-react';

interface AudioControlsProps {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  onPlayPause: () => void;
  onSkipBack: () => void;
  onSkipForward: () => void;
  onVolumeChange: (volume: number) => void;
  onSeek: (time: number) => void;
}

const AudioControls: React.FC<AudioControlsProps> = ({
  isPlaying,
  currentTime,
  duration,
  volume,
  onPlayPause,
  onSkipBack,
  onSkipForward,
  onVolumeChange,
  onSeek,
}) => {
  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const handleProgressChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = parseFloat(e.target.value);
    onSeek(newTime);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.target.value);
    onVolumeChange(newVolume);
  };

  // Keyboard controls
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Prevent default behavior if the target is not an input/textarea
    if ((e.target instanceof HTMLInputElement && e.target.type !== "range") || e.target instanceof HTMLTextAreaElement) {
      return;
    }

    switch (e.code) {
      case 'Space':
        e.preventDefault();
        onPlayPause();
        break;
      case 'ArrowLeft':
        e.preventDefault();
        onSkipBack();
        break;
      case 'ArrowRight':
        e.preventDefault();
        onSkipForward();
        break;
      case 'ArrowUp':
        e.preventDefault();
        onVolumeChange(Math.min(1, volume + 0.1));
        break;
      case 'ArrowDown':
        e.preventDefault();
        onVolumeChange(Math.max(0, volume - 0.1));
        break;
    }
  }, [onPlayPause, onSkipBack, onSkipForward, onVolumeChange, volume]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-neutral-900/50 backdrop-blur-xs border-neutral-700 z-30">
      <div className="max-w-6xl mx-auto px-4 pb-3 pt-2">
        {/* Modern compact layout */}
        <div className="flex items-center space-x-4">
          {/* Playback Controls */}
          <div className="flex items-center space-x-2">
            <button
              onClick={onSkipBack}
              className="p-2 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-lg transition-all"
              title="Skip back 5s (←)"
            >
              <SkipBack className="w-4 h-4" />
            </button>

            <button
              onClick={onPlayPause}
              className="p-3 bg-neutral-700 hover:bg-neutral-600 text-white rounded-full transition-all shadow-lg"
              title="Play/Pause (Space)"
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            </button>

            <button
              onClick={onSkipForward}
              className="p-2 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-lg transition-all"
              title="Skip forward 5s (→)"
            >
              <SkipForward className="w-4 h-4" />
            </button>
          </div>

          {/* Progress Bar - takes up most space */}
          <div className="flex-1 flex items-center space-x-4">
            <span className="text-neutral-400 text-sm font-mono min-w-[45px]">
              {formatTime(currentTime)}
            </span>

            <div className="flex-1">
              <input
                id="playback-progress"
                type="range"
                min="0"
                max={duration || 0}
                step="0.1"
                value={currentTime}
                onChange={handleProgressChange}
                className="w-full h-2 bg-neutral-700 rounded-full appearance-none cursor-pointer
                           [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4
                           [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:cursor-pointer
                           [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-neutral-900
                           [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4
                           [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:cursor-pointer
                           [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-neutral-900 [&::-moz-range-thumb]:shadow-lg
                           [&::-moz-range-track]:bg-neutral-700 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:h-2"
                style={{
                  background: `linear-gradient(to right, #6b7280 0%, #6b7280 ${(currentTime / (duration || 1)) * 100}%, #374151 ${(currentTime / (duration || 1)) * 100}%, #374151 100%)`
                }}
              />
            </div>

            <span className="text-neutral-400 text-sm font-mono min-w-[45px]">
              {formatTime(duration)}
            </span>
          </div>

          {/* Volume Control */}
          <div className="flex items-center space-x-3">
            <Volume2 className="w-4 h-4 text-neutral-400" />
            <input
              id="volume-control"
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={volume}
              onChange={handleVolumeChange}
              className="w-20 h-2 bg-neutral-700 rounded-full appearance-none cursor-pointer
                         [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3
                         [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:cursor-pointer
                         [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-neutral-900
                         [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:w-3
                         [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:cursor-pointer
                         [&::-moz-range-thumb]:border [&::-moz-range-thumb]:border-neutral-900 [&::-moz-range-thumb]:shadow-md
                         [&::-moz-range-track]:bg-neutral-700 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:h-2"
              title="Volume (↑/↓)"
              style={{
                background: `linear-gradient(to right, #6b7280 0%, #6b7280 ${volume * 100}%, #374151 ${volume * 100}%, #374151 100%)`
              }}
            />
            <span className="text-neutral-400 text-sm font-mono w-10 text-right">
              {Math.round(volume * 100)}%
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AudioControls;
