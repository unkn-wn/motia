import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef, useCallback, useMemo, memo } from 'react';
import WaveSurfer from 'wavesurfer.js';
import { useAudio } from '@contexts/objects/AudioContextObject';
import { currentTimeStore } from '@components/AudioControls/state';
import type { Note, CanvasTransform, ToolMode } from '@types';
import type { DrawingPoint, DrawingSession } from '@types';

// Import refactored components and hooks
import { WaveformProvider } from '@contexts/WaveformContext';
import type { CanvasDrag, ContextMenuState } from '@contexts/objects/WaveformContextObject';
import { WaveformPlayerContent } from './components/WaveformPlayerContent';
import type { BoardFormat, Frame, StoryboardSymbol } from '@/features/storyboard/types';
import { useStoryboard } from '@/features/storyboard/StoryboardContext';
import { cardPositionAt, timeAxisOf } from './hooks/frameCanvas';
import { timeToAxis } from '@/features/storyboard/canvas/layout';
import { Navigation } from '@/features/navigation/Navigation';

interface WaveformPlayerProps {
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
	orientation?: import('@types').CanvasOrientation;
	// Storyboard frames drawn on the canvas
	frames: Frame[];
	board: BoardFormat;
	symbols: StoryboardSymbol[];
	/** The index rail along the canvas edge (key B) */
	showRail?: boolean;
	onChangeNoteColor?: (id: string, color: string) => void;
}

export interface WaveformPlayerRef {
	seekToTime: (time: number) => void;
	getCanvasTransform: () => { offsetX: number; offsetY: number; scale: number };
	playPause: () => void;
	skipBack: () => void;
	skipForward: () => void;
	addNoteAtCurrentTime: () => void;
	/** Adds an empty frame at the playhead, beside the waveform, and opens it in the frame editor. */
	addFrameAtCurrentTime: () => void;
	/** Where a new frame card for `time` goes on the canvas. */
	cardPositionAt: (time: number) => { canvasX: number; canvasY: number };
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
			orientation = 'vertical',
			frames,
			board,
			symbols,
			showRail = true,
			onChangeNoteColor,
		},
		ref
	) => {
		const waveformRef = useRef<HTMLDivElement>(null);
		const canvasRef = useRef<HTMLCanvasElement>(null);
		const wavesurferLocalRef = useRef<WaveSurfer | null>(null);
		// No local wavesurfer ref needed; the instance is stored in AudioContext via setWavesurferRef

		// Use audio context for shared state
		const {
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
		const [transform, setTransform] = useState<CanvasTransform>(() => {
			if (orientation === 'horizontal') {
				const w = typeof window !== 'undefined' ? window.innerWidth : 1200;
				const h = typeof window !== 'undefined' ? window.innerHeight : 800;
				return {
					offsetX: w * 0.33 - w / 2, // Lead on X axis (start of waveform at 33% from left)
					offsetY: h / 2,            // Waveform centered on Y axis
					scale: 1,
				};
			}
			return { offsetX: 0, offsetY: 150, scale: 1 };
		});
		const [isPanning, setIsPanning] = useState(false);
		const [lastPanPoint, setLastPanPoint] = useState({ x: 0, y: 0 });
		const [isFollowingPlayhead, setIsFollowingPlayhead] = useState(true); // Start with auto-tracking enabled
		const transformRef = useRef(transform);

		// Synchronize transform when orientation switches
		const prevOrientationRef = useRef(orientation);
		useEffect(() => {
			if (prevOrientationRef.current !== orientation) {
				prevOrientationRef.current = orientation;
				const rect = canvasRef.current?.getBoundingClientRect();
				const w = rect?.width || (typeof window !== 'undefined' ? window.innerWidth : 1200);
				const h = rect?.height || (typeof window !== 'undefined' ? window.innerHeight : 800);
				if (orientation === 'horizontal') {
					setTransform((prev) => ({
						offsetX: w * 0.33 - w / 2,
						offsetY: h / 2,
						scale: prev.scale,
					}));
				} else {
					setTransform((prev) => ({
						offsetX: 0,
						offsetY: 150,
						scale: prev.scale,
					}));
				}
			}
		}, [orientation, canvasRef]);

		// Shared layout cache for notes (renderer populates, hit-test reads)
		const noteLayoutCacheRef = useRef<Map<string, { key: string; lines: string[]; noteHeight: number }>>(new Map());

		// Note interaction state
		const [editingNote, setEditingNote] = useState<string | null>(null);
		const [editContent, setEditContent] = useState('');
		const [dragging, setDragging] = useState<CanvasDrag | null>(null);
		const [dragOccurred, setDragOccurred] = useState(false);

		// Context menu and delete-confirm state
		const [contextMenu, setContextMenu] = useState<ContextMenuState>({
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
			framePositions?: Array<{ id: string; x: number; y: number }>;
		} | null>(null);
		const [selectedStrokeGroups, setSelectedStrokeGroups] = useState<{ noteId: string; strokeIndexes: number[] }[]>([]);
		const [selectedFrameIds, setSelectedFrameIds] = useState<Set<string>>(() => new Set());
		const storyboard = useStoryboard();
		const storyboardRef = useRef(storyboard);
		storyboardRef.current = storyboard;
		const [movingStrokePreview, setMovingStrokePreview] = useState<{
			noteId: string;
			strokeIndexes: number[];
			dx: number;
			dy: number;
		} | null>(null);
		useEffect(() => {
			if (toolMode !== 'select') {
				setSelectionBox(null);
				setSelectedFrameIds(new Set());
				setSelectedDrawingIds(new Set());
				setSelectedStrokeGroups([]);
				setMovingStrokePreview(null);
				setShowSelectionActions(false);
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
			// (a frame drag in progress is kept as one undo step; a selection move goes back)
			storyboardRef.current.abortLiveEdit();
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
		const [showSelectionActions, setShowSelectionActions] = useState(false);
		const [currentStroke, setCurrentStroke] = useState<DrawingPoint[]>([]);
		const [drawingStartPos, setDrawingStartPos] = useState<{ x: number; y: number } | null>(null);
		const [drawingSession, setDrawingSession] = useState<DrawingSession | null>(null);
		const [drawingNoteId, setDrawingNoteId] = useState<string | null>(null);

		// Note interaction constants
		const NOTE_LABEL_HIDE_THRESHOLD = 0;

		// Initialize WaveSurfer when an audio file is present; otherwise synthesize a fallback waveform
		useEffect(() => {
			if (!waveformRef.current) return;
			// A song (or none) starts at 0: playback time is kept outside React, so the last project's time would
			// otherwise carry over (the trim start, if any, is applied once the song is ready)
			setCurrentTime(0);

			// NO AUDIO FILE - random placeholder waveform
			if (!audioFile) {
				setDuration(0);
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

			// Playback time, once per animation frame. Phones update the audio element's time in coarse steps (every
			// 100–250 ms), which made everything following the playhead jump; so while playing, time runs on the frame
			// clock and eases toward each fresh reading. A seek or a stall (a reading far off) snaps to it.
			let timeFrame = 0;
			let clock: { base: number; at: number; reading: number } | null = null;
			const SNAP_S = 0.3;
			const EASE = 0.2;
			const tick = (now: number) => {
				const reading = wavesurfer.getCurrentTime();
				if (!clock) clock = { base: reading, at: now, reading };
				let t = clock.base + ((now - clock.at) / 1000) * wavesurfer.getPlaybackRate();
				if (reading !== clock.reading) {
					const err = reading - t;
					t = Math.abs(err) > SNAP_S ? reading : t + err * EASE;
					clock = { base: t, at: now, reading };
				}
				setCurrentTime(t);
				timeFrame = requestAnimationFrame(tick);
			};
			const syncTime = () => {
				clock = null;
				setCurrentTime(wavesurfer.getCurrentTime());
			};
			wavesurfer.on('interaction', syncTime);
			wavesurfer.on('seeking', syncTime);
			wavesurfer.on('play', () => {
				cancelAnimationFrame(timeFrame);
				clock = null;
				timeFrame = requestAnimationFrame(tick);
				setIsPlaying(true);
			});
			wavesurfer.on('pause', () => {
				// Where it stopped, exactly
				cancelAnimationFrame(timeFrame);
				syncTime();
				setIsPlaying(false);
			});

			return () => {
				cancelAnimationFrame(timeFrame);
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

		// Navigation jump: seek, then centre the item (or the waveform at that time) and stop following
		const jumpTo = useCallback(
			(time: number, at?: { x: number; y: number }) => {
				seekToTime(time);
				setIsFollowingPlayhead(false);
				const rect = canvasRef.current?.getBoundingClientRect();
				if (!rect || (!at && duration <= 0)) return;
				const along = () => timeToAxis(time, timeAxisOf(rect, duration, orientation));
				const p = at ?? (orientation === 'horizontal' ? { x: along(), y: 0 } : { x: 0, y: along() });
				setTransformSafe((prev) => ({ ...prev, offsetX: -p.x * prev.scale, offsetY: rect.height / 2 - p.y * prev.scale }));
			},
			[seekToTime, duration, orientation, setTransformSafe]
		);

		// Follow the playhead: keep it at 33 % of the view as time moves. Subscribed to the time store (not a render per
		// tick), and paused while the frame editor covers the canvas (it catches up when the editor closes).
		const followPaused = storyboard.editingFrameId !== null;
		useEffect(() => {
			if (!isFollowingPlayhead || !canvasRef.current || duration === 0 || followPaused) return;
			const canvas = canvasRef.current;
			const follow = () => {
				const rect = canvas.getBoundingClientRect();
				const timeProgress = currentTimeStore.getSnapshot() / duration;
				setTransformSafe((prev) => {
					if (orientation === 'horizontal') {
						const scaledWaveformWidth = Math.max(rect.width * 3, duration * 100) * prev.scale;
						// Screen X is rect.width / 2 + offsetX + playhead X; the playhead goes 33 % from the left
						const offsetX = rect.width * 0.33 - rect.width / 2 - timeProgress * scaledWaveformWidth;
						return offsetX === prev.offsetX ? prev : { ...prev, offsetX };
					}
					const scaledWaveformHeight = Math.max(rect.height * 3, duration * 100) * prev.scale;
					// The playhead goes 33 % from the top
					const offsetY = rect.height * 0.33 - timeProgress * scaledWaveformHeight;
					return offsetY === prev.offsetY ? prev : { ...prev, offsetY };
				});
			};
			follow();
			return currentTimeStore.subscribe(follow);
		}, [duration, transform.scale, isFollowingPlayhead, orientation, canvasRef, setTransformSafe, followPaused]);

		const handleAddNoteAtCurrentTime = useCallback(
			(e: React.MouseEvent) => {
				e.stopPropagation();
				if (!canvasRef.current || duration === 0) return;

				const rect = canvasRef.current.getBoundingClientRect();
				const currentTime = currentTimeStore.getSnapshot();
				const timeProgress = currentTime / duration;

				if (orientation === 'horizontal') {
					const waveformWidth = Math.max(rect.width * 3, duration * 100);
					const noteCanvasX = timeProgress * waveformWidth;
					const noteCanvasY = 160; // Place below the horizontal waveform
					onAddNote(currentTime, noteCanvasX, noteCanvasY);
				} else {
					// With world-centered waveform (center at X=0), place note to the right of waveform
					const waveformWidth = 120;
					const waveformRightX = waveformWidth / 2;
					const noteCanvasX = waveformRightX + 150;

					// Calculate Y position based on current playback time
					const waveformHeight = Math.max(rect.height * 3, duration * 100);
					const noteCanvasY = timeProgress * waveformHeight;

					onAddNote(currentTime, noteCanvasX, noteCanvasY);
				}

				// Small delay to allow React to update the notes array before enabling interactions
				setTimeout(() => {
					setDragOccurred(false);
				}, 50);
			},
			[canvasRef, duration, orientation, onAddNote, setDragOccurred]
		);

		const { handleAddFrame, openFrameEditor } = storyboard;
		const renderPaused = storyboard.editingFrameId !== null;
		const handleAddFrameAtCurrentTime = useCallback(() => {
			if (!canvasRef.current || duration === 0) return;
			const currentTime = currentTimeStore.getSnapshot();
			const { canvasX, canvasY } = cardPositionAt(canvasRef.current, currentTime, duration, orientation, frames, board);
			openFrameEditor(handleAddFrame(currentTime, canvasX, canvasY));
		}, [duration, orientation, frames, board, handleAddFrame, openFrameEditor]);

		const handleRecenterToPlayhead = useCallback(() => {
			if (!canvasRef.current) return;

			const canvas = canvasRef.current;
			const timeProgress = duration > 0 ? currentTimeStore.getSnapshot() / duration : 0;

			if (orientation === 'horizontal') {
				const rect = canvas.getBoundingClientRect();
				const canvasWidth = rect.width || window.innerWidth;
				const canvasHeight = rect.height || window.innerHeight;

				if (isFollowingPlayhead) {
					setTransformSafe((prev) => ({
						offsetX: prev.offsetX,
						offsetY: canvasHeight / 2, // Realign Y to vertical center
						scale: prev.scale,
					}));
					return;
				}
				const baseWaveformWidth = Math.max(canvasWidth * 3, duration * 100);
				const scaledWaveformWidth = baseWaveformWidth * transform.scale;
				const targetPlayheadX = timeProgress * scaledWaveformWidth;
				const targetScreenX = canvasWidth * 0.33;

				setTransformSafe((prev) => ({
					offsetX: targetScreenX - canvasWidth / 2 - targetPlayheadX,
					offsetY: prev.offsetY || canvasHeight / 2,
					scale: prev.scale,
				}));
				setIsFollowingPlayhead(true);
			} else {
				const canvasHeight = canvas.height || window.innerHeight;
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
			}
		}, [duration, transform.scale, isFollowingPlayhead, orientation, setTransformSafe, setIsFollowingPlayhead]);

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
			addFrameAtCurrentTime: handleAddFrameAtCurrentTime,
			cardPositionAt: (time: number) => {
				const doc = storyboard.storyboardRef.current;
				return cardPositionAt(canvasRef.current, time, duration, orientation, doc.frames, doc.board);
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

		// Create memoized context value to avoid re-rendering all consumers on every parent render
		const contextValue = useMemo(() => ({
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
			showSelectionActions,
			setShowSelectionActions,

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

			// Orientation
			orientation,

			// Storyboard frames
			frames,
			board,
			symbols,
			selectedFrameIds,
			setSelectedFrameIds,
			renderPaused,
			jumpTo,
			onChangeNoteColor,
		// eslint-disable-next-line react-hooks/exhaustive-deps
		}), [
			transform, isPanning, lastPanPoint, isFollowingPlayhead,
			notes, editingNote, editContent, dragging, dragOccurred,
			toolMode, isDrawing, currentStroke, drawingStartPos, drawingSession, drawingNoteId,
			selectionBox, selectedDrawingIds, selectedStrokeGroups,
			erasingStrokeIds, eraserCursor, movingStrokePreview, showSelectionActions,
			contextMenu, deleteConfirmNoteId, orientation,
			frames, board, symbols, selectedFrameIds, renderPaused, jumpTo,
			onAddNote, onUpdateNote, onDeleteNote, onMoveNote, onAddDrawing, onUpdateDrawing, onChangeNoteColor,
		]);

		return (
			<WaveformProvider value={contextValue}>
				{/* Main content area with waveform */}
				<div className="flex h-screen pb-12">
					{/* Canvas Waveform Container */}
					<div className="flex-1 overflow-hidden bg-neutral-900 relative rounded-2xl">
						<div className="absolute inset-0">
							<WaveformPlayerContent />
							<Navigation showRail={showRail} />
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

// Memoized: the page re-renders on every board edit (each move of a frame-editor drag); the canvas only needs to
// when its own props change
export default memo(WaveformPlayer);
