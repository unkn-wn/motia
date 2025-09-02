import React, { memo } from 'react';
import { useTimeState } from './hooks';
import { formatTime } from '@utils/timeUtils';

interface TimeDisplayProps {
  currentTime: number;
  duration: number;
}

const TimeDisplay: React.FC<TimeDisplayProps> = memo(({ currentTime, duration }) => {
  return (
    <>
      <span className="text-neutral-400 text-sm font-mono text-right min-w-[45px]">
        {formatTime(currentTime)}
      </span>
      <span className="text-neutral-400 text-sm font-mono min-w-[45px]">
        {formatTime(duration)}
      </span>
    </>
  );
});

TimeDisplay.displayName = 'TimeDisplay';

// Connected version that uses context internally
export const ConnectedTimeDisplay: React.FC = memo(() => {
  const { currentTime, duration } = useTimeState();

  return (
    <TimeDisplay currentTime={currentTime} duration={duration} />
  );
});

ConnectedTimeDisplay.displayName = 'ConnectedTimeDisplay';

export default TimeDisplay;
