import React, { memo } from 'react';
import { useAudio } from '@/contexts/objects/AudioContextObject';
import { formatTime } from '@utils/timeUtils';

interface TimeDisplayProps {
  currentTime: number;
  duration: number;
  trimStart?: number;
  trimEnd?: number;
}

const TimeDisplay: React.FC<TimeDisplayProps> = memo(({ currentTime, duration, trimStart = 0, trimEnd }) => {
  const effectiveTrimEnd = trimEnd || duration;
  const effectiveDuration = effectiveTrimEnd - trimStart;
  const relativeTime = Math.max(0, currentTime - trimStart);
  
  return (
    <>
      <span className="text-neutral-400 text-sm font-mono text-right min-w-[45px]">
        {formatTime(relativeTime)}
      </span>
      <span className="text-neutral-400 text-sm font-mono min-w-[45px]">
        {formatTime(effectiveDuration)}
      </span>
    </>
  );
});

TimeDisplay.displayName = 'TimeDisplay';

// Connected version that uses context internally
export const ConnectedTimeDisplay: React.FC = memo(() => {
  const { currentTime, duration, trimStart, trimEnd } = useAudio();

  return (
    <TimeDisplay currentTime={currentTime} duration={duration} trimStart={trimStart} trimEnd={trimEnd} />
  );
});

ConnectedTimeDisplay.displayName = 'ConnectedTimeDisplay';

export default TimeDisplay;
