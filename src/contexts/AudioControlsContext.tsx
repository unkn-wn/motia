import { useMemo, type ReactNode } from 'react';
import { useAudioActions } from '@contexts/objects/AudioContextObject';
import { PlaybackContext, type PlaybackContextType, VolumeContext, type VolumeContextType } from './objects/AudioControlsContextObject';

// Separate contexts for different concerns to enable selective subscriptions

// Playback state context - only isPlaying and playback functions
export const PlaybackProvider = ({ children }: { children: ReactNode }) => {
  const { playPause, skipBack, skipForward, recenterToPlayhead } = useAudioActions();

  // Memoize to change identity only when needed
  const value: PlaybackContextType = useMemo(() => ({
    playPause,
    skipBack,
    skipForward,
    recenterToPlayhead: recenterToPlayhead ?? null,
  }), [playPause, skipBack, skipForward, recenterToPlayhead]);

  return (
    <PlaybackContext.Provider value={value}>
      {children}
    </PlaybackContext.Provider>
  );
};

// Volume state context - only volume and volume functions
export const VolumeProvider = ({ children }: { children: ReactNode }) => {
  const { setVolume } = useAudioActions();

  // Memoize to change identity only when needed
  const value: VolumeContextType = useMemo(() => ({
    setVolume,
  }), [setVolume]);

  return (
    <VolumeContext.Provider value={value}>
      {children}
    </VolumeContext.Provider>
  );
};
