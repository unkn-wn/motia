import { useCallback, useEffect } from 'react';
import { useWaveformContext } from '@contexts/objects/WaveformContextObject';
import { compressDrawingAdaptive, recomputeBoundsFromStrokes } from '@utils/drawingUtils';
import { decompressSession } from '@utils/advancedCompression';
import type { DrawingSession } from '@types';

export const useDrawingInteractions = () => {
	const {
		isDrawingMode,
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
		onAddDrawing,
		onUpdateDrawing,
		canvasRef,
		notes,
		transform,
	} = useWaveformContext();

	const handleDrawingStart = useCallback(
		(canvasX: number, canvasY: number) => {
			// Double-guard: only start when drawing tool truly active
			if (!isDrawingMode || !onAddDrawing) return;

			setIsDrawing(true);
			setDrawingStartPos({ x: canvasX, y: canvasY });
			setCurrentStroke([{ x: canvasX, y: canvasY }]);

			// If a global drawing note already exists in memory, target it to keep all strokes together
			if (!drawingNoteId) {
				const existing = notes.find((n) => n.type === 'drawing' && n.drawing);
				if (existing) setDrawingNoteId(existing.id);
			}

			setDrawingSession((prev) => prev || { strokes: [], startTime: Date.now(), startPosition: { x: 0, y: 0 } });
		},
		[
			isDrawingMode,
			onAddDrawing,
			setIsDrawing,
			setDrawingStartPos,
			setCurrentStroke,
			setDrawingSession,
			drawingNoteId,
			notes,
			setDrawingNoteId,
		]
	);
	const handleDrawingEnd = useCallback(() => {
		// Always clear drawing state first
		setIsDrawing(false);

		if (!drawingStartPos || currentStroke.length < 2) {
			// Invalid stroke - just clear state and return
			setCurrentStroke([]);
			setDrawingStartPos(null);
			return;
		}

		// Build base from current note state to stay in sync with undo/redo
		// Always operate on global drawing note; points are absolute (world) coordinates.
		let existingStrokes: DrawingSession['strokes'] = [];
		// Prefer updating an existing global drawing note if present
		let targetNoteId = drawingNoteId;
		if (!targetNoteId) {
			const existing = notes.find((n) => n.type === 'drawing' && n.drawing);
			if (existing) {
				targetNoteId = existing.id;
				setDrawingNoteId(existing.id);
			}
		}

		if (targetNoteId) {
			const note = notes.find((n) => n.id === targetNoteId);
			if (note?.drawing?.compressed) {
				try {
					let comp = note.drawing.compressed as unknown as import('@types').CompressedStroke[];
					if (typeof comp === 'string') comp = JSON.parse(comp);
					existingStrokes = decompressSession(comp) as import('@types').DrawingStroke[];
				} catch {
					existingStrokes = [];
				}
			}
		} else if (drawingSession) {
			existingStrokes = drawingSession.strokes;
		}
		const nextStrokes: import('@types').DrawingStroke[] = [...existingStrokes, { points: currentStroke, color: '#9ca3af', strokeWidth: 2 }];

		// Compress the entire session (advanced adaptive already optimizes per stroke and at session-level)
		const compressionResult = compressDrawingAdaptive(nextStrokes);

		// Calculate bounds
		const { width, height } = recomputeBoundsFromStrokes(nextStrokes);

		const drawing = {
			compressed: compressionResult.strokes,
			bounds: { width, height },
			originalSize: compressionResult.originalSize,
			compressedSize: compressionResult.compressedSize,
			compressionRatio: compressionResult.reduction,
		};

		// Calculate time for first stroke only
		const rect = canvasRef.current?.getBoundingClientRect();
		const waveformHeight = rect ? Math.max(rect.height * 3, 100) : 100;
		const timeProgress = (drawingStartPos?.y ?? 0) / waveformHeight;
		const time = Math.max(0, Math.min(100, timeProgress * 100));
		if (targetNoteId) {
			onUpdateDrawing?.(targetNoteId, drawing);
		} else {
			// Create the global drawing note on first commit
			const newId = onAddDrawing?.(time, 0, 0, drawing);
			if (newId) setDrawingNoteId(newId);
		}

		setDrawingSession({ strokes: nextStrokes, startTime: Date.now(), startPosition: { x: 0, y: 0 } });

		// Clear the live stroke
		setCurrentStroke([]);
		setDrawingStartPos(null);
	}, [
		drawingStartPos,
		currentStroke,
		setIsDrawing,
		setCurrentStroke,
		setDrawingStartPos,
		setDrawingSession,
		canvasRef,
		drawingNoteId,
		onAddDrawing,
		onUpdateDrawing,
		setDrawingNoteId,
		notes,
		drawingSession,
	]);

	// Handle drawing mode changes - clear state on exit (note is already kept up to date)
	useEffect(() => {
		if (isDrawingMode && !drawingSession) {
			// Drawing mode just turned on - initialize session
			setDrawingSession({
				strokes: [],
				startTime: Date.now(),
				startPosition: { x: 0, y: 0 },
			});
		} else if (!isDrawingMode) {
			// Exiting drawing mode: reset ephemeral state; drawing note already persisted incrementally
			setDrawingSession(null);
			setDrawingNoteId(null);
		}
		// Don't clear the session if we're still in drawing mode or actively drawing
	}, [isDrawingMode, drawingSession, isDrawing, setDrawingSession, setDrawingNoteId]);

	// Rely on global history for undo/redo of drawing updates

	return {
		handleDrawingStart,
		handleDrawingEnd,
	};
};
