import React, { memo, useCallback } from 'react';
import { useTimeState } from './hooks';

interface ProgressBarProps {
  currentTime: number;
  duration: number;
  onSeek: (time: number) => void;
}

const ProgressBar: React.FC<ProgressBarProps> = memo(({ currentTime, duration, onSeek }) => {
  const handleProgressChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = parseFloat(e.target.value);
    onSeek(newTime);
  }, [onSeek]);

  const progressPercentage = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
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
          background: `linear-gradient(to right, #737373 0%, #737373 ${progressPercentage}%, #27272a ${progressPercentage}%, #27272a 100%)`
        }}
      />
    </div>
  );
});

ProgressBar.displayName = 'ProgressBar';

// Connected version that uses context internally
export const ConnectedProgressBar: React.FC = memo(() => {
  const { currentTime, duration, seekToTime } = useTimeState();

  return (
    <ProgressBar
      currentTime={currentTime}
      duration={duration}
      onSeek={seekToTime}
    />
  );
});

ConnectedProgressBar.displayName = 'ConnectedProgressBar';

export default ProgressBar;
