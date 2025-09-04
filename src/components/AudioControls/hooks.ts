import { useMemo, useSyncExternalStore } from 'react';
import { useAudio } from '@contexts/AudioContext';
import { usePlaybackContext, useVolumeContext } from '@contexts/AudioControlsContext';
import { isPlayingStore, volumeStore } from './state';

// Specialized hooks that only trigger rerenders for specific state changes

// For components that only need playback state (not time updates)
// Stable API, optimized under the hood to avoid context-driven re-renders
export const usePlaybackState = () => {
  const { playPause, skipBack, skipForward, recenterToPlayhead } = usePlaybackContext();
  const isPlaying = useSyncExternalStore(isPlayingStore.subscribe, isPlayingStore.getSnapshot);

  return useMemo(() => ({
    isPlaying,
    playPause,
    skipBack,
    skipForward,
    recenterToPlayhead,
  }), [isPlaying, playPause, skipBack, skipForward, recenterToPlayhead]);
};

// For components that only need volume state
export const useVolumeState = () => {
  const { setVolume } = useVolumeContext();
  const volume = useSyncExternalStore(volumeStore.subscribe, volumeStore.getSnapshot);

  return useMemo(() => ({
    volume,
    setVolume,
  }), [volume, setVolume]);
};

// For components that need time updates (these will rerender frequently)
export const useTimeState = () => {
  const context = useAudio();

  return useMemo(() => ({
    currentTime: context.currentTime,
    duration: context.duration,
    seekToTime: context.seekToTime,
  }), [context.currentTime, context.duration, context.seekToTime]);
};
