import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useAudio } from '@contexts/AudioContext';

// Separate contexts for different concerns to enable selective subscriptions

// Playback state context - only isPlaying and playback functions
interface PlaybackContextType {
  playPause: () => void;
  skipBack: () => void;
  skipForward: () => void;
  recenterToPlayhead: (() => void) | null;
}

const PlaybackContext = createContext<PlaybackContextType | null>(null);

export const PlaybackProvider = ({ children }: { children: ReactNode }) => {
  const { playPause, skipBack, skipForward, recenterToPlayhead } = useAudio();

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

export const usePlaybackContext = () => {
  const context = useContext(PlaybackContext);
  if (!context) {
    throw new Error('usePlaybackContext must be used within PlaybackProvider');
  }
  return context;
};

// Volume state context - only volume and volume functions
interface VolumeContextType {
  setVolume: (volume: number) => void;
}

const VolumeContext = createContext<VolumeContextType | null>(null);

export const VolumeProvider = ({ children }: { children: ReactNode }) => {
  const { setVolume } = useAudio();

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

export const useVolumeContext = () => {
  const context = useContext(VolumeContext);
  if (!context) {
    throw new Error('useVolumeContext must be used within VolumeProvider');
  }
  return context;
};
