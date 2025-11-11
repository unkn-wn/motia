import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import type { ReactNode } from 'react';
import WaveSurfer from 'wavesurfer.js';
import { isPlayingStore, volumeStore, currentTimeStore, durationStore } from '@components/AudioControls/state';
import { AudioContext, type AudioContextType, AudioActionsContext, type AudioActionsOnly } from './objects/AudioContextObject';

interface AudioProviderProps {
	children: ReactNode;
	onCurrentTimeChange?: (time: number) => void;
	onPlayStateChange?: (isPlaying: boolean) => void;
	initialTrimStart?: number;
	initialTrimEnd?: number;
}

export const AudioProvider: React.FC<AudioProviderProps> = ({
	children,
	onCurrentTimeChange,
	onPlayStateChange,
	initialTrimStart,
	initialTrimEnd,
}) => {
	// Audio state
	const [isPlaying, setIsPlaying] = useState(false);
	const [currentTime, setCurrentTime] = useState(0);
	const [duration, setDuration] = useState(0);
	const [volume, setVolumeState] = useState(0.5);
	const [waveformData, setWaveformData] = useState<number[]>([]);
	const [trimStart, setTrimStart] = useState(initialTrimStart ?? 0);
	const [trimEnd, setTrimEnd] = useState(initialTrimEnd ?? 0);
	const [isReady, setIsReady] = useState(false); // Tracks if audio is loaded and positioned

	// Refs for stable access to changing values
	const wavesurferRef = useRef<WaveSurfer | null>(null);
	const recenterToPlayheadRef = useRef<(() => void) | null>(null);
	const currentTimeRef = useRef(currentTime);
	const durationRef = useRef(duration);
	const volumeRef = useRef(volume);
	const trimStartRef = useRef(trimStart);
	const trimEndRef = useRef(trimEnd);
	const onCurrentTimeChangeRef = useRef(onCurrentTimeChange);
	const onPlayStateChangeRef = useRef(onPlayStateChange);

	// Keep refs in sync with state
	currentTimeRef.current = currentTime;
	durationRef.current = duration;
	volumeRef.current = volume;
	trimStartRef.current = trimStart;
	trimEndRef.current = trimEnd;
	onCurrentTimeChangeRef.current = onCurrentTimeChange;
	onPlayStateChangeRef.current = onPlayStateChange;

	// Internal setters that also notify parent - now stable
	const setIsPlayingInternal = useCallback((playing: boolean) => {
		setIsPlaying(playing);
		onPlayStateChangeRef.current?.(playing);
	}, []);

	const setCurrentTimeInternal = useCallback((time: number) => {
		setCurrentTime(time);
		onCurrentTimeChangeRef.current?.(time);
	}, []);

	// Playback controls - now stable with trim support
	const playPause = useCallback(() => {
		if (wavesurferRef.current) {
			const ws = wavesurferRef.current;
			const currentTime = ws.getCurrentTime();
			const effectiveTrimEnd = trimEndRef.current || durationRef.current;

			// If at or past trimEnd, seek back to trimStart before playing
			if (currentTime >= effectiveTrimEnd) {
				const seekPos = trimStartRef.current / durationRef.current;
				ws.seekTo(seekPos);
			}

			ws.playPause();
		}
	}, []);

	const skipBack = useCallback(() => {
		if (wavesurferRef.current && durationRef.current > 0) {
			const currentTime = wavesurferRef.current.getCurrentTime();
			const newPos = Math.max(trimStartRef.current, currentTime - 5);
			wavesurferRef.current.seekTo(newPos / durationRef.current);
			setCurrentTimeInternal(newPos);
		}
	}, [setCurrentTimeInternal]);

	const skipForward = useCallback(() => {
		if (wavesurferRef.current && durationRef.current > 0) {
			const currentTime = wavesurferRef.current.getCurrentTime();
			const effectiveTrimEnd = trimEndRef.current || durationRef.current;
			const newPos = Math.min(effectiveTrimEnd, currentTime + 5);
			wavesurferRef.current.seekTo(newPos / durationRef.current);
			setCurrentTimeInternal(newPos);
		}
	}, [setCurrentTimeInternal]);

	const seekToTime = useCallback(
		(time: number) => {
			if (wavesurferRef.current && durationRef.current > 0) {
				// Clamp seek position within trim bounds
				const effectiveTrimEnd = trimEndRef.current || durationRef.current;
				const clampedTime = Math.max(trimStartRef.current, Math.min(effectiveTrimEnd, time));
				const seekPosition = clampedTime / durationRef.current;
				wavesurferRef.current.seekTo(seekPosition);
				setCurrentTimeInternal(clampedTime);
			}
		},
		[setCurrentTimeInternal]
	);

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

	const getWavesurfer = useCallback(() => {
		return wavesurferRef.current;
	}, []);

	// Sync trim state when initial props change (e.g., after Firebase loads)
	useEffect(() => {
		if (initialTrimStart !== undefined) {
			setTrimStart(initialTrimStart);
		}
	}, [initialTrimStart]);

	useEffect(() => {
		if (initialTrimEnd !== undefined && initialTrimEnd > 0) {
			setTrimEnd(initialTrimEnd);
		}
	}, [initialTrimEnd]);

	// Seek audio to trimStart when trim data loads from Firebase
	useEffect(() => {
		const ws = wavesurferRef.current;

		// Wait for waveform to load and have duration
		if (!ws || duration === 0) return;

		// Case 1: We have trim data from Firebase
		if (trimStart > 0 && initialTrimStart !== undefined && initialTrimStart > 0) {
			// Only seek if we're still at the beginning (haven't started playback yet)
			const currentPos = ws.getCurrentTime();
			if (currentPos === 0 || currentPos < 0.1) {
				ws.seekTo(trimStart / duration);
				setCurrentTimeInternal(trimStart);
				setIsReady(true); // Ready after positioning
			}
		}
		// Case 2: No trim data, or initial props loaded with trimStart=0
		else if (initialTrimStart !== undefined) {
			// initialTrimStart has been set (even if 0), meaning metadata loaded
			setIsReady(true);
		}
		// Case 3: initialTrimStart is still undefined - metadata hasn't loaded yet
		// Don't set isReady, keep waiting
	}, [trimStart, duration, initialTrimStart, setCurrentTimeInternal]);

	// Auto-set trimEnd to duration ONLY if no initial trim was provided and trimEnd is still 0
	useEffect(() => {
		if (duration > 0 && trimEnd === 0 && initialTrimEnd === undefined) {
			setTrimEnd(duration);
		}
	}, [duration, trimEnd, initialTrimEnd]);

	// Monitor playback and pause at trimEnd
	useEffect(() => {
		const ws = wavesurferRef.current;
		if (!ws) return;

		const handleTimeUpdate = (currentTime: number) => {
			const effectiveTrimEnd = trimEnd || duration;
			if (currentTime >= effectiveTrimEnd && isPlaying) {
				ws.pause();
				// Optionally seek back to trimStart
				ws.seekTo(trimStart / duration);
			}
		};

		ws.on('timeupdate', handleTimeUpdate);
		return () => {
			ws.un('timeupdate', handleTimeUpdate);
		};
	}, [trimStart, trimEnd, duration, isPlaying]);

	// Memoize the context value to prevent unnecessary rerenders
	const contextValue: AudioContextType = useMemo(
		() => ({
			// State
			isPlaying,
			currentTime,
			duration,
			volume,
			waveformData,
			trimStart,
			trimEnd,
			isReady,

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
			getWavesurfer,
			setTrimStart,
			setTrimEnd,
		}),
		[
			// Only include state values that should trigger rerenders
			// Functions are excluded since they should be stable with useCallback
			isPlaying,
			currentTime,
			duration,
			volume,
			waveformData,
			trimStart,
			trimEnd,
			isReady,
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
			getWavesurfer,
			setTrimStart,
			setTrimEnd,
		]
	);

	const actionsValue: AudioActionsOnly = useMemo(
		() => ({
			playPause,
			skipBack,
			skipForward,
			seekToTime,
			setVolume,
			volumeUp,
			volumeDown,
			recenterToPlayhead,
			setRecenterToPlayhead,
		}),
		[playPause, skipBack, skipForward, seekToTime, setVolume, volumeUp, volumeDown, recenterToPlayhead, setRecenterToPlayhead]
	);

	return (
		<AudioContext.Provider value={contextValue}>
			<AudioActionsContext.Provider value={actionsValue}>{children}</AudioActionsContext.Provider>
			{/* Synchronize external stores for fine-grained subscribers */}
			<AudioProviderEffects isPlaying={isPlaying} volume={volume} />
			<AudioTimeEffects currentTime={currentTime} duration={duration} />
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
		volumeStore.set(volume);
	}, [isPlaying, volume]);
	return null;
};

// Mirror currentTime/duration for decoupled consumers (e.g., progress bar)
export const AudioTimeEffects: React.FC<{
	currentTime: number;
	duration: number;
}> = ({ currentTime, duration }) => {
	useEffect(() => {
		currentTimeStore.set(currentTime);
	}, [currentTime]);
	useEffect(() => {
		durationStore.set(duration);
	}, [duration]);
	return null;
};
