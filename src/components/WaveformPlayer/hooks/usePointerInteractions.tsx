import { useCallback, useEffect, useRef } from 'react';
import { commitEraser } from './mouse/eraserMouseHandlers';
import { useWaveformContext } from '@contexts/objects/WaveformContextObject';
import { distanceBetween, midpoint, computePinchScale } from '@utils/touchUtils';
import { screenToCanvasCoords, findNoteAtPosition, isClickInWaveform, getTimeFromCanvasY, getWaveformDimensions } from '@utils/canvasUtils';
import { useDrawingInteractions } from './useDrawingInteractions';
import { handleSelectionCreate, handleSelectionMove, commitSelectionMove, startSelectionMove } from './mouse/selectionMouseHandlers';
import { useStoryboard } from '@/features/storyboard/StoryboardContext';
import type { CanvasDrag } from '@contexts/objects/WaveformContextObject';
import { frameDragFrom, targetTime, useFrameTargetAt } from './frameCanvas';
import { updateEraserPreview } from './mouse/eraserMouseHandlers';
import { useAudio } from '@contexts/objects/AudioContextObject';
import { history } from '@utils/history';
type Ctx = ReturnType<typeof import('@contexts/objects/WaveformContextObject').useWaveformContext>;

export const usePointerInteractions = () => {
	// Capture full context once for reuse in handlers
	const ctx = useWaveformContext();
	const { duration, seekToTime } = useAudio();
	const {
		canvasRef,
		transform,
		setTransform,
		isDrawingMode,
		isDrawing,
		setIsDrawing,
		setCurrentStroke,
		setDrawingStartPos,
		toolMode,
		isPanning,
		lastPanPoint,
		setDragOccurred,
		setDragging,
		setIsPanning,
		setLastPanPoint,
		setIsFollowingPlayhead,
		notes,
		NOTE_LABEL_HIDE_THRESHOLD,
		noteLayoutCache,
		selectionBox,
		setSelectionBox,
	} = ctx;

	// Track active pointers for pinch/drag
	const pointers = useRef<Map<number, { x: number; y: number }>>(new Map());
	// Track initial tap position/time for single-finger tap detection
	const tapStarts = useRef<Map<number, { x: number; y: number; t: number }>>(new Map());
	// Track potential single-finger pan start (activate after small threshold)
	const pendingPanStart = useRef<{ x: number; y: number } | null>(null);
	const initialPinch = useRef<{ distance: number; midpointX: number; midpointY: number; initialScale: number } | null>(null);
	const { handleDrawingStart } = useDrawingInteractions();
	// Track touch-based erasing (there is no buttons bitfield on touch)
	const eraseActiveRef = useRef<boolean>(false);
	// Defer starting erasing until we know it's a single-finger intent
	const pendingEraserStartRef = useRef<{ x: number; y: number; t: number } | null>(null);
	// Guard to suppress erasing during multi-touch sessions
	const multiTouchActiveRef = useRef<boolean>(false);

	// Single predicate to decide if touch erasing is allowed right now
	const allowTouchErase = () => {
		return !multiTouchActiveRef.current && pointers.current.size === 1;
	};

	// Global touch listeners to detect multi-touch even when second finger starts off-canvas
	useEffect(() => {
		const onTouchStart = (ev: TouchEvent) => {
			if (ev.touches && ev.touches.length >= 2) {
				multiTouchActiveRef.current = true;
				// Immediately suppress any eraser state/cursor
				eraseActiveRef.current = false;
				pendingEraserStartRef.current = null;
				ctx.setEraserCursor?.(null);
				ctx.setErasingStrokeIds?.([]);
			}
		};
		const onTouchEndCancel = (ev: TouchEvent) => {
			if (!ev.touches || ev.touches.length < 2) multiTouchActiveRef.current = false;
		};
		window.addEventListener('touchstart', onTouchStart, { passive: true });
		window.addEventListener('touchend', onTouchEndCancel, { passive: true });
		window.addEventListener('touchcancel', onTouchEndCancel, { passive: true });
		return () => {
			window.removeEventListener('touchstart', onTouchStart);
			window.removeEventListener('touchend', onTouchEndCancel);
			window.removeEventListener('touchcancel', onTouchEndCancel);
		};
	}, [ctx]);
	// Track last two-finger midpoint for drag-to-pan
	const lastTwoFingerMidRef = useRef<{ x: number; y: number } | null>(null);
	// Track long-press for opening context menu on touch
	const longPressTimerRef = useRef<number | null>(null);
	const longPressTriggeredRef = useRef<boolean>(false);
	// Track a candidate for touch-based dragging of a note or frame (when no tool active). `menu` says what a
	// long-press opens: the note menu, the frame menu (cards only), or nothing (anchor dots, end ticks).
	const touchDragCandidateRef = useRef<null | {
		drag: CanvasDrag;
		startClientX: number;
		startClientY: number;
		menu: 'note' | 'frame' | null;
	}>(null);
	// Last tap on a note or frame card: a second tap opens its editor. The second tap counts by where the finger
	// lands, not what is under it: the first tap seeks, and a view following the playhead may have moved the card.
	const lastCardTapRef = useRef<{ id: string; kind: 'note' | 'frame'; x: number; y: number; t: number } | null>(null);
	// Times are the events' own (when the finger lifted), so a busy page doesn't turn a quick double-tap into two taps
	const isSecondTap = (x: number, y: number, t: number) => {
		const last = lastCardTapRef.current;
		return !!last && t - last.t <= 300 && Math.hypot(x - last.x, y - last.y) <= 20;
	};
	const frameTargetAt = useFrameTargetAt();
	const storyboard = useStoryboard();
	// Deferred selection create for touch — prevents 2-finger pan from starting/cancelling a selection
	const pendingSelectionCreateRef = useRef<{ canvasX: number; canvasY: number; clientX: number; clientY: number } | null>(null);

	// touch-action is handled by CSS (touch-none on canvas). No effect needed.

	const handlePointerDown = useCallback(
		(e: React.PointerEvent<HTMLCanvasElement>) => {
			// Ignore mouse here; desktop uses existing mouse handlers
			if (e.pointerType === 'mouse') return;
			// capture pointer
			(e.target as Element).setPointerCapture?.(e.pointerId);

			pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
			// Record tap start for single-pointer gestures
			if (pointers.current.size === 1) {
				tapStarts.current.set(e.pointerId, { x: e.clientX, y: e.clientY, t: e.timeStamp });
			}

			const rect = canvasRef.current?.getBoundingClientRect();
			if (!rect) return;
			const { canvasX, canvasY } = screenToCanvasCoords(e.clientX, e.clientY, rect, transform);

			// If two pointers are now active, initialize pinch regardless of tool mode
			if (pointers.current.size === 2) {
				multiTouchActiveRef.current = true;
				const rect2 = canvasRef.current?.getBoundingClientRect();
				if (!rect2) return;
				const pts = Array.from(pointers.current.values());
				const dist = distanceBetween(pts[0], pts[1]);
				const m = midpoint(pts[0], pts[1]);
				// Cancel any active single-finger tool gestures when pinch starts
				if (toolMode === 'draw' && isDrawing) {
					setIsDrawing(false);
					setCurrentStroke?.([]);
					setDrawingStartPos?.(null);
				}
				if (toolMode === 'erase') {
					// Fully suppress eraser when a second finger joins
					eraseActiveRef.current = false;
					pendingEraserStartRef.current = null;
					ctx.setEraserCursor?.(null);
					ctx.setErasingStrokeIds?.([]);
				}
				if (selectionBox?.dragging) {
					// Cancel any in-progress selection drag on pinch start
					setSelectionBox?.(sb => sb ? { ...sb, dragging: false } : sb);
					// Cards moved live during a selection move go back with the strokes
					storyboard.cancelLiveEdit();
				}
				// Cancel deferred selection create
				pendingSelectionCreateRef.current = null;
				// A frame drag in progress goes back where it started
				if (ctx.dragging && ctx.dragging.kind !== 'note') {
					storyboard.cancelLiveEdit();
					setDragging(null);
				}
				// Cancel long-press and candidate drag on pinch start
				if (longPressTimerRef.current) {
					window.clearTimeout(longPressTimerRef.current);
					longPressTimerRef.current = null;
				}
				longPressTriggeredRef.current = false;
				touchDragCandidateRef.current = null;
				initialPinch.current = {
					// Clamp initial distance to reduce sensitivity when fingers start very close
					distance: Math.max(dist, 10),
					midpointX: m.x - rect2.left - rect2.width / 2,
					midpointY: m.y - rect2.top,
					initialScale: transform.scale,
				};
				// Two-finger gesture should cancel follow-playhead
				setIsFollowingPlayhead(false);
				setIsPanning(true);
				lastTwoFingerMidRef.current = { x: m.x - rect2.left - rect2.width / 2, y: m.y - rect2.top };
				return;
			}

			// Selection tool start (touch): begin move or defer create
			if (toolMode === 'select') {
				// Prevent panning while selecting
				setIsPanning(false);
				setDragOccurred(false);
				if (
					selectionBox &&
					!selectionBox.dragging &&
					canvasX >= selectionBox.x &&
					canvasX <= selectionBox.x + selectionBox.w &&
					canvasY >= selectionBox.y &&
					canvasY <= selectionBox.y + selectionBox.h
				) {
					// Begin move of existing selection
					startSelectionMove(ctx as Ctx, storyboard, canvasX, canvasY);
				} else {
					// Touched outside selection — defer create until we confirm single-finger drag.
					// If a second finger arrives (pinch), we'll cancel without affecting the old selection.
					pendingSelectionCreateRef.current = { canvasX, canvasY, clientX: e.clientX, clientY: e.clientY };
					ctx.setShowSelectionActions?.(false);
				}
				return;
			}

			// Eraser tool: mark active (touch has no buttons)
			if (toolMode === 'erase') {
				// If erasing is not allowed, suppress immediately
				if (!allowTouchErase()) {
					eraseActiveRef.current = false;
					pendingEraserStartRef.current = null;
					ctx.setEraserCursor?.(null);
					ctx.setErasingStrokeIds?.([]);
					return;
				}
				// If touch starts over an element that requests erase suppression (e.g., sidebar), skip
				const targetEl = e.target as HTMLElement | null;
				if (targetEl && targetEl.closest('[data-prevent-erase]')) {
					eraseActiveRef.current = false;
					pendingEraserStartRef.current = null;
				} else {
					// Don't start erasing immediately on touch-down; wait for a small
					// movement threshold so two-finger pinch/pan doesn't erase. (No timer promotion.)
					eraseActiveRef.current = false;
					pendingEraserStartRef.current = { x: e.clientX, y: e.clientY, t: Date.now() };
					setIsPanning(false);
					setDragOccurred(false);
				}
				return;
			}

			// On touch: if no tool is active and a note is under the finger, prepare for note drag or long-press menu
			if (!toolMode && pointers.current.size === 1) {
				const clickedNote = findNoteAtPosition(
					canvasX,
					canvasY,
					notes,
					transform.scale,
					NOTE_LABEL_HIDE_THRESHOLD,
					true, // exclude drawings: only text notes are draggable/contextable
					noteLayoutCache
				);
				const frameTarget = clickedNote ? null : frameTargetAt(canvasX, canvasY);
				if (clickedNote || frameTarget) {
					// Candidate for dragging this note or frame if the finger moves beyond threshold
					touchDragCandidateRef.current = clickedNote
						? {
								drag: {
									kind: 'note',
									id: clickedNote.id,
									startX: e.clientX,
									startY: e.clientY,
									initialCanvasX: clickedNote.canvasX,
									initialCanvasY: clickedNote.canvasY,
								},
								startClientX: e.clientX,
								startClientY: e.clientY,
								menu: 'note',
							}
						: {
								drag: frameDragFrom(frameTarget!, e.clientX, e.clientY),
								startClientX: e.clientX,
								startClientY: e.clientY,
								menu: frameTarget!.kind === 'card' ? 'frame' : null,
							};
					if (!touchDragCandidateRef.current.menu) return;
					// Start long-press to open context menu
					if (longPressTimerRef.current) window.clearTimeout(longPressTimerRef.current);
					longPressTriggeredRef.current = false;
					longPressTimerRef.current = window.setTimeout(() => {
						// If user hasn't moved far and still only one finger, open menu
						const cand = touchDragCandidateRef.current;
						if (!cand) return;
						if (pointers.current.size !== 1) return;
						longPressTriggeredRef.current = true;
						setIsPanning(false);
						setDragOccurred(true);
						// Open at current finger position
						ctx.setContextMenu?.(
							cand.menu === 'note'
								? { isOpen: true, x: e.clientX, y: e.clientY, noteId: cand.drag.id }
								: { isOpen: true, x: e.clientX, y: e.clientY, noteId: null, frameId: cand.drag.id }
						);
						// Clear candidate so we don't start dragging afterwards
						touchDragCandidateRef.current = null;
					}, 450);
					return;
				}
			}

			if (isDrawingMode && toolMode === 'draw') {
				handleDrawingStart(canvasX, canvasY);
				return;
			}

			// For single pointer with no active tool and no note under finger, prepare to pan (after threshold)
			if (pointers.current.size === 1 && !toolMode && !touchDragCandidateRef.current) {
				pendingPanStart.current = { x: e.clientX, y: e.clientY };
				// Do not set isPanning yet; wait for small movement to preserve tap-to-seek
			}
		},
		[
			isDrawingMode,
			toolMode,
			setIsPanning,
			setIsFollowingPlayhead,
			canvasRef,
			transform,
			setDragOccurred,
			handleDrawingStart,
			notes,
			NOTE_LABEL_HIDE_THRESHOLD,
			selectionBox,
			setSelectionBox,
			isDrawing,
			setIsDrawing,
			setCurrentStroke,
			setDrawingStartPos,
			ctx,
			frameTargetAt,
			storyboard,
		]
	);

	const handlePointerMove = useCallback(
		(e: React.PointerEvent<HTMLCanvasElement>) => {
			if (e.pointerType === 'mouse') return;
			if (!pointers.current.has(e.pointerId)) return;
			pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

			const rect = canvasRef.current?.getBoundingClientRect();
			if (!rect) return;

			// Convert screen to canvas coordinates helper
			const toCanvas = (clientX: number, clientY: number) => {
				const x = clientX - rect.left;
				const y = clientY - rect.top;
				return {
					x: (x - rect.width / 2 - transform.offsetX) / transform.scale,
					y: (y - transform.offsetY) / transform.scale,
				};
			};

			// Note dragging is handled by global handlers (pointermove on document)

			// Pinch-zoom + two-finger pan when two pointers are active (takes precedence over tools)
			if (pointers.current.size === 2) {
				multiTouchActiveRef.current = true;
				const pinchState = initialPinch.current;
				if (!pinchState) return; // not initialized yet
				// Process pinch on any pointer move to keep midpoint updates smooth
				// Ensure any single-finger actions are cancelled during pinch move
				if (isDrawing) {
					setIsDrawing(false);
					setCurrentStroke?.([]);
					setDrawingStartPos?.(null);
				}
				eraseActiveRef.current = false;
				pendingEraserStartRef.current = null;
				// Hide eraser cursor and any pending hits while pinching
				ctx.setEraserCursor?.(null);
				ctx.setErasingStrokeIds?.([]);
				if (selectionBox?.dragging) {
					setSelectionBox?.(null);
					storyboard.cancelLiveEdit();
				}
				const pts = Array.from(pointers.current.values());
				const dist = distanceBetween(pts[0], pts[1]);
				const m = midpoint(pts[0], pts[1]);
				// Current midpoint in screen-space coordinates used by transform mapping
				const curMidX = m.x - rect.left - rect.width / 2;
				const curMidY = m.y - rect.top;
				// Two-finger drag delta
				const last = lastTwoFingerMidRef.current ?? { x: curMidX, y: curMidY };
				const dx = curMidX - last.x;
				const dy = curMidY - last.y;
				setDragOccurred(true);
				setTransform((prev) => {
					// Compute scale against initial distance and initial scale to avoid compounding
					const { newScale } = computePinchScale(pinchState.distance, dist, pinchState.initialScale);
					// Use prev.scale for consistency to avoid jumps from stale closures
					const scaleChange = newScale / prev.scale;
					// Tiny deadzone to avoid micro teleports when gesture is jittery
					const effectiveScaleChange = Math.abs(scaleChange - 1) < 0.005 ? 1 : scaleChange;
					// Apply panning by midpoint delta first
					let nextOffsetX = prev.offsetX + dx;
					let nextOffsetY = prev.offsetY + dy;
					// Apply zoom around the original pivot point from gesture start
					nextOffsetX = nextOffsetX - (pinchState.midpointX - nextOffsetX) * (effectiveScaleChange - 1);
					nextOffsetY = nextOffsetY - (pinchState.midpointY - nextOffsetY) * (effectiveScaleChange - 1);
					return {
						scale: effectiveScaleChange === 1 ? prev.scale : newScale,
						offsetX: nextOffsetX,
						offsetY: nextOffsetY,
					};
				});
				// Prevent any browser-level gesture handling just in case
				const ne = e.nativeEvent as PointerEvent;
				if (ne.cancelable) e.preventDefault();
				// Update last midpoint for next move
				lastTwoFingerMidRef.current = { x: curMidX, y: curMidY };
				return;
			}

			// Cancel long-press if moving beyond small threshold
			const start = tapStarts.current.get(e.pointerId);
			if (start) {
				const dx0 = Math.abs(e.clientX - start.x);
				const dy0 = Math.abs(e.clientY - start.y);
				if (dx0 > 6 || dy0 > 6) {
					if (longPressTimerRef.current) {
						window.clearTimeout(longPressTimerRef.current);
						longPressTimerRef.current = null;
					}
				}
			}

			// Promote deferred selection create once user drags far enough (single finger only)
			if (toolMode === 'select' && pendingSelectionCreateRef.current && pointers.current.size === 1 && !selectionBox?.dragging) {
				const pending = pendingSelectionCreateRef.current;
				const dx0 = Math.abs(e.clientX - pending.clientX);
				const dy0 = Math.abs(e.clientY - pending.clientY);
				if (dx0 > 6 || dy0 > 6) {
					// User is dragging with one finger — start actual selection create
					ctx.setSelectedStrokeGroups?.([]);
					ctx.setSelectedFrameIds(new Set());
					ctx.setSelectedDrawingIds?.(new Set());
					setSelectionBox?.({ x: pending.canvasX, y: pending.canvasY, w: 0, h: 0, dragging: true, mode: 'create', anchorX: pending.canvasX, anchorY: pending.canvasY });
					pendingSelectionCreateRef.current = null;
					// Fall through to let the existing handler process this move
				}
			}

			// Selection box create/resize/move (touch parity with mouse)
			if (toolMode === 'select' && selectionBox?.dragging) {
				setDragOccurred(true);
				if (selectionBox.mode === 'create') {
					handleSelectionCreate(ctx as Ctx, e.nativeEvent as unknown as PointerEvent, toCanvas);
				} else if (selectionBox.mode === 'move') {
					handleSelectionMove(ctx as Ctx, e.nativeEvent as unknown as PointerEvent, toCanvas, storyboard);
				}
				return;
			}

			// Eraser hover/drag preview (touch): accumulate while active
			if (toolMode === 'erase') {
				// Ignore updates while swiping in areas that suppress erasing
				const targetEl = e.target as HTMLElement | null;
				if (targetEl && targetEl.closest('[data-prevent-erase]')) return;
				const p = toCanvas(e.clientX, e.clientY);
				// If erasing not allowed, clear and skip
				if (!allowTouchErase()) {
					eraseActiveRef.current = false;
					pendingEraserStartRef.current = null;
					ctx.setEraserCursor?.(null);
					ctx.setErasingStrokeIds?.([]);
					return;
				}
				// If not yet active, decide if we should promote to active erasing
				if (!eraseActiveRef.current) {
					const start = pendingEraserStartRef.current;
					const dx = start ? Math.abs(e.clientX - start.x) : 0;
					const dy = start ? Math.abs(e.clientY - start.y) : 0;
					// Promote only after a small move and still single-finger
					if (start && (dx > 6 || dy > 6) && allowTouchErase()) {
						eraseActiveRef.current = true;
						pendingEraserStartRef.current = null;
					}
				}
				if (eraseActiveRef.current) setDragOccurred(true);
				updateEraserPreview(ctx as Ctx, p, eraseActiveRef.current, 12);
				return;
			}

			// Touch note dragging when no tool is active
			if (!toolMode && touchDragCandidateRef.current) {
				const cand = touchDragCandidateRef.current;
				const movedX = Math.abs(e.clientX - cand.startClientX);
				const movedY = Math.abs(e.clientY - cand.startClientY);
				if (movedX > 6 || movedY > 6) {
					// Begin dragging the note or frame (moves and the end are handled by the global handlers)
					setDragOccurred(true);
					setDragging(cand.drag);
					if (cand.drag.kind === 'note') history.beginMove(cand.drag.id, { x: cand.drag.initialCanvasX, y: cand.drag.initialCanvasY });
					else storyboard.beginLiveEdit();
					// Cancel long-press and candidate
					if (longPressTimerRef.current) {
						window.clearTimeout(longPressTimerRef.current);
						longPressTimerRef.current = null;
					}
					longPressTriggeredRef.current = false;
					touchDragCandidateRef.current = null;
					return;
				}
			}

			// Otherwise, panning for single pointer
			// If no tool is active, enable one-finger pan after a small movement threshold
			if (!toolMode && !touchDragCandidateRef.current && pointers.current.size === 1 && !isPanning && pendingPanStart.current) {
				const dx0 = Math.abs(e.clientX - pendingPanStart.current.x);
				const dy0 = Math.abs(e.clientY - pendingPanStart.current.y);
				if (dx0 > 6 || dy0 > 6) {
					setIsPanning(true);
					setLastPanPoint({ x: e.clientX, y: e.clientY });
					setIsFollowingPlayhead(false);
					// Clear pending to avoid re-trigger
					pendingPanStart.current = null;
				}
			}
			if (isPanning) {
				e.preventDefault();
				const deltaX = e.movementX || e.clientX - lastPanPoint.x;
				const deltaY = e.movementY || e.clientY - lastPanPoint.y;
				setTransform((prev) => ({
					...prev,
					offsetX: prev.offsetX + deltaX,
					offsetY: prev.offsetY + deltaY,
				}));
				setLastPanPoint({ x: e.clientX, y: e.clientY });
			}
		},
		[
			canvasRef,
			transform,
			isPanning,
			lastPanPoint,
			setTransform,
			toolMode,
			selectionBox,
			setDragOccurred,
			ctx,
			isDrawing,
			setCurrentStroke,
			setDrawingStartPos,
			setIsDrawing,
			setSelectionBox,
			setIsPanning,
			setIsFollowingPlayhead,
			setLastPanPoint,
			setDragging,
			storyboard,
		]
	);

	const handlePointerUp = useCallback(
		(e: React.PointerEvent<HTMLCanvasElement>) => {
			if (e.pointerType === 'mouse') return;
			pointers.current.delete(e.pointerId);
			if (pointers.current.size < 2) initialPinch.current = null;
			if (isPanning) setIsPanning(false);
			// Commit touch-based erasing (mirror mouse logic) before clearing state
			if (toolMode === 'erase') commitEraser(ctx);
			// Clear erasing flags
			eraseActiveRef.current = false;
			pendingEraserStartRef.current = null;
			ctx.setEraserCursor?.(null);
			ctx.setErasingStrokeIds?.([]);

			// Touch selection finalization
			if (toolMode === 'select') {
				// Handle deferred tap-outside: user tapped outside selection but didn't drag
				if (pendingSelectionCreateRef.current) {
					pendingSelectionCreateRef.current = null;
					// Clear selection entirely (tap-outside-to-deselect)
					setSelectionBox?.(null);
					ctx.setSelectedStrokeGroups?.([]);
					ctx.setSelectedFrameIds(new Set());
					ctx.setSelectedDrawingIds?.(new Set());
					ctx.setShowSelectionActions?.(false);
				}

				// Finalize selection move/create (set dragging:false)
				if (selectionBox?.dragging) {
					const isCreate = selectionBox.mode === 'create';
					const hasHits = !!(ctx.selectedStrokeGroups && ctx.selectedStrokeGroups.length > 0) || ctx.selectedFrameIds.size > 0;
					if (isCreate && !hasHits) {
						// Created a box with no hits — clear everything
						setSelectionBox?.(null);
						ctx.setSelectedStrokeGroups?.([]);
						ctx.setSelectedFrameIds(new Set());
						ctx.setSelectedDrawingIds?.(new Set());
					} else {
						// Keep box, just stop dragging
						setSelectionBox?.(sb => sb ? { ...sb, dragging: false } : sb);
						// Commit the moved strokes and cards as one undo step
						if (selectionBox.mode === 'move') commitSelectionMove(ctx as Ctx, storyboard);
					}
					ctx.setMovingStrokePreview?.(null);
				}

				// Detect tap-inside-selection: move mode, minimal displacement → toggle delete popup
				if (selectionBox?.mode === 'move') {
					const start = tapStarts.current.get(e.pointerId);
					if (start) {
						const tapDx = Math.abs(e.clientX - start.x);
						const tapDy = Math.abs(e.clientY - start.y);
						if (tapDx < 6 && tapDy < 6) {
							ctx.setShowSelectionActions?.(prev => !prev);
						}
					}
				}
			}
			// When all pointers are up, end multi-touch session
			if (pointers.current.size === 0) multiTouchActiveRef.current = false;
			if (pointers.current.size < 2) {
				lastTwoFingerMidRef.current = null;
			}
			// Clear pending pan start when gesture ends
			pendingPanStart.current = null;
			// Cancel long-press timer on up
			if (longPressTimerRef.current) {
				window.clearTimeout(longPressTimerRef.current);
				longPressTimerRef.current = null;
			}
			const wasLongPress = longPressTriggeredRef.current;
			longPressTriggeredRef.current = false;
			// Clear any dormant candidate
			touchDragCandidateRef.current = null;
			// Single-finger tap-to-seek: only when gesture ends and it was a tap (no drag/pan)
			const start = tapStarts.current.get(e.pointerId);
			tapStarts.current.delete(e.pointerId);
			if (
				start &&
				pointers.current.size === 0 && // gesture ended
				!isPanning &&
				!wasLongPress
			) {
				const dx = Math.abs(e.clientX - start.x);
				const dy = Math.abs(e.clientY - start.y);
				const dt = e.timeStamp - start.t;
				if (dx <= 6 && dy <= 6 && dt <= 300) {
					const rect = canvasRef.current?.getBoundingClientRect();
					if (rect) {
						const { canvasX, canvasY } = screenToCanvasCoords(e.clientX, e.clientY, rect, transform);
						const lastTap = lastCardTapRef.current;
						if (!toolMode && lastTap && isSecondTap(e.clientX, e.clientY, e.timeStamp)) {
							lastCardTapRef.current = null;
							const tapped = lastTap.kind === 'note' ? notes.find((n) => n.id === lastTap.id) : undefined;
							if (tapped) {
								ctx.setEditingNote(tapped.id);
								ctx.setEditContent(tapped.content || '');
								return;
							}
							if (lastTap.kind === 'frame' && ctx.frames.some((f) => f.id === lastTap.id)) {
								storyboard.openFrameEditor(lastTap.id);
								return;
							}
						}
						// Seek to note if tapped on note and not in drawing mode
						const clickedNote = findNoteAtPosition(canvasX, canvasY, notes, transform.scale, NOTE_LABEL_HIDE_THRESHOLD, !isDrawingMode);
						if (clickedNote && !isDrawingMode) {
							seekToTime(clickedNote.time);
							lastCardTapRef.current =
								clickedNote.type !== 'drawing' ? { id: clickedNote.id, kind: 'note', x: e.clientX, y: e.clientY, t: e.timeStamp } : null;
							return;
						}
						// A frame: seek to its time; a second tap on the same card opens the frame editor
						const frameTarget = !toolMode ? frameTargetAt(canvasX, canvasY) : null;
						if (frameTarget) {
							seekToTime(targetTime(frameTarget));
							lastCardTapRef.current =
								frameTarget.kind === 'card' ? { id: frameTarget.frame.id, kind: 'frame', x: e.clientX, y: e.clientY, t: e.timeStamp } : null;
							return;
						}
						lastCardTapRef.current = null;
						if (duration <= 0) return;
						// Otherwise, seek to waveform time if inside bounds
						const { waveformX, waveformY, waveformWidth, waveformHeight } = getWaveformDimensions(rect.width, rect.height, duration, ctx.orientation);
						if (isClickInWaveform(canvasX, waveformX, waveformWidth, canvasY, waveformY, waveformHeight, ctx.orientation)) {
							const time = ctx.orientation === 'horizontal'
								? (canvasX / waveformWidth) * duration
								: getTimeFromCanvasY(canvasY, waveformHeight, duration);
							seekToTime(Math.max(0, Math.min(duration, time)));
						}
					}
				}
			}
		},
		[setIsPanning, isPanning, canvasRef, duration, isDrawingMode, notes, NOTE_LABEL_HIDE_THRESHOLD, seekToTime, transform, toolMode, ctx, frameTargetAt, storyboard]
	);

	const handleWheel = useCallback(
		(e: React.WheelEvent) => {
			// If a touch pointer is active, ignore wheel to avoid double-zoom on mobile
			if (pointers.current.size > 0) return;
			if (e.cancelable) e.preventDefault();
			const scaleFactor = e.deltaY > 0 ? 0.9 : 1.1;
			const rect = canvasRef.current?.getBoundingClientRect();
			if (!rect) return;
			const mouseX = e.clientX - rect.left - rect.width / 2;
			const mouseY = e.clientY - rect.top;
			setTransform((prev) => {
				const newScale = Math.max(0.1, Math.min(3, prev.scale * scaleFactor));
				const scaleChange = newScale / prev.scale;
				return {
					scale: newScale,
					offsetX: prev.offsetX - (mouseX - prev.offsetX) * (scaleChange - 1),
					offsetY: prev.offsetY - (mouseY - prev.offsetY) * (scaleChange - 1),
				};
			});
		},
		[canvasRef, setTransform]
	);

	return {
		handlePointerDown,
		handlePointerMove,
		handlePointerUp,
		handleWheel,
	};
};
