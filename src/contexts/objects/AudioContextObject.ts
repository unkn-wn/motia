import { createContext, useContext } from 'react';
import type WaveSurfer from 'wavesurfer.js';

interface AudioState {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  waveformData: number[];
}

interface AudioActions {
  playPause: () => void;
  skipBack: () => void;
  skipForward: () => void;
  seekToTime: (time: number) => void;
  setVolume: (volume: number) => void;
  volumeUp: () => void;
  volumeDown: () => void;
  recenterToPlayhead?: () => void;
  setRecenterToPlayhead: (fn: () => void) => void;
  setIsPlaying: (playing: boolean) => void;
  setCurrentTime: (time: number) => void;
  setDuration: (duration: number) => void;
  setWaveformData: (data: number[]) => void;
  setWavesurferRef: (ref: WaveSurfer | null) => void;
}

export type AudioContextType = AudioState & AudioActions;

export const AudioContext = createContext<AudioContextType | null>(null);

export const useAudio = () => {
  const ctx = useContext(AudioContext);
  if (!ctx) throw new Error('useAudio must be used within AudioProvider');
  return ctx;
};
