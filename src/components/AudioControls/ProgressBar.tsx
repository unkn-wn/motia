import React, { useCallback, useRef, useState } from 'react';
import { useAudio } from '@/contexts/objects/AudioContextObject';

interface ProgressBarProps {
  currentTime: number;
  duration: number;
  onSeek: (time: number) => void;
  trimStart?: number;
  trimEnd?: number;
}

// No memo here - needs to update on every currentTime change for smooth progress bar
const ProgressBar: React.FC<ProgressBarProps> = ({ currentTime, duration, onSeek, trimStart = 0, trimEnd }) => {
  const effectiveTrimEnd = trimEnd || duration;
  const effectiveDuration = effectiveTrimEnd - trimStart;
  const relativeTime = Math.max(0, currentTime - trimStart);
  
  // Track if user is actively dragging - use ref to avoid re-renders
  const isDraggingRef = useRef(false);
  const [localValue, setLocalValue] = useState<number | null>(null);
  
  const handleProgressChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const relativeValue = parseFloat(e.target.value);
    setLocalValue(relativeValue); // Store locally while dragging
    const absoluteTime = trimStart + relativeValue;
    onSeek(absoluteTime);
  }, [onSeek, trimStart]);

  const handleMouseDown = useCallback(() => {
    isDraggingRef.current = true;
  }, []);

  const handleMouseUp = useCallback(() => {
    isDraggingRef.current = false;
    setLocalValue(null); // Clear local value when done dragging
  }, []);

  // Use local value while dragging, otherwise use prop value
  const displayValue = isDraggingRef.current && localValue !== null ? localValue : relativeTime;
  const progressPercentage = effectiveDuration > 0 ? (displayValue / effectiveDuration) * 100 : 0;

  return (
    <div className="flex-1">
      <input
        id="playback-progress"
        type="range"
        min="0"
        max={effectiveDuration || 0}
        step="0.1"
        value={displayValue}
        onChange={handleProgressChange}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onTouchStart={handleMouseDown}
        onTouchEnd={handleMouseUp}
        className="w-full h-3 md:h-2 bg-neutral-700 rounded-full appearance-none md:-translate-y-0.5 cursor-pointer
                   [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 md:[&::-webkit-slider-thumb]:h-4 md:[&::-webkit-slider-thumb]:w-4
                   [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:cursor-pointer
                   [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-neutral-900
                   [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-5 md:[&::-moz-range-thumb]:h-4 md:[&::-moz-range-thumb]:w-4
                   [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:cursor-pointer
                   [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-neutral-900 [&::-moz-range-thumb]:shadow-lg
                   [&::-moz-range-track]:bg-neutral-700 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:h-2"
        style={{
          background: `linear-gradient(to right, #737373 0%, #737373 ${progressPercentage}%, #27272a ${progressPercentage}%, #27272a 100%)`
        }}
      />
    </div>
  );
};

ProgressBar.displayName = 'ProgressBar';

// Connected version uses memo since it only re-renders when context values change
export const ConnectedProgressBar: React.FC = () => {
  const { currentTime, duration, seekToTime, trimStart, trimEnd } = useAudio();

  return (
    <ProgressBar
      currentTime={currentTime}
      duration={duration}
      onSeek={seekToTime}
      trimStart={trimStart}
      trimEnd={trimEnd}
    />
  );
};

ConnectedProgressBar.displayName = 'ConnectedProgressBar';

export default ProgressBar;
