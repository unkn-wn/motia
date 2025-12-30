import { useEffect, useRef } from 'react';
import { useWaveformContext } from '@contexts/objects/WaveformContextObject';
import { useDrawingInteractions } from './useDrawingInteractions';
import { history } from '@utils/history';
import { updateEraserPreview, commitEraser } from './mouse/eraserMouseHandlers';
import { handleDrawMove } from './mouse/drawMouseHandlers';
import { handleSelectionCreate, handleSelectionMove, finalizeSelectionMove } from './mouse/selectionMouseHandlers';

// Sets up global mouse/pointer listeners and routes events to the active tool
// (draw, select, erase, pan, move). Logic lives in the per-tool handlers; this
// hook focuses on wiring and state transitions without rendering.
export const useGlobalMouseHandlers = () => {
	// Grab the full typed context once so we can pass it to helpers without casts
	const ctx = useWaveformContext();
	const { dragging, isDrawing, toolMode, isPanning, selectionBox } = ctx;

	// Used as a safe way to trigger a canvas rerender when caches might hide updates
	const { handleDrawingEnd } = useDrawingInteractions();
	const strokeEndGuardRef = useRef(false);

	// Use a ref to access latest context in event handlers without re-binding listeners
	const ctxRef = useRef(ctx);
	// Always update ref on render
	useEffect(() => {
		ctxRef.current = ctx;
	}, [ctx]);

	useEffect(() => {
		const handleGlobalMouseMove = (e: MouseEvent | PointerEvent) => {
			// Access fresh context
			const currentCtx = ctxRef.current;
			const { canvasRef, transform, toolMode, selectionBox, setDragOccurred, dragging, onMoveNote, isDrawing, isDrawingMode } = currentCtx;

			// On desktop we prefer mousemove; skip duplicate pointer events from mouse
			if ('pointerType' in e && e.pointerType === 'mouse') return;
			const rect = canvasRef.current?.getBoundingClientRect();
			// Convert screen to world (canvas) coordinates
			const toCanvas = (clientX: number, clientY: number) => {
				if (!rect) return { x: 0, y: 0 };
				const x = clientX - rect.left;
				const y = clientY - rect.top;
				return {
					x: (x - rect.width / 2 - transform.offsetX) / transform.scale,
					y: (y - transform.offsetY) / transform.scale,
				};
			};

			// Selection box create/resize/move
			if (toolMode === 'select' && selectionBox && selectionBox.dragging) {
				// Mark as a drag to prevent click-to-seek on mouseup
				if (!currentCtx.dragOccurred) setDragOccurred(true);
				if (selectionBox.mode === 'create') {
					handleSelectionCreate(currentCtx, e, toCanvas);
				} else if (selectionBox.mode === 'move') {
					handleSelectionMove(currentCtx, e, toCanvas);
				}
			}

			// Eraser hover preview (mouse-only): touch is handled by usePointerInteractions
			if (toolMode === 'erase') {
				// Skip touch/stylus pointer events here to avoid conflicting with touch logic
				if ('pointerType' in e && e.pointerType !== 'mouse') return;
				// Skip eraser interactions if the pointer is within an element that prevents erasing (e.g., sidebar)
				const targetEl = e.target as HTMLElement | null;
				if (targetEl && targetEl.closest('[data-prevent-erase]')) return;
				const p = toCanvas(e.clientX, e.clientY);
				const buttonDown = (e.buttons & 1) === 1;
				if (buttonDown && !currentCtx.dragOccurred) setDragOccurred(true);
				updateEraserPreview(currentCtx, p, buttonDown, 12);
			}
			// Note dragging (disabled when a selection box is being dragged)
			if (dragging && onMoveNote && !(toolMode === 'select' && selectionBox?.dragging)) {
				const deltaX = e.clientX - dragging.startX;
				const deltaY = e.clientY - dragging.startY;

				const newCanvasX = dragging.initialCanvasX + deltaX / transform.scale;
				const newCanvasY = dragging.initialCanvasY + deltaY / transform.scale;

				onMoveNote(dragging.id, newCanvasX, newCanvasY);
				if (!currentCtx.dragOccurred) setDragOccurred(true);
			}

			// Live drawing stroke
			if (isDrawing && isDrawingMode && toolMode === 'draw') {
				const rect2 = canvasRef.current?.getBoundingClientRect();
				if (!rect2) return;
				const x = e.clientX - rect2.left;
				const y = e.clientY - rect2.top;
				const canvasX = (x - rect2.width / 2 - transform.offsetX) / transform.scale;
				const canvasY = (y - transform.offsetY) / transform.scale;
				// Mark as a drag while stroke is in progress
				if (!currentCtx.dragOccurred) setDragOccurred(true);
				handleDrawMove(currentCtx, canvasX, canvasY);
			}
		};

		const handleGlobalMouseUp = (e?: MouseEvent | PointerEvent) => {
			const currentCtx = ctxRef.current;
			const {
				isPanning,
				setIsPanning,
				toolMode,
				selectionBox,
				setSelectionBox,
				selectedStrokeGroups,
				setSelectedStrokeGroups,
				setSelectedDrawingIds,
				setMovingStrokePreview,
				setDragOccurred,
				dragging,
				transform,
				setDragging,
				isDrawing,
			} = currentCtx;

			// Avoid double-processing on desktop
			if (e && 'pointerType' in e && e.pointerType === 'mouse') return;
			// End panning
			if (isPanning) {
				setIsPanning(false);
			}

			// Finish selection box interaction (mouse or touch)
			if (toolMode === 'select' && selectionBox?.dragging) {
				// If we just created a box and it contains no strokes, remove it entirely
				const isCreate = selectionBox.mode === 'create';
				const hasStrokeSelection = !!(selectedStrokeGroups && selectedStrokeGroups.length);

				if (isCreate && !hasStrokeSelection) {
					// No hits: clear selection visuals and state
					setSelectionBox?.(null);
					setSelectedStrokeGroups?.([]);
					setSelectedDrawingIds?.(new Set());
				} else {
					// Clear dragging flag; box dimensions were updated continuously
					setSelectionBox?.((sb) => (sb ? { ...sb, dragging: false } : sb));
					// Commit stroke translation when moving a single drawing group
					if (selectionBox.mode === 'move' && selectedStrokeGroups && selectedStrokeGroups.length === 1) {
						finalizeSelectionMove(currentCtx);
					}
				}
				// Clear live preview
				setMovingStrokePreview?.(null);
				// Let onClick/ontap (which fires after up) see dragOccurred=true, then clear shortly after
				setTimeout(() => setDragOccurred(false), 10);
			}

			// Commit erasing (apply accumulated stroke deletions)
			if (toolMode === 'erase') commitEraser(currentCtx);

			// End note dragging (records history entry)
			if (dragging) {
				history.endMove(dragging.id, {
					x: dragging.initialCanvasX + ((e?.clientX ?? dragging.startX) - dragging.startX) / transform.scale,
					y: dragging.initialCanvasY + ((e?.clientY ?? dragging.startY) - dragging.startY) / transform.scale,
				});
				setDragging(null);
				setTimeout(() => setDragOccurred(false), 10);
			}

			// End drawing stroke (guarded against duplicate mouseup/pointerup)
			if (isDrawing) {
				if (strokeEndGuardRef.current) return;
				strokeEndGuardRef.current = true;
				try {
					handleDrawingEnd();
				} finally {
					// Release guard to allow the next stroke
					setTimeout(() => {
						strokeEndGuardRef.current = false;
					}, 0);
				}
				// Defer clearing drag flag to suppress click/tap-based seek
				setTimeout(() => setDragOccurred(false), 10);
			}
		};

		// Attach listeners only when actively interacting to reduce overhead
		const shouldAttach = dragging || isDrawing || isPanning || selectionBox?.dragging || toolMode === 'erase';

		if (shouldAttach) {
			document.addEventListener('mousemove', handleGlobalMouseMove);
			document.addEventListener('mouseup', handleGlobalMouseUp as EventListener);
			document.addEventListener('contextmenu', handleGlobalMouseUp as EventListener, { capture: true } as AddEventListenerOptions);
			document.addEventListener('pointermove', handleGlobalMouseMove as EventListener, { passive: true } as AddEventListenerOptions);
			document.addEventListener('pointerup', handleGlobalMouseUp as EventListener);

			return () => {
				document.removeEventListener('mousemove', handleGlobalMouseMove);
				document.removeEventListener('mouseup', handleGlobalMouseUp as EventListener);
				document.removeEventListener('contextmenu', handleGlobalMouseUp as EventListener);
				document.removeEventListener('pointermove', handleGlobalMouseMove as EventListener);
				document.removeEventListener('pointerup', handleGlobalMouseUp as EventListener);
			};
		}
	}, [
		// Only rebuild listeners when interaction STATE changes, not data content
		dragging,
		isDrawing,
		isPanning,
		selectionBox?.dragging,
		toolMode,
		// handleDrawingEnd is stable hook
		handleDrawingEnd,
		// ctx is ref-accessed, so we don't depend on it here
	]);

	return null; // no JSX returned; this hook wires global listeners only
};
