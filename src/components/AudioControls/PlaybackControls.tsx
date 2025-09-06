import React, { memo, useSyncExternalStore } from 'react';
import { usePlaybackContext } from '@contexts/objects/AudioControlsContextObject';
import { isPlayingStore } from './state';
import {
  PlayIcon,
  PauseIcon,
  SkipBackIcon,
  SkipForwardIcon,
  TargetIcon
} from '@assets/icons';

// Optimized PlaybackControls that uses hooks directly to avoid prop drilling
const PlaybackControls: React.FC = memo(() => {
  const { playPause, skipBack, skipForward, recenterToPlayhead } = usePlaybackContext();
  const isPlaying = useSyncExternalStore(isPlayingStore.subscribe, isPlayingStore.getSnapshot);

  return (
    <div className="flex items-center space-x-2">
      <button
        onClick={skipBack}
        className="p-2 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-lg cursor-pointer transition-all"
        title="Skip back 5s"
      >
        <SkipBackIcon />
      </button>

      <button
        onClick={playPause}
        className="p-3 bg-neutral-800 hover:bg-neutral-700 text-white rounded-lg cursor-pointer transition-all duration-200"
        title={isPlaying ? 'Pause' : 'Play'}
      >
        {isPlaying ? <PauseIcon /> : <PlayIcon />}
      </button>

      <button
        onClick={skipForward}
        className="p-2 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-lg cursor-pointer transition-all"
        title="Skip forward 5s"
      >
        <SkipForwardIcon />
      </button>

      {recenterToPlayhead && (
        <button
          onClick={recenterToPlayhead}
          className="p-2 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-lg cursor-pointer transition-all"
          title="Recenter to playhead"
        >
          <TargetIcon />
        </button>
      )}
    </div>
  );
});

PlaybackControls.displayName = 'PlaybackControls';

export default PlaybackControls;
