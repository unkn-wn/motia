import React, { useCallback, useEffect, useRef } from 'react';
import { useWaveformContext } from '@contexts/objects/WaveformContextObject';
import { useMouseInteractions } from '../hooks/useMouseInteractions';
import { usePointerInteractions } from '../hooks/usePointerInteractions';
import { useDrawingInteractions } from '../hooks/useDrawingInteractions';
import { screenToCanvasCoords, findNoteAtPosition, isClickInWaveform, getTimeFromCanvasY, getWaveformDimensions } from '@utils/canvasUtils';
import { useAudio } from '@contexts/objects/AudioContextObject';
import { useStoryboard } from '@/features/storyboard/StoryboardContext';
import { targetTime, useFrameTargetAt } from '../hooks/frameCanvas';
import { startSelectionMove } from '../hooks/mouse/selectionMouseHandlers';

const DOUBLE_CLICK_MS = 500;

export const WaveformCanvas: React.FC = () => {
	const { canvasRef, transform, isDrawingMode, toolMode, isPanning, dragOccurred, notes, NOTE_LABEL_HIDE_THRESHOLD, noteLayoutCache, setEditingNote, setEditContent, frames, orientation = 'vertical' } =
		useWaveformContext();
	// Selection / drawings state pulled once (avoid calling hook inside handlers)
	const { selectionBox, setSelectionBox, setSelectedStrokeGroups, setSelectedDrawingIds } = useWaveformContext();

	const { duration, seekToTime } = useAudio();
	const { handleMouseDown, handleMouseMove } = useMouseInteractions();
	const { handlePointerDown, handlePointerMove, handlePointerUp } = usePointerInteractions();
	const { handleDrawingStart } = useDrawingInteractions();
	const waveformCtx = useWaveformContext();
	const { setContextMenu, setIsPanning, setSelectedFrameIds } = waveformCtx;
	const frameTargetAt = useFrameTargetAt();
	const storyboard = useStoryboard();
	const { openFrameEditor } = storyboard;
	// Right-click hold timer state
	const holdTimerRef = useRef<number | null>(null);
	const rightButtonDownRef = useRef(false);
	const lastRCDownPosRef = useRef<{ x: number; y: number } | null>(null);

	// Enhanced mouse down handler that includes drawing
	const enhancedHandleMouseDown = useCallback(
		(e: React.MouseEvent<HTMLCanvasElement>) => {
			// First call the base mouse handler
			handleMouseDown(e);

			// Then handle drawing if in drawing mode
			// Selection tool start
			if (toolMode === 'select' && e.button === 0) {
				const rect = canvasRef.current?.getBoundingClientRect();
				if (!rect) return;
				const { canvasX, canvasY } = screenToCanvasCoords(e.clientX, e.clientY, rect, transform);
				if (
					selectionBox &&
					canvasX >= selectionBox.x &&
					canvasX <= selectionBox.x + selectionBox.w &&
					canvasY >= selectionBox.y &&
					canvasY <= selectionBox.y + selectionBox.h
				) {
					// Begin move of existing selection
					startSelectionMove(waveformCtx, storyboard, canvasX, canvasY);
				} else {
					// Clicked outside existing selection — clear old selection and start fresh
					setSelectedStrokeGroups?.([]);
					setSelectedDrawingIds?.(new Set());
					setSelectedFrameIds(new Set());
					// Start new selection box
					setSelectionBox?.({ x: canvasX, y: canvasY, w: 0, h: 0, dragging: true, mode: 'create', anchorX: canvasX, anchorY: canvasY });
				}
				return;
			}

			if (isDrawingMode && e.button === 0 && toolMode === 'draw') {
				const rect = canvasRef.current?.getBoundingClientRect();
				if (!rect) return;

				const { canvasX, canvasY } = screenToCanvasCoords(e.clientX, e.clientY, rect, transform);
				handleDrawingStart(canvasX, canvasY);
			}
		},
		[
			handleMouseDown,
			isDrawingMode,
			toolMode,
			canvasRef,
			transform,
			handleDrawingStart,
			selectionBox,
			setSelectionBox,
			setSelectedStrokeGroups,
			setSelectedDrawingIds,
			waveformCtx,
			storyboard,
			setSelectedFrameIds,
		]
	);

	// The note or frame card under the last click: a click seeks, and a view following the playhead moves before
	// the second click of a double-click lands, so the double-click opens what was clicked
	const lastCardClickRef = useRef<{ kind: 'note' | 'frame'; id: string; t: number; x: number; y: number } | null>(null);

	const handleCanvasClick = useCallback(
		(e: React.MouseEvent<HTMLCanvasElement>) => {
			if (!canvasRef.current || isPanning || dragOccurred) return;

			// The second click of a double-click on a card: the double-click handles it (edit), not another seek
			const last = lastCardClickRef.current;
			if (last && e.timeStamp - last.t <= DOUBLE_CLICK_MS && Math.hypot(e.clientX - last.x, e.clientY - last.y) <= 6) return;

			const rect = canvasRef.current.getBoundingClientRect();
			const { canvasX, canvasY } = screenToCanvasCoords(e.clientX, e.clientY, rect, transform);

			// Check if clicking on a note - exclude drawings when not in drawing mode
			const clickedNote = findNoteAtPosition(
				canvasX,
				canvasY,
				notes,
				transform.scale,
				NOTE_LABEL_HIDE_THRESHOLD,
				!isDrawingMode,
				noteLayoutCache
			);

			if (clickedNote && !isDrawingMode) {
				// Seek to note time
				lastCardClickRef.current = clickedNote.type !== 'drawing' ? { kind: 'note', id: clickedNote.id, t: e.timeStamp, x: e.clientX, y: e.clientY } : null;
				seekToTime(clickedNote.time);
				return;
			}

			// Then frames: a card or anchor seeks to the frame's time, an end tick to its end
			const frameTarget = !toolMode ? frameTargetAt(canvasX, canvasY) : null;
			if (frameTarget) {
				seekToTime(targetTime(frameTarget));
				lastCardClickRef.current = frameTarget.kind === 'card' ? { kind: 'frame', id: frameTarget.frame.id, t: e.timeStamp, x: e.clientX, y: e.clientY } : null;
				return;
			}
			lastCardClickRef.current = null;
			if (duration === 0) return;

			// Check if click is within waveform bounds for seeking
			const { waveformX, waveformY, waveformWidth, waveformHeight } = getWaveformDimensions(rect.width, rect.height, duration, orientation);

			if (isClickInWaveform(canvasX, waveformX, waveformWidth, canvasY, waveformY, waveformHeight, orientation)) {
				const time = orientation === 'horizontal'
					? (canvasX / waveformWidth) * duration
					: getTimeFromCanvasY(canvasY, waveformHeight, duration);
				seekToTime(Math.max(0, Math.min(duration, time)));
			}
		},
		[canvasRef, duration, isPanning, dragOccurred, transform, orientation, notes, NOTE_LABEL_HIDE_THRESHOLD, isDrawingMode, seekToTime, noteLayoutCache, toolMode, frameTargetAt]
	);

	// Double-click a note to edit it inline, or a frame card to open it in the frame editor
	const handleDoubleClick = useCallback(
		(e: React.MouseEvent<HTMLCanvasElement>) => {
			if (toolMode || !canvasRef.current) return;
			const rect = canvasRef.current.getBoundingClientRect();
			const { canvasX, canvasY } = screenToCanvasCoords(e.clientX, e.clientY, rect, transform);
			const last = lastCardClickRef.current;
			lastCardClickRef.current = null;
			// Event times (when the clicks happened), not handler times
			const recent = last && e.timeStamp - last.t <= DOUBLE_CLICK_MS ? last : null;
			if (recent?.kind === 'frame' && frames.some((f) => f.id === recent.id)) {
				openFrameEditor(recent.id);
				return;
			}
			const clicked = recent?.kind === 'note' ? notes.find((n) => n.id === recent.id) : undefined;
			const note = clicked ?? findNoteAtPosition(canvasX, canvasY, notes, transform.scale, NOTE_LABEL_HIDE_THRESHOLD, true, noteLayoutCache);
			if (note) {
				setEditingNote(note.id);
				setEditContent(note.content || '');
				return;
			}
			const target = frameTargetAt(canvasX, canvasY);
			if (target?.kind === 'card') openFrameEditor(target.frame.id);
		},
		[toolMode, canvasRef, transform, frameTargetAt, openFrameEditor, notes, frames, NOTE_LABEL_HIDE_THRESHOLD, noteLayoutCache, setEditingNote, setEditContent]
	);

	const handleContextMenu = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
		// Always suppress the default browser menu; opening our menu is managed by right-hold logic
		e.preventDefault();
	}, []);

	// Also support right-button press (mousedown with button === 2) to open menu immediately for hold-select gesture
	const handleMouseDownForMenu = useCallback(
		(e: React.MouseEvent<HTMLCanvasElement>) => {
			if (e.button !== 2) return;
			if (!canvasRef.current) return;
			// Start hold detection for right-click
			rightButtonDownRef.current = true;
			lastRCDownPosRef.current = { x: e.clientX, y: e.clientY };
			e.preventDefault();

			const rect = canvasRef.current.getBoundingClientRect();
			const { canvasX, canvasY } = screenToCanvasCoords(e.clientX, e.clientY, rect, transform);
			const clickedNote = findNoteAtPosition(
				canvasX,
				canvasY,
				notes,
				transform.scale,
				NOTE_LABEL_HIDE_THRESHOLD,
				true, // exclude drawings: only text notes can open context menu
				noteLayoutCache
			);

			// Menu for text notes, else for a frame card (no tool active)
			const frameTarget = !clickedNote && !toolMode ? frameTargetAt(canvasX, canvasY) : null;
			const frameId = frameTarget?.kind === 'card' ? frameTarget.frame.id : null;
			if (!clickedNote && !frameId) return;

			// Open after a short hold; cancel if mouseup happens first
			if (holdTimerRef.current) window.clearTimeout(holdTimerRef.current);
			holdTimerRef.current = window.setTimeout(() => {
				if (rightButtonDownRef.current) {
					// If panning is still flagged, clear it before opening menu
					if (isPanning) setIsPanning(false);
					const pos = lastRCDownPosRef.current || { x: e.clientX, y: e.clientY };
					setContextMenu(
						clickedNote
							? { isOpen: true, x: pos.x, y: pos.y, noteId: clickedNote.id }
							: { isOpen: true, x: pos.x, y: pos.y, noteId: null, frameId }
					);
				}
			}, 100); // 100ms hold right click to open menu
		},
		[canvasRef, transform, notes, NOTE_LABEL_HIDE_THRESHOLD, setContextMenu, isPanning, setIsPanning, noteLayoutCache, toolMode, frameTargetAt]
	);

	// Cancel hold if right button released anywhere
	useEffect(() => {
		const onDocMouseUp = (ev: MouseEvent) => {
			if (ev.button === 2) {
				rightButtonDownRef.current = false;
				if (holdTimerRef.current) {
					window.clearTimeout(holdTimerRef.current);
					holdTimerRef.current = null;
				}
			}
		};
		document.addEventListener('mouseup', onDocMouseUp);
		return () => {
			document.removeEventListener('mouseup', onDocMouseUp);
			if (holdTimerRef.current) {
				window.clearTimeout(holdTimerRef.current);
				holdTimerRef.current = null;
			}
		};
	}, []);

	// Prevent default touch behavior to stop text selection on mobile
	// Must use native event listener with passive: false to allow preventDefault
	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;

		const handleTouchStart = (e: TouchEvent) => {
			// Prevent text selection on double-tap-and-hold
			if (toolMode === 'draw' || toolMode === 'select' || toolMode === 'erase') {
				e.preventDefault();
			}
		};

		canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
		return () => {
			canvas.removeEventListener('touchstart', handleTouchStart);
		};
	}, [toolMode, canvasRef]);

	return (
		<canvas
			ref={canvasRef}
			className={`w-full h-full touch-none select-none touch-callout-none no-user-drag no-tap-highlight ${
				toolMode === 'draw'
					? 'bg-neutral-700/50 cursor-crosshair'
					: toolMode === 'erase'
					? 'bg-red-900/10 cursor-cell'
					: toolMode === 'select'
					? 'bg-blue-900/10 cursor-crosshair'
					: isPanning
					? 'bg-neutral-800 cursor-grabbing'
					: 'bg-neutral-800 cursor-grab'
			}`}
			draggable={false}
			onDragStart={(e) => e.preventDefault()}
			onClick={handleCanvasClick}
			onDoubleClick={handleDoubleClick}
			onMouseDown={(e) => {
				handleMouseDownForMenu(e);
				enhancedHandleMouseDown(e);
			}}
			onMouseMove={handleMouseMove}
			onPointerDown={handlePointerDown}
			onPointerMove={handlePointerMove}
			onPointerUp={handlePointerUp}
			onPointerCancel={handlePointerUp}
			onContextMenu={handleContextMenu}
		/>
	);
};
