import React, { memo } from 'react';
import { useTimeState } from './hooks';
import ProgressBar from './ProgressBar';
import { formatTime } from '@utils/timeUtils';

// Optimized ProgressSection that uses hooks directly to avoid prop drilling
const ProgressSection: React.FC = memo(() => {
  const { currentTime, duration, seekToTime } = useTimeState();

  return (
    <div className="flex-1 flex items-center gap-3 min-w-0 w-full">
      <span className="text-neutral-400 text-xs md:text-sm font-mono text-right min-w-[42px]">
        {formatTime(currentTime)}
      </span>

      <div className="flex-1 min-w-0 w-full">
        <ProgressBar currentTime={currentTime} duration={duration} onSeek={seekToTime} />
      </div>

      <span className="text-neutral-400 text-xs md:text-sm font-mono min-w-[42px] text-right">
        {formatTime(duration)}
      </span>
    </div>
  );
});

ProgressSection.displayName = 'ProgressSection';

export default ProgressSection;
