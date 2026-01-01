import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef, useCallback } from 'react';
import WaveSurfer from 'wavesurfer.js';
import { useAudio } from '@contexts/objects/AudioContextObject';
import type { Note, CanvasTransform, ToolMode } from '@types';
import type { DrawingPoint, DrawingSession } from '@types';

// Import refactored components and hooks
import { WaveformProvider } from '@contexts/WaveformContext';
import { WaveformPlayerContent } from './components/WaveformPlayerContent';

export interface WaveformPlayerProps {
	audioFile: File | null;
	onLoadingChange?: (loading: boolean) => void;
	onAddNote: (time: number, canvasX: number, canvasY: number) => void;
	notes: Note[];
	onUpdateNote: (id: string, content: string) => void;
	onDeleteNote: (id: string) => void;
	onMoveNote?: (id: string, canvasX: number, canvasY: number) => void;
	// Drawing props
	isDrawingMode?: boolean;
	onAddDrawing?: (time: number, canvasX: number, canvasY: number, drawing: Note['drawing']) => string;
	onUpdateDrawing?: (id: string, drawing: Note['drawing']) => void;
	toolMode?: ToolMode; // new controlled tool mode
}

export interface WaveformPlayerRef {
	seekToTime: (time: number) => void;
	getCanvasTransform: () => { offsetX: number; offsetY: number; scale: number };
	playPause: () => void;
	skipBack: () => void;
	skipForward: () => void;
	addNoteAtCurrentTime: () => void;
	volumeUp: () => void;
	volumeDown: () => void;
	exportThumbnail: (width?: number, height?: number) => string | null;
	pause: () => void;
}

const WaveformPlayer = forwardRef<WaveformPlayerRef, WaveformPlayerProps>(
	(
		{
			audioFile,
			onLoadingChange,
			onAddNote,
			notes,
			onUpdateNote,
			onDeleteNote,
			onMoveNote,
			isDrawingMode = false,
			onAddDrawing,
			onUpdateDrawing,
			toolMode: externalToolMode,
		},
		ref
	) => {
		const waveformRef = useRef<HTMLDivElement>(null);
		const canvasRef = useRef<HTMLCanvasElement>(null);
		const wavesurferLocalRef = useRef<WaveSurfer | null>(null);
		// No local wavesurfer ref needed; the instance is stored in AudioContext via setWavesurferRef

		// Use audio context for shared state
		const {
			currentTime,
			duration,
			setIsPlaying,
			setCurrentTime,
			setDuration,
			setWaveformData,
			setWavesurferRef,
			playPause,
			skipBack,
			skipForward,
			seekToTime,
			volumeUp,
			volumeDown,
			setRecenterToPlayhead,
		} = useAudio();

		// Canvas panning and transform state
		const [transform, setTransform] = useState<CanvasTransform>({ offsetX: 0, offsetY: 150, scale: 1 });
		const [isPanning, setIsPanning] = useState(false);
		const [lastPanPoint, setLastPanPoint] = useState({ x: 0, y: 0 });
		const [isFollowingPlayhead, setIsFollowingPlayhead] = useState(true); // Start with auto-tracking enabled
		const transformRef = useRef(transform);

		// Shared layout cache for notes (renderer populates, hit-test reads)
		const noteLayoutCacheRef = useRef<Map<string, { key: string; lines: string[]; noteHeight: number }>>(new Map());

		// Note interaction state
		const [editingNote, setEditingNote] = useState<string | null>(null);
		const [editContent, setEditContent] = useState('');
		const [dragging, setDragging] = useState<{
			id: string;
			startX: number;
			startY: number;
			initialCanvasX: number;
			initialCanvasY: number;
		} | null>(null);
		const [dragOccurred, setDragOccurred] = useState(false);

		// Context menu and delete-confirm state
		const [contextMenu, setContextMenu] = useState<{ isOpen: boolean; x: number; y: number; noteId: string | null }>({
			isOpen: false,
			x: 0,
			y: 0,
			noteId: null,
		});
		const [deleteConfirmNoteId, setDeleteConfirmNoteId] = useState<string | null>(null);

		// Controlled tool mode derived from prop (fallback to legacy isDrawingMode only if prop is undefined)
		// Use definedness check so that externalToolMode = null means "no tool", not fallback to draw
		const toolMode: ToolMode = externalToolMode !== undefined ? externalToolMode : isDrawingMode ? 'draw' : null;
		// Provide a no-op setter for context compatibility (future: lift fully)
		const setToolMode = useCallback<React.Dispatch<React.SetStateAction<ToolMode>>>(() => {
			/* noop controlled */
		}, []);
		const [isDrawing, setIsDrawing] = useState(false);
		// Ensure we exit drawing state when tool changes away from draw
		useEffect(() => {
			if (toolMode !== 'draw' && isDrawing) {
				setIsDrawing(false);
				setCurrentStroke([]);
			}
		}, [toolMode, isDrawing]);
		// Selection & eraser state
		const [selectionBox, setSelectionBox] = useState<{
			x: number;
			y: number;
			w: number;
			h: number;
			dragging?: boolean;
			mode?: 'create' | 'move';
			startPointerX?: number;
			startPointerY?: number;
			originX?: number;
			originY?: number;
			originalPositions?: Array<{ id: string; x: number; y: number }>;
		} | null>(null);
		const [selectedStrokeGroups, setSelectedStrokeGroups] = useState<{ noteId: string; strokeIndexes: number[] }[]>([]);
		const [movingStrokePreview, setMovingStrokePreview] = useState<{
			noteId: string;
			strokeIndexes: number[];
			dx: number;
			dy: number;
		} | null>(null);
		useEffect(() => {
			if (toolMode !== 'select') {
				setSelectionBox(null);
				setSelectedDrawingIds(new Set());
				setSelectedStrokeGroups([]);
				setMovingStrokePreview(null);
			}
			if (toolMode !== 'erase') {
				setErasingStrokeIds([]);
				setEraserCursor(null);
			}
			// If leaving draw, stop drawing and clear live stroke immediately (extra safety)
			if (toolMode !== 'draw') {
				setIsDrawing(false);
				setCurrentStroke([]);
			}
			// Cancel any active dragging/panning when switching tools to avoid stuck states
			setDragging(null);
			setIsPanning(false);
		}, [toolMode]);

		// Add/remove drawing-mode class to body to prevent text selection on mobile
		useEffect(() => {
			if (toolMode === 'draw') {
				document.body.classList.add('drawing-mode');
			} else {
				document.body.classList.remove('drawing-mode');
			}
			return () => {
				document.body.classList.remove('drawing-mode');
			};
		}, [toolMode]);

		const [selectedDrawingIds, setSelectedDrawingIds] = useState<Set<string>>(new Set());
		const [erasingStrokeIds, setErasingStrokeIds] = useState<{ noteId: string; strokeIndexes: number[] }[]>([]);
		const [eraserCursor, setEraserCursor] = useState<{ x: number; y: number } | null>(null);
		const [currentStroke, setCurrentStroke] = useState<DrawingPoint[]>([]);
		const [drawingStartPos, setDrawingStartPos] = useState<{ x: number; y: number } | null>(null);
		const [drawingSession, setDrawingSession] = useState<DrawingSession | null>(null);
		const [drawingNoteId, setDrawingNoteId] = useState<string | null>(null);

		// Note interaction constants
		const NOTE_LABEL_HIDE_THRESHOLD = 0;

		// Initialize WaveSurfer when an audio file is present; otherwise synthesize a fallback waveform
		useEffect(() => {
			if (!waveformRef.current) return;

			// NO AUDIO FILE - random placeholder waveform
			if (!audioFile) {
				setDuration(10);
				const samples = 350;
				const dummyData = Array.from({ length: samples }, () => 0.15);
				setWaveformData(dummyData);
				setWavesurferRef(null);
				onLoadingChange?.(false);
				return;
			}

			onLoadingChange?.(true);
			// Create a hidden wavesurfer for audio processing
			const hiddenDiv = document.createElement('div');
			hiddenDiv.style.position = 'absolute';
			hiddenDiv.style.left = '-9999px';
			document.body.appendChild(hiddenDiv);

			const wavesurfer = WaveSurfer.create({
				container: hiddenDiv,
				waveColor: '#6b7280',
				progressColor: '#9ca3af',
				cursorColor: '#f3f4f6',
				barWidth: 2,
				height: 100,
				normalize: true,
				backend: 'WebAudio',
				interact: false,
			});

			setWavesurferRef(wavesurfer);
			wavesurferLocalRef.current = wavesurfer;

			const audioUrl = URL.createObjectURL(audioFile);
			wavesurfer.load(audioUrl).catch(() => {
				// Prevent AbortError from spamming console on unmount/remount
			});

			wavesurfer.on('ready', () => {
				const audioDuration = wavesurfer.getDuration();
				setDuration(audioDuration);

				try {
					const decodedData = wavesurfer.getDecodedData();
					if (decodedData) {
						const data = decodedData.getChannelData(0);
						const duration = wavesurfer.getDuration();
						const samples = Math.min(2000, Math.max(500, Math.floor(duration * 50)));
						const blockSize = Math.floor(data.length / samples);
						const filteredData = [] as number[];
						for (let i = 0; i < samples; i++) {
							let sum = 0;
							for (let j = 0; j < blockSize; j++) sum += Math.abs(data[i * blockSize + j] || 0);
							filteredData.push(sum / blockSize);
						}
						setWaveformData(filteredData);
					}
				} catch {
					const dummyData = Array.from({ length: 1000 }, () => 0.2);
					setWaveformData(dummyData);
				}
				onLoadingChange?.(false);
			});

			wavesurfer.on('audioprocess', () => setCurrentTime(wavesurfer.getCurrentTime()));
			wavesurfer.on('interaction', () => setCurrentTime(wavesurfer.getCurrentTime()));
			wavesurfer.on('play', () => setIsPlaying(true));
			wavesurfer.on('pause', () => setIsPlaying(false));

			return () => {
				try {
					wavesurfer.pause();
				} catch {
					/* ignore pause errors */
				}
				wavesurfer.destroy();
				document.body.removeChild(hiddenDiv);
				URL.revokeObjectURL(audioUrl);
				onLoadingChange?.(false);
			};
		}, [audioFile, setDuration, setWaveformData, setCurrentTime, setIsPlaying, setWavesurferRef, onLoadingChange]);

		// Helper: set transform and keep transformRef in sync without a separate effect
		const setTransformSafe = useCallback((update: React.SetStateAction<CanvasTransform>) => {
			setTransform((prev) => {
				const next = typeof update === 'function' ? (update as (p: CanvasTransform) => CanvasTransform)(prev) : update;
				transformRef.current = next;
				return next;
			});
		}, []);

		// Follow playhead effect - continuously update transform when following is enabled
		useEffect(() => {
			if (!isFollowingPlayhead || !canvasRef.current || duration === 0) return;

			const canvas = canvasRef.current;
			const canvasHeight = canvas.getBoundingClientRect().height;

			// Calculate where the playhead should be in canvas coordinates
			const timeProgress = currentTime / duration;
			const baseWaveformHeight = Math.max(canvasHeight * 3, duration * 100);
			const scaledWaveformHeight = baseWaveformHeight * transform.scale;
			const targetPlayheadY = timeProgress * scaledWaveformHeight;
			const playheadPositionY = canvasHeight * 0.33; // Position at 33% from top

			setTransformSafe((prev) => ({
				offsetX: prev.offsetX, // Don't change X position
				offsetY: playheadPositionY - targetPlayheadY, // Keep playhead centered
				scale: prev.scale, // Maintain current zoom level
			}));
		}, [currentTime, duration, transform.scale, isFollowingPlayhead, canvasRef, setTransformSafe]);

		const handleAddNoteAtCurrentTime = useCallback(
			(e: React.MouseEvent) => {
				e.stopPropagation();
				if (!canvasRef.current || duration === 0) return;

				const rect = canvasRef.current.getBoundingClientRect();

				// With world-centered waveform (center at X=0), place note to the right of waveform
				const waveformWidth = 120;
				const waveformRightX = waveformWidth / 2;
				const noteCanvasX = waveformRightX + 150;

				// Calculate Y position based on current playback time
				const waveformHeight = Math.max(rect.height * 3, duration * 100);
				const timeProgress = currentTime / duration;
				const noteCanvasY = timeProgress * waveformHeight;

				onAddNote(currentTime, noteCanvasX, noteCanvasY);

				// Small delay to allow React to update the notes array before enabling interactions
				setTimeout(() => {
					setDragOccurred(false);
				}, 50);
			},
			[canvasRef, duration, currentTime, onAddNote, setDragOccurred]
		);

		const handleRecenterToPlayhead = useCallback(() => {
			if (!canvasRef.current) return;

			const canvas = canvasRef.current;
			const canvasHeight = canvas.height;

			// If already following playhead, reset x value as well
			if (isFollowingPlayhead) {
				setTransformSafe((prev) => ({
					offsetX: 0, // Center X
					offsetY: prev.offsetY,
					scale: prev.scale,
				}));
				return; // Keep following enabled
			}

			// First click: just follow Y axis with current scale
			const timeProgress = duration > 0 ? currentTime / duration : 0;
			const baseWaveformHeight = Math.max(canvasHeight * 3, duration * 100);
			const scaledWaveformHeight = baseWaveformHeight * transform.scale;
			const targetPlayheadY = timeProgress * scaledWaveformHeight;
			const playheadPositionY = canvasHeight * 0.33;

			setTransformSafe((prev) => ({
				offsetX: prev.offsetX, // Preserve user's horizontal view
				offsetY: playheadPositionY - targetPlayheadY,
				scale: prev.scale, // Maintain current zoom level
			}));

			// Enable playhead following mode
			setIsFollowingPlayhead(true);
		}, [currentTime, duration, transform.scale, isFollowingPlayhead, setTransformSafe, setIsFollowingPlayhead]);

		// Register the recenter function with the context
		useEffect(() => {
			setRecenterToPlayhead(handleRecenterToPlayhead);
		}, [setRecenterToPlayhead, handleRecenterToPlayhead]);

		// Expose methods to parent component
		useImperativeHandle(ref, () => ({
			seekToTime: seekToTime,
			getCanvasTransform: () => transform,
			playPause: playPause,
			skipBack: skipBack,
			skipForward: skipForward,
			addNoteAtCurrentTime: () => {
				const syntheticEvent = {
					stopPropagation: () => {},
				} as React.MouseEvent;
				handleAddNoteAtCurrentTime(syntheticEvent);
			},
			volumeUp: volumeUp,
			volumeDown: volumeDown,
			exportThumbnail: (width = 480, height = 120) => {
				const src = canvasRef.current;
				if (!src) return null;
				try {
					const target = document.createElement('canvas');
					const dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1));
					target.width = width * dpr;
					target.height = height * dpr;
					const ctx = target.getContext('2d');
					if (!ctx) return null;
					// Optional background fill to ensure consistent look
					ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--bg-primary') || '#111827';
					ctx.fillRect(0, 0, target.width, target.height);
					// Draw scaled snapshot without distortion: crop source to match target aspect
					ctx.imageSmoothingEnabled = true;
					const srcAR = src.width / src.height;
					const tgtAR = target.width / target.height;
					let sx = 0,
						sy = 0,
						sWidth = src.width,
						sHeight = src.height;
					if (srcAR > tgtAR) {
						// Source is wider; crop left/right
						sWidth = Math.floor(src.height * tgtAR);
						sx = Math.floor((src.width - sWidth) / 2);
					} else if (srcAR < tgtAR) {
						// Source is taller; crop top/bottom
						sHeight = Math.floor(src.width / tgtAR);
						sy = Math.floor((src.height - sHeight) / 2);
					}
					ctx.drawImage(src, sx, sy, sWidth, sHeight, 0, 0, target.width, target.height);
					// Prefer webp, fallback to png if unsupported
					const webp = target.toDataURL('image/webp', 0.8);
					if (webp && webp.startsWith('data:image/webp')) return webp;
					return target.toDataURL('image/png');
				} catch {
					return null;
				}
			},
			pause: () => {
				try {
					wavesurferLocalRef.current?.pause();
				} catch {
					/* ignore */
				}
			},
		}));

		// Create context value
		const contextValue = {
			// Canvas state
			transform,
			setTransform,

			// Interaction state
			isPanning,
			setIsPanning,
			lastPanPoint,
			setLastPanPoint,
			isFollowingPlayhead,
			setIsFollowingPlayhead,

			// Note state
			notes,
			editingNote,
			setEditingNote,
			editContent,
			setEditContent,
			dragging,
			setDragging,
			dragOccurred,
			setDragOccurred,

			// Drawing state
			isDrawingMode: toolMode === 'draw',
			isDrawing,
			setIsDrawing,
			currentStroke,
			setCurrentStroke,
			drawingStartPos,
			setDrawingStartPos,
			drawingSession,
			setDrawingSession,
			drawingNoteId,
			setDrawingNoteId,
			toolMode,
			setToolMode,
			selectionBox,
			setSelectionBox,
			selectedDrawingIds,
			setSelectedDrawingIds,
			selectedStrokeGroups,
			setSelectedStrokeGroups,
			erasingStrokeIds,
			setErasingStrokeIds,
			eraserCursor,
			setEraserCursor,
			movingStrokePreview,
			setMovingStrokePreview,

			// Event handlers
			onAddNote,
			onUpdateNote,
			onDeleteNote,
			onMoveNote,
			onAddDrawing,
			onUpdateDrawing,

			// Refs
			canvasRef,

			// Constants
			NOTE_LABEL_HIDE_THRESHOLD,

			// Context menu
			contextMenu,
			setContextMenu,

			// Delete confirmation
			deleteConfirmNoteId,
			setDeleteConfirmNoteId,

			// Shared Layout Cache
			noteLayoutCache: noteLayoutCacheRef.current,
		};

		return (
			<WaveformProvider value={contextValue}>
				{/* Main content area with waveform */}
				<div className="flex h-screen pb-12">
					{/* Canvas Waveform Container */}
					<div className="flex-1 overflow-hidden bg-neutral-900 relative rounded-2xl">
						<div className="absolute inset-0">
							<WaveformPlayerContent />
							<div ref={waveformRef} className="hidden" />
							{/* Fullscreen loading overlay handled at the page level */}
						</div>
					</div>
				</div>
			</WaveformProvider>
		);
	}
);

WaveformPlayer.displayName = 'WaveformPlayer';

export default WaveformPlayer;
