import { useCallback } from 'react';
import type { CanvasOrientation } from '@types';
import { getWaveformDimensions } from '@utils/canvasUtils';
import { useWaveformContext } from '@contexts/objects/WaveformContextObject';
import { useAudio } from '@contexts/objects/AudioContextObject';
import { defaultCardPosition, findFrameTarget, type FrameDrag, type TimeAxis } from '@/features/storyboard/canvas/layout';
import type { CanvasDrag } from '@contexts/objects/WaveformContextObject';
import type { BoardFormat, Frame } from '@/features/storyboard/types';

/** Where time runs on the canvas, from the canvas size (same mapping as the waveform renderer). */
export function timeAxisOf(rect: { width: number; height: number }, duration: number, orientation: CanvasOrientation = 'vertical'): TimeAxis {
	const d = getWaveformDimensions(rect.width, rect.height, duration, orientation);
	return { orientation, duration, length: orientation === 'horizontal' ? d.waveformWidth : d.waveformHeight };
}

/** Where a new card for `time` goes: beside the waveform, past existing cards. */
export function cardPositionAt(
	canvas: HTMLCanvasElement | null,
	time: number,
	duration: number,
	orientation: CanvasOrientation,
	frames: Frame[],
	board: BoardFormat
) {
	const rect = canvas?.getBoundingClientRect() ?? { width: window.innerWidth, height: window.innerHeight };
	return defaultCardPosition(time, frames, board, timeAxisOf(rect, duration, orientation));
}

/**
 * Frame target under a world point: card, anchor dot or span end tick. Interactions check notes first, then this,
 * then waveform seek, then pan; frame targets only count when no tool is active.
 */
export function useFrameTargetAt() {
	const { frames, board, transform, canvasRef, orientation } = useWaveformContext();
	const { duration } = useAudio();
	return useCallback(
		(canvasX: number, canvasY: number) => {
			const rect = canvasRef.current?.getBoundingClientRect();
			if (!rect || frames.length === 0) return null;
			return findFrameTarget({ x: canvasX, y: canvasY }, frames, board, timeAxisOf(rect, duration, orientation), transform.scale);
		},
		[frames, board, transform.scale, canvasRef, duration, orientation]
	);
}

/** The drag record for a frame target, started at a client point. */
export function frameDragFrom(target: { frame: Frame; kind: FrameDrag['kind'] }, clientX: number, clientY: number): CanvasDrag {
	const { frame, kind } = target;
	return {
		kind,
		id: frame.id,
		startX: clientX,
		startY: clientY,
		initialCanvasX: frame.canvasX,
		initialCanvasY: frame.canvasY,
		initialTime: frame.time,
		initialEndTime: frame.endTime,
	};
}

/** The time a click on a frame target seeks to. */
export const targetTime = (target: { frame: Frame; kind: FrameDrag['kind'] }) =>
	target.kind === 'endTick' && target.frame.endTime !== undefined ? target.frame.endTime : target.frame.time;

/** The frame part of a canvas drag, or null for a note drag. */
export function asFrameDrag(d: CanvasDrag): FrameDrag | null {
	if (d.kind === 'note') return null;
	return { kind: d.kind, id: d.id, initialCanvasX: d.initialCanvasX, initialCanvasY: d.initialCanvasY, initialTime: d.initialTime ?? 0, initialEndTime: d.initialEndTime };
}
