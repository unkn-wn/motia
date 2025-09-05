import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useAudio } from '@contexts/AudioContext';

// Collocated contexts and hooks
export interface PlaybackContextType {
  playPause: () => void;
  skipBack: () => void;
  skipForward: () => void;
  recenterToPlayhead: (() => void) | null;
}
export const PlaybackContext = createContext<PlaybackContextType | null>(null);
export const usePlaybackContext = () => {
  const ctx = useContext(PlaybackContext);
  if (!ctx) throw new Error('usePlaybackContext must be used within PlaybackProvider');
  return ctx;
};

export interface VolumeContextType { setVolume: (volume: number) => void }
export const VolumeContext = createContext<VolumeContextType | null>(null);
export const useVolumeContext = () => {
  const ctx = useContext(VolumeContext);
  if (!ctx) throw new Error('useVolumeContext must be used within VolumeProvider');
  return ctx;
};

// Separate contexts for different concerns to enable selective subscriptions

// Playback state context - only isPlaying and playback functions
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

// Volume state context - only volume and volume functions
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
