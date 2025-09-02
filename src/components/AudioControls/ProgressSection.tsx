import React, { memo } from 'react';
import { useTimeState } from './hooks';
import ProgressBar from './ProgressBar';
import { formatTime } from '@utils/timeUtils';

// Optimized ProgressSection that uses hooks directly to avoid prop drilling
const ProgressSection: React.FC = memo(() => {
  const { currentTime, duration, seekToTime } = useTimeState();

  return (
    <div className="flex-1 flex items-center space-x-4">
      <span className="text-neutral-400 text-sm font-mono text-right min-w-[45px]">
        {formatTime(currentTime)}
      </span>

      <ProgressBar currentTime={currentTime} duration={duration} onSeek={seekToTime} />

      <span className="text-neutral-400 text-sm font-mono min-w-[45px]">
        {formatTime(duration)}
      </span>
    </div>
  );
});

ProgressSection.displayName = 'ProgressSection';

export default ProgressSection;
