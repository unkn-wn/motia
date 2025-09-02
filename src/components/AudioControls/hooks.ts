import { useMemo } from 'react';
import { useAudio } from '@contexts/AudioContext';

// Specialized hooks that only trigger rerenders for specific state changes

// For components that only need playback state (not time updates)
export const usePlaybackState = () => {
  const context = useAudio();

  return useMemo(() => ({
    isPlaying: context.isPlaying,
    playPause: context.playPause,
    skipBack: context.skipBack,
    skipForward: context.skipForward,
    recenterToPlayhead: context.recenterToPlayhead,
  }), [context.isPlaying]); // Only depend on isPlaying
};

// For components that only need volume state
export const useVolumeState = () => {
  const context = useAudio();

  return useMemo(() => ({
    volume: context.volume,
    setVolume: context.setVolume,
  }), [context.volume]); // Only depend on volume
};

// For components that need time updates (these will rerender frequently)
export const useTimeState = () => {
  const context = useAudio();

  return useMemo(() => ({
    currentTime: context.currentTime,
    duration: context.duration,
    seekToTime: context.seekToTime,
  }), [context.currentTime, context.duration]); // Depend on time values
};
