import { createContext, useContext } from 'react';
import type WaveSurfer from 'wavesurfer.js';

interface AudioState {
	isPlaying: boolean;
	currentTime: number;
	duration: number;
	volume: number;
	waveformData: number[];
	trimStart: number;
	trimEnd: number;
	isReady: boolean; // True when audio is loaded and positioned at trimStart
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
	getWavesurfer: () => WaveSurfer | null;
	setTrimStart: (time: number) => void;
	setTrimEnd: (time: number) => void;
}

export type AudioContextType = AudioState & AudioActions;

export const AudioContext = createContext<AudioContextType | null>(null);

export const useAudio = () => {
	const ctx = useContext(AudioContext);
	if (!ctx) throw new Error('useAudio must be used within AudioProvider');
	return ctx;
};

// A narrow context that exposes only stable action functions to avoid frequent re-renders
export type AudioActionsOnly = Pick<
	AudioActions,
	| 'playPause'
	| 'skipBack'
	| 'skipForward'
	| 'seekToTime'
	| 'setVolume'
	| 'volumeUp'
	| 'volumeDown'
	| 'recenterToPlayhead'
	| 'setRecenterToPlayhead'
>;

export const AudioActionsContext = createContext<AudioActionsOnly | null>(null);

export const useAudioActions = () => {
	const ctx = useContext(AudioActionsContext);
	if (!ctx) throw new Error('useAudioActions must be used within AudioProvider');
	return ctx;
};
