import { createContext, useContext, type ReactNode } from 'react';
import { useAudio } from '@contexts/AudioContext';

// Separate contexts for different concerns to enable selective subscriptions

// Playback state context - only isPlaying and playback functions
interface PlaybackContextType {
  isPlaying: boolean;
  playPause: () => void;
  skipBack: () => void;
  skipForward: () => void;
  recenterToPlayhead: (() => void) | null;
}

const PlaybackContext = createContext<PlaybackContextType | null>(null);

export const PlaybackProvider = ({ children }: { children: ReactNode }) => {
  const { isPlaying, playPause, skipBack, skipForward, recenterToPlayhead } = useAudio();

  const value: PlaybackContextType = {
    isPlaying,
    playPause,
    skipBack,
    skipForward,
    recenterToPlayhead: recenterToPlayhead || null,
  };

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
  volume: number;
  setVolume: (volume: number) => void;
}

const VolumeContext = createContext<VolumeContextType | null>(null);

export const VolumeProvider = ({ children }: { children: ReactNode }) => {
  const { volume, setVolume } = useAudio();

  const value: VolumeContextType = {
    volume,
    setVolume,
  };

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
