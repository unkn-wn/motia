import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import type { ReactNode } from 'react';
import WaveSurfer from 'wavesurfer.js';
import { isPlayingStore, volumeStore, currentTimeStore, durationStore } from '@components/AudioControls/state';
import { AudioContext, type AudioContextType, AudioActionsContext, type AudioActionsOnly } from './objects/AudioContextObject';
import { useAuth } from './objects/FirebaseAuthContextObject';
import { saveUserSettings } from '@/lib/db';

interface AudioProviderProps {
	children: ReactNode;
	onCurrentTimeChange?: (time: number) => void;
	onPlayStateChange?: (isPlaying: boolean) => void;
	initialTrimStart?: number;
	initialTrimEnd?: number;
	initialVolume?: number;
}

export const AudioProvider: React.FC<AudioProviderProps> = ({
	children,
	onCurrentTimeChange,
	onPlayStateChange,
	initialTrimStart,
	initialTrimEnd,
	initialVolume,
}) => {
	// Need user ID for persistence
	const { user } = useAuth();

	// Audio state
	const [isPlaying, setIsPlaying] = useState(false);
	const [currentTime, setCurrentTime] = useState(0);
	const [duration, setDuration] = useState(0);
	const [volume, setVolumeState] = useState(initialVolume ?? 0.5);
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
	const saveVolumeTimeoutRef = useRef<number | undefined>(undefined);

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

	// Persist volume helper
	const persistVolume = useCallback(
		(vol: number) => {
			if (!user?.uid) return;
			if (saveVolumeTimeoutRef.current) {
				window.clearTimeout(saveVolumeTimeoutRef.current);
			}
			saveVolumeTimeoutRef.current = window.setTimeout(() => {
				saveUserSettings(user.uid, { preferences: { volume: vol } }).catch(() => {
					/* ignore persistence errors */
				});
			}, 1000);
		},
		[user?.uid]
	);

	// Volume controls - now stable
	const setVolume = useCallback(
		(newVolume: number) => {
			setVolumeState(newVolume);
			if (wavesurferRef.current) {
				wavesurferRef.current.setVolume(newVolume);
			}
			persistVolume(newVolume);
		},
		[persistVolume]
	);

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
		// Sync initial volume
		if (ref) {
			ref.setVolume(volumeRef.current);
		}
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

	// Sync initial trimEnd when metadata or audio duration is loaded
	const hasExplicitTrimEndRef = useRef(false);
	useEffect(() => {
		if (initialTrimEnd !== undefined && initialTrimEnd > 0) {
			setTrimEnd(initialTrimEnd);
			hasExplicitTrimEndRef.current = true;
		} else if (duration > 0 && !hasExplicitTrimEndRef.current) {
			setTrimEnd(duration);
		}
	}, [initialTrimEnd, duration]);

	// Sync initial volume if provided later
	useEffect(() => {
		if (initialVolume !== undefined) {
			setVolumeState(initialVolume);
			if (wavesurferRef.current) {
				wavesurferRef.current.setVolume(initialVolume);
			}
		}
	}, [initialVolume]);

	// Seek audio to trimStart when trim data loads from Firebase
	useEffect(() => {
		const ws = wavesurferRef.current;
		if (!ws || duration === 0) return;

		if (trimStart > 0 && initialTrimStart !== undefined && initialTrimStart > 0) {
			const currentPos = ws.getCurrentTime();
			if (currentPos === 0 || currentPos < 0.1) {
				ws.seekTo(trimStart / duration);
				setCurrentTimeInternal(trimStart);
				setIsReady(true);
			}
		} else if (initialTrimStart !== undefined) {
			setIsReady(true);
		}
	}, [trimStart, duration, initialTrimStart, setCurrentTimeInternal]);

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
