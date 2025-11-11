import React, { useState, useRef, useEffect, useCallback } from 'react';
import { PlayIcon, PauseIcon } from '@/assets/icons';
import { formatTime } from '@/utils/timeUtils';
import { useAudio } from '@/contexts/objects/AudioContextObject';
import { useAuth } from '@/contexts/objects/FirebaseAuthContextObject';
import { drawWaveformBars, setupCanvas, createGradientBackground } from '@/components/FloatingDock/Settings/waveformUtils';
import { updateAudioTrim } from '@/lib/db';
import { getShortcuts, isUserTyping } from '@/utils/shortcutsUtils';

interface AudioTrimSettingsProps {
	projectId: string | null;
}

/**
 * Audio trim settings component - extracted content from AudioTrimModal
 * Used within the Settings modal's Project Settings tab
 */
export const AudioTrimSettings: React.FC<AudioTrimSettingsProps> = ({ projectId }) => {
	const { user } = useAuth();

	// Get all audio state from context
	const {
		duration,
		waveformData,
		getWavesurfer,
		trimStart: initialTrimStart,
		trimEnd: initialTrimEnd,
		setTrimStart: setGlobalTrimStart,
		setTrimEnd: setGlobalTrimEnd,
	} = useAudio();

	const wavesurfer = getWavesurfer();
	const audioElement = wavesurfer?.getMediaElement() as HTMLAudioElement | null;

	const [trimStart, setTrimStart] = useState(initialTrimStart || 0);
	const [trimEnd, setTrimEnd] = useState(initialTrimEnd || duration);
	const [isPlaying, setIsPlaying] = useState(false);
	const [currentTime, setCurrentTime] = useState(0);
	const [dragging, setDragging] = useState<'start' | 'end' | null>(null);
	const [hoverHandle, setHoverHandle] = useState<'start' | 'end' | null>(null);

	const canvasRef = useRef<HTMLCanvasElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const animationFrameRef = useRef<number | undefined>(undefined);
	const saveTimeoutRef = useRef<number | undefined>(undefined);
	const activePointerIdRef = useRef<number | null>(null);

	// Constants for handle dimensions (avoid recalculating)
	const HANDLE_WIDTH = 3;
	const HANDLE_GRIP_WIDTH = 12;
	const HANDLE_GRIP_HEIGHT = 24;

	// Sync with initial values when they change
	useEffect(() => {
		const effectiveStart = initialTrimStart || 0;
		const effectiveEnd = initialTrimEnd || duration;

		setTrimStart(effectiveStart);
		setTrimEnd(effectiveEnd);
		setCurrentTime(effectiveStart);

		// Update global AudioContext trim
		setGlobalTrimStart(effectiveStart);
		setGlobalTrimEnd(effectiveEnd);
	}, [initialTrimStart, initialTrimEnd, duration, setGlobalTrimStart, setGlobalTrimEnd]);

	// Cleanup on unmount
	useEffect(() => {
		return () => {
			if (audioElement) {
				audioElement.pause();
			}
			if (animationFrameRef.current) {
				cancelAnimationFrame(animationFrameRef.current);
			}
		};
	}, [audioElement]);

	// Handle audio element pause events to sync state
	useEffect(() => {
		if (!audioElement) return;

		const handlePause = () => {
			setIsPlaying(false);
			if (animationFrameRef.current) {
				cancelAnimationFrame(animationFrameRef.current);
				animationFrameRef.current = undefined;
			}
		};

		audioElement.addEventListener('pause', handlePause);
		return () => {
			audioElement.removeEventListener('pause', handlePause);
		};
	}, [audioElement]);

	// Memoized draw function to avoid recreating on every render
	const drawCanvas = useCallback(() => {
		if (!canvasRef.current || !waveformData || waveformData.length === 0) return;

		const canvas = canvasRef.current;
		const ctx = canvas.getContext('2d');
		if (!ctx) return;

		const { width, height } = setupCanvas(canvas, ctx);

		// Draw gradient background
		createGradientBackground(ctx, width, height, [
			{ offset: 0, color: '#0f0f0f' },
			{ offset: 1, color: '#000000' },
		]);

		// Draw waveform bars with playhead
		drawWaveformBars({
			ctx,
			waveformData,
			width,
			height,
			duration,
			currentTime,
			trimStart,
			trimEnd,
			showPlayhead: true,
		});

		// Calculate handle positions
		const startX = (trimStart / duration) * width;
		const endX = (trimEnd / duration) * width;
		const startHandleX = Math.max(HANDLE_WIDTH / 2, startX);
		const endHandleX = Math.min(width - HANDLE_WIDTH / 2, endX);
		const startGripY = (height - HANDLE_GRIP_HEIGHT) / 2;
		const endGripY = (height - HANDLE_GRIP_HEIGHT) / 2;

		// Start handle
		ctx.fillStyle = hoverHandle === 'start' || dragging === 'start' ? '#60a5fa' : '#3b82f6';
		ctx.fillRect(startHandleX - HANDLE_WIDTH / 2, 0, HANDLE_WIDTH, height);

		// Start grip lines
		ctx.strokeStyle = hoverHandle === 'start' || dragging === 'start' ? '#60a5fa' : '#3b82f6';
		ctx.lineWidth = 1.5;
		const startGripOffset = -8;
		for (let i = 0; i < 2; i++) {
			const lineX = startHandleX + startGripOffset + i * 3;
			ctx.beginPath();
			ctx.moveTo(lineX, startGripY + 6);
			ctx.lineTo(lineX, startGripY + HANDLE_GRIP_HEIGHT - 6);
			ctx.stroke();
		}

		// Start glow effect
		if (hoverHandle === 'start' || dragging === 'start') {
			ctx.shadowColor = '#3b82f6';
			ctx.shadowBlur = 15;
			ctx.fillRect(startHandleX - HANDLE_WIDTH / 2, 0, HANDLE_WIDTH, height);
			ctx.shadowBlur = 0;
		}

		// End handle
		ctx.fillStyle = hoverHandle === 'end' || dragging === 'end' ? '#60a5fa' : '#3b82f6';
		ctx.fillRect(endHandleX - HANDLE_WIDTH / 2, 0, HANDLE_WIDTH, height);

		// End grip lines
		ctx.strokeStyle = hoverHandle === 'end' || dragging === 'end' ? '#60a5fa' : '#3b82f6';
		ctx.lineWidth = 1.5;
		const endGripOffset = 6;
		for (let i = 0; i < 2; i++) {
			const lineX = endHandleX + endGripOffset + i * 3;
			ctx.beginPath();
			ctx.moveTo(lineX, endGripY + 6);
			ctx.lineTo(lineX, endGripY + HANDLE_GRIP_HEIGHT - 6);
			ctx.stroke();
		}

		// End glow effect
		if (hoverHandle === 'end' || dragging === 'end') {
			ctx.shadowColor = '#3b82f6';
			ctx.shadowBlur = 15;
			ctx.fillRect(endHandleX - HANDLE_WIDTH / 2, 0, HANDLE_WIDTH, height);
			ctx.shadowBlur = 0;
		}
	}, [waveformData, duration, trimStart, trimEnd, currentTime, hoverHandle, dragging]);

	// Draw waveform - only when drawCanvas function changes
	useEffect(() => {
		drawCanvas();
	}, [drawCanvas]);

	// Handle canvas hover
	const handlePointerHover = useCallback(
		(e: React.PointerEvent<HTMLCanvasElement>) => {
			if (!canvasRef.current || dragging) return;

			const rect = canvasRef.current.getBoundingClientRect();
			const x = e.clientX - rect.left;

			const startX = (trimStart / duration) * rect.width;
			const endX = (trimEnd / duration) * rect.width;

			const startHandleX = Math.max(HANDLE_WIDTH / 2, startX);
			const endHandleX = Math.min(rect.width - HANDLE_WIDTH / 2, endX);

			if (Math.abs(x - startHandleX) < HANDLE_GRIP_WIDTH) {
				setHoverHandle('start');
				canvasRef.current.style.cursor = 'ew-resize';
			} else if (Math.abs(x - endHandleX) < HANDLE_GRIP_WIDTH) {
				setHoverHandle('end');
				canvasRef.current.style.cursor = 'ew-resize';
			} else {
				setHoverHandle(null);
				canvasRef.current.style.cursor = 'pointer';
			}
		},
		[duration, trimStart, trimEnd, dragging, HANDLE_WIDTH, HANDLE_GRIP_WIDTH]
	);

	// Handle canvas click/drag
	const handlePointerDown = useCallback(
		(e: React.PointerEvent<HTMLCanvasElement>) => {
			if (!canvasRef.current) return;

			const rect = canvasRef.current.getBoundingClientRect();
			const x = e.clientX - rect.left;
			const clickTime = (x / rect.width) * duration;

			const startX = (trimStart / duration) * rect.width;
			const endX = (trimEnd / duration) * rect.width;

			const startHandleX = Math.max(HANDLE_WIDTH / 2, startX);
			const endHandleX = Math.min(rect.width - HANDLE_WIDTH / 2, endX);

			if (Math.abs(x - startHandleX) < HANDLE_GRIP_WIDTH) {
				setDragging('start');
				activePointerIdRef.current = e.pointerId;
				canvasRef.current.setPointerCapture(e.pointerId);
				e.preventDefault();
			} else if (Math.abs(x - endHandleX) < HANDLE_GRIP_WIDTH) {
				setDragging('end');
				activePointerIdRef.current = e.pointerId;
				canvasRef.current.setPointerCapture(e.pointerId);
				e.preventDefault();
			} else {
				// Seek to clicked position (works whether playing or paused)
				if (audioElement) {
					const clampedTime = Math.max(trimStart, Math.min(trimEnd, clickTime));
					audioElement.currentTime = clampedTime;
					setCurrentTime(clampedTime);
				}
			}
		},
		[duration, trimStart, trimEnd, audioElement, HANDLE_WIDTH, HANDLE_GRIP_WIDTH]
	);

	const handlePointerMove = useCallback(
		(e: PointerEvent) => {
			if (!dragging || !canvasRef.current) return;
			// Only respond to the pointer that initiated the drag
			if (activePointerIdRef.current !== null && e.pointerId !== activePointerIdRef.current) return;

			const rect = canvasRef.current.getBoundingClientRect();
			const x = e.clientX - rect.left;
			const time = Math.max(0, Math.min(duration, (x / rect.width) * duration));

			if (dragging === 'start') {
				const newStart = Math.min(time, trimEnd - 0.5);
				const clampedStart = Math.max(0, newStart);
				setTrimStart(clampedStart);
				setGlobalTrimStart(clampedStart);
			} else if (dragging === 'end') {
				const newEnd = Math.max(time, trimStart + 0.5);
				const clampedEnd = Math.min(duration, newEnd);
				setTrimEnd(clampedEnd);
				setGlobalTrimEnd(clampedEnd);
			}
		},
		[dragging, duration, trimStart, trimEnd, setGlobalTrimStart, setGlobalTrimEnd]
	);

	const handlePointerUp = useCallback((e: PointerEvent) => {
		// Only respond to the pointer that initiated the drag
		if (activePointerIdRef.current !== null && e.pointerId !== activePointerIdRef.current) return;

		setDragging(null);
		activePointerIdRef.current = null;
		if (canvasRef.current) {
			canvasRef.current.style.cursor = 'pointer';
			// Release pointer capture if it was set
			try {
				canvasRef.current.releasePointerCapture(e.pointerId);
			} catch {
				// Ignore errors if pointer capture wasn't set
			}
		}
	}, []);

	const handlePointerLeave = useCallback(() => {
		setHoverHandle(null);
		if (canvasRef.current && !dragging) {
			canvasRef.current.style.cursor = 'pointer';
		}
	}, [dragging]);

	useEffect(() => {
		if (dragging) {
			window.addEventListener('pointermove', handlePointerMove);
			window.addEventListener('pointerup', handlePointerUp);
			window.addEventListener('pointercancel', handlePointerUp); // Treat cancel as up
			return () => {
				window.removeEventListener('pointermove', handlePointerMove);
				window.removeEventListener('pointerup', handlePointerUp);
				window.removeEventListener('pointercancel', handlePointerUp);
			};
		}
	}, [dragging, handlePointerMove, handlePointerUp]);

	// Playback control
	const togglePlayback = useCallback(() => {
		if (!audioElement) return;

		if (isPlaying) {
			audioElement.pause();
			setIsPlaying(false);
			if (animationFrameRef.current) {
				cancelAnimationFrame(animationFrameRef.current);
			}
			// Keep playhead at current position when pausing (don't reset to trimStart)
		} else {
			// Start from current playhead position, or trimStart if at/past the end
			const startPosition = currentTime >= trimEnd - 0.05 || currentTime < trimStart ? trimStart : currentTime;
			audioElement.currentTime = startPosition;
			setCurrentTime(startPosition);
			audioElement.play();
			setIsPlaying(true);

			const updatePlayhead = () => {
				// Add small epsilon for more reliable end detection (0.05 seconds = 50ms)
				const hasReachedEnd = audioElement.currentTime >= trimEnd - 0.05;

				if (hasReachedEnd) {
					audioElement.pause();
					audioElement.currentTime = trimStart;
					setIsPlaying(false);
					setCurrentTime(trimStart);
					if (animationFrameRef.current) {
						cancelAnimationFrame(animationFrameRef.current);
						animationFrameRef.current = undefined;
					}
				} else {
					setCurrentTime(audioElement.currentTime);
					animationFrameRef.current = requestAnimationFrame(updatePlayhead);
				}
			};
			animationFrameRef.current = requestAnimationFrame(updatePlayhead);
		}
	}, [audioElement, isPlaying, trimStart, trimEnd, currentTime]);

	// Auto-save trim values to Firebase when they change
	useEffect(() => {
		if (!user || !projectId) return;

		// Clear any existing timeout
		if (saveTimeoutRef.current) {
			window.clearTimeout(saveTimeoutRef.current);
		}

		// Debounce the save by 1 second
		saveTimeoutRef.current = window.setTimeout(() => {
			updateAudioTrim(user.uid, projectId, trimStart, trimEnd).catch((error) => {
				console.error('Failed to auto-save trim values:', error);
			});
		}, 1000);

		// Cleanup
		return () => {
			if (saveTimeoutRef.current) {
				window.clearTimeout(saveTimeoutRef.current);
			}
		};
	}, [user, projectId, trimStart, trimEnd]);

	// Use user's configured keyboard shortcut for play/pause
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			// Don't handle shortcuts when user is typing
			if (isUserTyping()) return;

			// Get the current play-pause shortcut key
			const shortcuts = getShortcuts();
			const playPauseShortcut = shortcuts.find((s) => s.action === 'TOGGLE_PLAYBACK');

			if (playPauseShortcut && e.key === playPauseShortcut.currentKey) {
				e.preventDefault();
				e.stopPropagation();
				togglePlayback();
			}
		};

		window.addEventListener('keydown', handleKeyDown);
		return () => window.removeEventListener('keydown', handleKeyDown);
	}, [togglePlayback]);

	return (
		<div className="mt-2 space-y-2">
			{/* Waveform Canvas */}
			<div
				ref={containerRef}
				className="relative bg-gradient-to-b from-neutral-950 to-black rounded-2xl overflow-hidden border border-neutral-800/50 shadow-2xl"
			>
				<canvas
					ref={canvasRef}
					onPointerDown={handlePointerDown}
					onPointerMove={handlePointerHover}
					onPointerLeave={handlePointerLeave}
					className="w-full h-48 cursor-pointer"
					style={{ display: 'block', touchAction: 'none' }}
				/>

				{/* Play button overlay */}
				<button
					onClick={togglePlayback}
					className="absolute top-4 left-4 w-8 h-8 rounded-xl bg-gradient-to-br from-blue-500/20 to-blue-600/20 
                     backdrop-blur-md border border-blue-400/30 hover:from-blue-500/30 hover:to-blue-600/30 
                     hover:border-blue-400/50 transition-all duration-200 flex items-center justify-center group
                     shadow-lg shadow-blue-500/10 hover:shadow-blue-500/20 cursor-pointer"
					aria-label={isPlaying ? 'Pause preview' : 'Play preview'}
				>
					{isPlaying ? (
						<PauseIcon className="w-4 h-4 text-blue-100 drop-shadow-lg" />
					) : (
						<PlayIcon className="w-4 h-4 text-blue-100 drop-shadow-lg" />
					)}
				</button>
			</div>

			{/* Time Display */}
			<div className="flex items-center justify-between px-3">
				<div className="flex flex-col items-start">
					<span className="text-[10px] uppercase tracking-wider text-neutral-600 font-medium mb-0.5">Start</span>
					<span className="text-neutral-300 font-mono text-sm">{formatTime(trimStart)}</span>
				</div>
				<div className="flex flex-col items-center">
					<span className="text-[10px] uppercase tracking-wider text-blue-600 font-medium mb-0.5">Duration</span>
					<span className="text-blue-400 font-mono text-base font-semibold">{formatTime(trimEnd - trimStart)}</span>
				</div>
				<div className="flex flex-col items-end">
					<span className="text-[10px] uppercase tracking-wider text-neutral-600 font-medium mb-0.5">End</span>
					<span className="text-neutral-300 font-mono text-sm">{formatTime(trimEnd)}</span>
				</div>
			</div>
		</div>
	);
};
