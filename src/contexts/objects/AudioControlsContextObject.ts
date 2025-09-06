import { createContext, useContext } from 'react';

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
