/**
 * Waveform rendering utilities
 *
 * This module provides shared rendering logic for HORIZONTAL waveforms (time on x-axis).
 * Used by AudioTrimModal for the trim preview interface.
 *
 * Note: WaveformPlayer uses a different rendering approach (vertical waveform, time on y-axis)
 * and does not use these utilities due to fundamentally different coordinate systems.
 */

export interface WaveformDrawOptions {
	/** Canvas 2D context */
	ctx: CanvasRenderingContext2D;
	/** Waveform amplitude data (0-1 normalized) */
	waveformData: number[];
	/** Canvas width in pixels */
	width: number;
	/** Canvas height in pixels */
	height: number;
	/** Audio duration in seconds */
	duration: number;
	/** Current playback time in seconds */
	currentTime?: number;
	/** Trim start time in seconds */
	trimStart?: number;
	/** Trim end time in seconds */
	trimEnd?: number;
	/** Background color (default: transparent) */
	backgroundColor?: string;
	/** Color for active/untrimmed bars */
	activeColor?: string;
	/** Color for dimmed/trimmed bars */
	dimmedColor?: string;
	/** Color for played portion */
	playedColor?: string;
	/** Whether to show playhead indicator */
	showPlayhead?: boolean;
}

/**
 * Draw waveform bars on canvas
 */
export function drawWaveformBars(options: WaveformDrawOptions): void {
	const {
		ctx,
		waveformData,
		width,
		height,
		duration,
		currentTime = 0,
		trimStart = 0,
		trimEnd = duration,
		backgroundColor = 'transparent',
		activeColor = '#404040',
		dimmedColor = '#262626',
		playedColor = '#a3a3a3',
		showPlayhead = true,
	} = options;

	// Clear background
	if (backgroundColor !== 'transparent') {
		ctx.fillStyle = backgroundColor;
		ctx.fillRect(0, 0, width, height);
	}

	if (!waveformData || waveformData.length === 0 || duration === 0) return;

	const barWidth = width / waveformData.length;
	const maxAmp = Math.max(...waveformData, 1);
	const trimmedDuration = trimEnd - trimStart;
	const progress = trimmedDuration > 0 ? (currentTime - trimStart) / trimmedDuration : 0;

	// Draw bars
	for (let i = 0; i < waveformData.length; i++) {
		const x = i * barWidth;
		const amp = waveformData[i] / maxAmp;
		const barHeight = amp * height * 0.85;
		const y = (height - barHeight) / 2;

		// Calculate time for this bar
		const sampleTime = (i / waveformData.length) * duration;
		const isInTrimRange = sampleTime >= trimStart && sampleTime <= trimEnd;

		// Determine color
		let fillColor: string;
		if (!isInTrimRange) {
			fillColor = dimmedColor;
		} else {
			const relativeProgress = trimmedDuration > 0 ? (sampleTime - trimStart) / trimmedDuration : 0;
			const isPlayed = currentTime >= trimStart && relativeProgress < progress;
			fillColor = isPlayed ? playedColor : activeColor;
		}

		ctx.fillStyle = fillColor;
		const barWidthActual = Math.max(barWidth - 0.5, 1);
		ctx.fillRect(x, y, barWidthActual, barHeight);
	}

	// Draw playhead if needed (only show when playing and within trim range)
	if (showPlayhead && currentTime >= trimStart && currentTime <= trimEnd) {
		// Position playhead based on absolute time within the full waveform width
		const playheadX = (currentTime / duration) * width;

		// White flat color playhead line (no gradient)
		ctx.strokeStyle = '#ffffff';
		ctx.lineWidth = 2;
		ctx.beginPath();
		ctx.moveTo(playheadX, 0);
		ctx.lineTo(playheadX, height);
		ctx.stroke();

		// Playhead dot (white)
		ctx.fillStyle = '#ffffff';
		ctx.beginPath();
		ctx.arc(playheadX, height / 2, 4, 0, Math.PI * 2);
		ctx.fill();
	}
}

/**
 * Convert time (seconds) to pixel position
 */
export function timeToPixel(time: number, duration: number, width: number): number {
	if (duration === 0) return 0;
	return (time / duration) * width;
}

/**
 * Convert pixel position to time (seconds)
 */
export function pixelToTime(pixel: number, duration: number, width: number): number {
	if (width === 0) return 0;
	return (pixel / width) * duration;
}

/**
 * Setup canvas with proper DPR scaling
 */
export function setupCanvas(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D): { width: number; height: number; dpr: number } {
	const dpr = window.devicePixelRatio || 1;
	const rect = canvas.getBoundingClientRect();

	canvas.width = rect.width * dpr;
	canvas.height = rect.height * dpr;
	ctx.scale(dpr, dpr);

	return {
		width: rect.width,
		height: rect.height,
		dpr,
	};
}

/**
 * Create a gradient background
 */
export function createGradientBackground(
	ctx: CanvasRenderingContext2D,
	width: number,
	height: number,
	colorStops: Array<{ offset: number; color: string }>
): void {
	const gradient = ctx.createLinearGradient(0, 0, 0, height);
	colorStops.forEach(({ offset, color }) => {
		gradient.addColorStop(offset, color);
	});
	ctx.fillStyle = gradient as any;
	ctx.fillRect(0, 0, width, height);
}
