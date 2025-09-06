import React, { useState, useRef, useCallback, useMemo, useEffect, createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import WaveSurfer from 'wavesurfer.js';
import { isPlayingStore, volumeStore } from '@components/AudioControls/state';

interface AudioState {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  waveformData: number[];
}

interface AudioActions {
  // Playback controls
  playPause: () => void;
  skipBack: () => void;
  skipForward: () => void;
  seekToTime: (time: number) => void;

  // Volume controls
  setVolume: (volume: number) => void;
  volumeUp: () => void;
  volumeDown: () => void;

  // Waveform controls
  recenterToPlayhead?: () => void;
  setRecenterToPlayhead: (fn: () => void) => void;

  // Internal setters for wavesurfer integration
  setIsPlaying: (playing: boolean) => void;
  setCurrentTime: (time: number) => void;
  setDuration: (duration: number) => void;
  setWaveformData: (data: number[]) => void;

  // Wavesurfer ref management
  setWavesurferRef: (ref: WaveSurfer | null) => void;
  getWavesurferRef: () => WaveSurfer | null;
}

type AudioContextType = AudioState & AudioActions;

// Collocated context + hook
export const AudioContext = createContext<AudioContextType | null>(null);

export const useAudio = () => {
  const ctx = useContext(AudioContext);
  if (!ctx) throw new Error('useAudio must be used within AudioProvider');
  return ctx;
};


interface AudioProviderProps {
  children: ReactNode;
  onCurrentTimeChange?: (time: number) => void;
  onPlayStateChange?: (isPlaying: boolean) => void;
}

export const AudioProvider: React.FC<AudioProviderProps> = ({
  children,
  onCurrentTimeChange,
  onPlayStateChange,
}) => {
  // Audio state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(0.5);
  const [waveformData, setWaveformData] = useState<number[]>([]);

  // Refs for stable access to changing values
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const recenterToPlayheadRef = useRef<(() => void) | null>(null);
  const currentTimeRef = useRef(currentTime);
  const durationRef = useRef(duration);
  const volumeRef = useRef(volume);
  const onCurrentTimeChangeRef = useRef(onCurrentTimeChange);
  const onPlayStateChangeRef = useRef(onPlayStateChange);

  // Keep refs in sync with state
  currentTimeRef.current = currentTime;
  durationRef.current = duration;
  volumeRef.current = volume;
  onCurrentTimeChangeRef.current = onCurrentTimeChange;
  onPlayStateChangeRef.current = onPlayStateChange;

  // Internal setters that also notify parent - now stable
  const setIsPlayingInternal = useCallback((playing: boolean) => {
    setIsPlaying(playing);
    onPlayStateChangeRef.current?.(playing);
  }, [onPlayStateChangeRef]);

  const setCurrentTimeInternal = useCallback((time: number) => {
    setCurrentTime(time);
    onCurrentTimeChangeRef.current?.(time);
  }, [onCurrentTimeChangeRef]);

  // Playback controls - now stable
  const playPause = useCallback(() => {
    if (wavesurferRef.current) {
      wavesurferRef.current.playPause();
    }
  }, []);

  const skipBack = useCallback(() => {
    if (wavesurferRef.current && durationRef.current > 0) {
      const currentTime = wavesurferRef.current.getCurrentTime();
      const newPos = Math.max(0, currentTime - 5);
      wavesurferRef.current.seekTo(newPos / durationRef.current);
      setCurrentTimeInternal(newPos);
    }
  }, [setCurrentTimeInternal]);

  const skipForward = useCallback(() => {
    if (wavesurferRef.current && durationRef.current > 0) {
      const currentTime = wavesurferRef.current.getCurrentTime();
      const newPos = Math.min(durationRef.current, currentTime + 5);
      wavesurferRef.current.seekTo(newPos / durationRef.current);
      setCurrentTimeInternal(newPos);
    }
  }, [setCurrentTimeInternal]);

  const seekToTime = useCallback((time: number) => {
    if (wavesurferRef.current && durationRef.current > 0) {
      const seekPosition = time / durationRef.current;
      wavesurferRef.current.seekTo(seekPosition);
      setCurrentTimeInternal(time);
    }
  }, [setCurrentTimeInternal]);

  // Volume controls - now stable
  const setVolume = useCallback((newVolume: number) => {
    setVolumeState(newVolume);
    if (wavesurferRef.current) {
      wavesurferRef.current.setVolume(newVolume);
    }
  }, []);

  const volumeUp = useCallback(() => {
    const newVolume = Math.min(1, volumeRef.current + 0.1);
    setVolume(newVolume);
  }, [setVolume]);

  const volumeDown = useCallback(() => {
    const newVolume = Math.max(0, volumeRef.current - 0.1);
    setVolume(newVolume);
  }, [setVolume]);

  // Waveform controls
  const recenterToPlayhead = useCallback(() => {
    if (recenterToPlayheadRef.current) {
      recenterToPlayheadRef.current();
    }
  }, []);

  const setRecenterToPlayhead = useCallback((fn: () => void) => {
    recenterToPlayheadRef.current = fn;
  }, []);

  // Wavesurfer ref management
  const setWavesurferRef = useCallback((ref: WaveSurfer | null) => {
    wavesurferRef.current = ref;
  }, []);

  const getWavesurferRef = useCallback(() => {
    return wavesurferRef.current;
  }, []);

  // Memoize the context value to prevent unnecessary rerenders
  const contextValue: AudioContextType = useMemo(() => ({
    // State
    isPlaying,
    currentTime,
    duration,
    volume,
    waveformData,

    // Actions
    playPause,
    skipBack,
    skipForward,
    seekToTime,
    setVolume,
    volumeUp,
    volumeDown,
    recenterToPlayhead,
    setRecenterToPlayhead,

    // Internal setters
    setIsPlaying: setIsPlayingInternal,
    setCurrentTime: setCurrentTimeInternal,
    setDuration,
    setWaveformData,
    setWavesurferRef,
    getWavesurferRef,
  }), [
    // Only include state values that should trigger rerenders
    // Functions are excluded since they should be stable with useCallback
    isPlaying,
    currentTime,
    duration,
    volume,
    waveformData,
    playPause,
    skipBack,
    skipForward,
    seekToTime,
    setVolume,
    volumeUp,
    volumeDown,
    recenterToPlayhead,
    setRecenterToPlayhead,
    setIsPlayingInternal,
    setCurrentTimeInternal,
    setDuration,
    setWaveformData,
    setWavesurferRef,
    getWavesurferRef,
  ]);

  return (
    <AudioContext.Provider value={contextValue}>
      {children}
      {/* Synchronize external stores for fine-grained subscribers */}
      <AudioProviderEffects isPlaying={isPlaying} volume={volume} />
    </AudioContext.Provider>
  );
};

// Keep external stores in sync with provider state changes
export const AudioProviderEffects: React.FC<{
  isPlaying: boolean;
  volume: number;
}> = ({ isPlaying, volume }) => {
  useEffect(() => {
    isPlayingStore.set(isPlaying);
  }, [isPlaying]);
  useEffect(() => {
    volumeStore.set(volume);
  }, [volume]);
  return null;
};
