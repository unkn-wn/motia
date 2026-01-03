import { useCallback, useEffect } from 'react';
import { useWaveformContext } from '@contexts/objects/WaveformContextObject';
import { screenToCanvasCoords, findNoteAtPosition } from '@utils/canvasUtils';
import { history } from '@utils/history';
import { getPreferences } from '@utils/shortcutsUtils';

export const useMouseInteractions = () => {
	const {
		canvasRef,
		transform,
		setTransform,
		isDrawingMode,
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
	} = useWaveformContext();

	const handleMouseDown = useCallback(
		(e: React.MouseEvent<HTMLCanvasElement>) => {
			const prefs = getPreferences();
			const desired = prefs.panMouseButton; // 'Left' | 'Middle' | 'Right'

			// Map mouse button to label
			const buttonLabel = e.button === 0 ? 'Left' : e.button === 1 ? 'Middle' : e.button === 2 ? 'Right' : 'Left';

			// Common rect/clicked note calculation (check early to prioritize note dragging)
			const rect = canvasRef.current?.getBoundingClientRect();
			if (!rect) return;
			const { canvasX, canvasY } = screenToCanvasCoords(e.clientX, e.clientY, rect, transform);
			const clickedNote = findNoteAtPosition(
				canvasX,
				canvasY,
				notes,
				transform.scale,
				NOTE_LABEL_HIDE_THRESHOLD,
				!isDrawingMode,
				noteLayoutCache
			);

			// If clicking on a note with left button and no active tool, start dragging the note (takes priority over panning)
			if (buttonLabel === 'Left' && clickedNote && !isDrawingMode && !toolMode) {
				e.preventDefault();
				setDragOccurred(false);
				setDragging({
					id: clickedNote.id,
					startX: e.clientX,
					startY: e.clientY,
					initialCanvasX: clickedNote.canvasX,
					initialCanvasY: clickedNote.canvasY,
				});
				// Start a coalesced move entry for history
				history.beginMove(clickedNote.id, { x: clickedNote.canvasX, y: clickedNote.canvasY });
				return;
			}

			// Start panning when the pressed mouse button matches preference
			// but if pan is bound to Left and a tool is active (draw/select/erase), do not pan.
			if (buttonLabel === desired) {
				if (desired === 'Left' && (isDrawingMode || toolMode === 'select' || toolMode === 'erase')) {
					// Let tool-specific handlers take over
					return;
				}
				e.preventDefault();
				setIsPanning(true);
				setLastPanPoint({ x: e.clientX, y: e.clientY });
				setIsFollowingPlayhead(false);
				// One-shot global cleanup to avoid "stuck" panning if the effect-based listeners haven't attached yet
				const onUp = () => {
					setIsPanning(false);
					window.removeEventListener('mouseup', onUp, true);
					window.removeEventListener('pointerup', onUp as unknown as EventListener, true);
					window.removeEventListener('blur', onBlur, true);
					window.removeEventListener('contextmenu', onUp, true);
				};
				const onBlur = () => onUp();
				window.addEventListener('mouseup', onUp, { capture: true } as AddEventListenerOptions);
				window.addEventListener('pointerup', onUp as unknown as EventListener, { capture: true } as AddEventListenerOptions);
				window.addEventListener('blur', onBlur, { capture: true } as AddEventListenerOptions);
				window.addEventListener('contextmenu', onUp, { capture: true } as AddEventListenerOptions);
				return;
			}

			// Block panning via Left button when a tool is active; Middle/Right pan is still allowed above.
			if ((isDrawingMode || toolMode === 'select' || toolMode === 'erase') && buttonLabel === 'Left') {
				return;
			}
		},
		[
			canvasRef,
			transform,
			isDrawingMode,
			toolMode,
			setDragOccurred,
			setDragging,
			setIsPanning,
			setLastPanPoint,
			setIsFollowingPlayhead,
			notes,
			NOTE_LABEL_HIDE_THRESHOLD,
		]
	);

	const handleMouseMove = useCallback(
		(e: React.MouseEvent<HTMLCanvasElement>) => {
			if (isPanning) {
				// Safety check: if no buttons are pressed (e.g. released outside window), stop panning
				if (e.buttons === 0) {
					setIsPanning(false);
					return;
				}

				e.preventDefault();

				// Use movementX/Y to get raw mouse movement without OS acceleration
				const deltaX = (e.nativeEvent as MouseEvent).movementX || e.clientX - lastPanPoint.x;
				const deltaY = (e.nativeEvent as MouseEvent).movementY || e.clientY - lastPanPoint.y;

				setTransform((prev) => ({
					...prev,
					offsetX: prev.offsetX + deltaX,
					offsetY: prev.offsetY + deltaY,
				}));

				setLastPanPoint({ x: e.clientX, y: e.clientY });
			}
			// Drawing is now handled by global mouse handlers
		},
		[isPanning, lastPanPoint, setTransform, setLastPanPoint]
	);

	// Native wheel listener to support non-passive prevention of browser zoom (trackpad pinch)
	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;

		// Heuristic to detect Mac platform
		// Note: 'navigator.platform' is deprecated but still widely supported for this check.
		// Fallback to basic 'navigator.userAgent' if needed, but for now this is standard legacy check.
		const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;

		const onWheel = (e: WheelEvent) => {
			e.preventDefault();

			let isZoom = true;

			if (isMac) {
				// Check for Pinch gesture (Ctrl key is usually strictly associated with pinch on Mac browsers)
				if (e.ctrlKey) {
					isZoom = true;
				} else {
					// Heuristics for physical mouse wheel vs trackpad
					// 1. deltaMode: 1 (DOM_DELTA_LINE) is typical for wheels. 0 (DOM_DELTA_PIXEL) is typical for trackpads AND magic mouse/some high-res mice.
					// 2. Integer checks: Trackpads often give fractional values. Mouse wheels mostly give integers (though smooth-scroll drivers vary).
					// 3. Magnitude: Mouse wheels often have larger step sizes.
					// We'll treat deltaMode 1 or large integer deltas as "Mouse Wheel" -> Zoom.
					const isMouseWheel = e.deltaMode === 1 || (Math.abs(e.deltaY) > 50 && Number.isInteger(e.deltaY));

					// If it looks like a mouse wheel, Zoom. Else (Trackpad/Magic Mouse scroll), Pan.
					if (isMouseWheel) {
						isZoom = true;
					} else {
						isZoom = false;
					}
				}
			}
			// On non-Mac (PC), we default to Zoom for all wheel events as requested.

			if (isZoom) {
				// ZOOM Logic
				const scaleFactor = e.deltaY > 0 ? 0.9 : 1.1;
				const rect = canvas.getBoundingClientRect();

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
			} else {
				// PAN Logic (Trackpad 2-finger)
				// We subtract deltas to simulate natural panning (scrolling down moves view down / content up)
				// Adjust sign based on preference if needed, but '-=' is standard "scroll view".
				setTransform((prev) => ({
					...prev,
					offsetX: prev.offsetX - e.deltaX,
					offsetY: prev.offsetY - e.deltaY,
				}));
			}
		};

		canvas.addEventListener('wheel', onWheel, { passive: false });
		return () => {
			canvas.removeEventListener('wheel', onWheel);
		};
	}, [canvasRef, setTransform]);

	return {
		handleMouseDown,
		handleMouseMove,
	};
};
