import React from 'react';
import { Play, Pause, SkipBack, SkipForward, Volume2, Target } from 'lucide-react';

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
  onRecenterToPlayhead?: () => void;
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
  onRecenterToPlayhead,
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

  // Keyboard controls are now handled centrally in home.tsx via the shortcuts system

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-neutral-900/50 backdrop-blur-xs border-neutral-700 z-30">
      <div className="max-w-6xl mx-auto px-4 pb-3 pt-2">
        {/* Modern compact layout */}
        <div className="flex items-center space-x-4">
          {/* Playback Controls */}
          <div className="flex items-center space-x-2">
            <button
              onClick={onSkipBack}
              className="p-2 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-lg cursor-pointer transition-all"
              title="Skip back 5s (←)"
            >
              <SkipBack className="w-4 h-4" />
            </button>

            <button
              onClick={onPlayPause}
              className="p-3 bg-neutral-800 hover:bg-neutral-700 text-white rounded-full cursor-pointer transition-all shadow-lg"
              title="Play/Pause (Space)"
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            </button>

            <button
              onClick={onSkipForward}
              className="p-2 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-lg cursor-pointer transition-all"
              title="Skip forward 5s (→)"
            >
              <SkipForward className="w-4 h-4" />
            </button>

            {onRecenterToPlayhead && (
              <button
                onClick={onRecenterToPlayhead}
                className="p-2 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-lg cursor-pointer transition-all"
                title="Recenter view to playhead"
              >
                <Target className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Progress Bar - takes up most space */}
          <div className="flex-1 flex items-center space-x-4">
            <span className="text-neutral-400 text-sm font-mono text-right min-w-[45px]">
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
                className="w-full h-2 bg-neutral-700 rounded-full appearance-none -translate-y-0.5 cursor-pointer
                           [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4
                           [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:cursor-pointer
                           [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-neutral-900
                           [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4
                           [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:cursor-pointer
                           [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-neutral-900 [&::-moz-range-thumb]:shadow-lg
                           [&::-moz-range-track]:bg-neutral-700 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:h-2"
                style={{
                  background: `linear-gradient(to right, #737373 0%, #737373 ${(currentTime / (duration || 1)) * 100}%, #27272a ${(currentTime / (duration || 1)) * 100}%, #27272a 100%)`
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
                background: `linear-gradient(to right, #737373 0%, #737373 ${volume * 100}%, #27272a ${volume * 100}%, #27272a 100%)`
              }}
            />
            <span className="text-neutral-400 text-sm font-mono w-10 text-left">
              {Math.round(volume * 100)}%
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AudioControls;
