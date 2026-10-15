import type { Frame } from './types';

// Frames along the song: time order, the frame on screen at a time, neighbours, and where copies go.

/** Frames sorted by time; frames at the same time keep their creation order. */
export function framesByTime(frames: Frame[]): Frame[] {
	return frames
		.map((f, i) => ({ f, i }))
		.sort((a, b) => a.f.time - b.f.time || a.i - b.i)
		.map((x) => x.f);
}

/** The frame on screen at `t`: the latest one whose time is ≤ t (the last of equal times), or null before the first. */
export function activeFrameAt(ordered: Frame[], t: number): Frame | null {
	let lo = 0;
	let hi = ordered.length;
	// First index whose time is > t
	while (lo < hi) {
		const mid = (lo + hi) >> 1;
		if (ordered[mid].time <= t) lo = mid + 1;
		else hi = mid;
	}
	return lo > 0 ? ordered[lo - 1] : null;
}

/** Up to `radius` frames on each side of `id` in time order, with the frame itself in the middle. */
export function neighbours(ordered: Frame[], id: string, radius: number): Frame[] {
	const i = ordered.findIndex((f) => f.id === id);
	if (i < 0) return [];
	return ordered.slice(Math.max(0, i - radius), i + radius + 1);
}

/** A duplicate goes to time + 0.5 s, or to the playhead if that is later (within the song). */
export function duplicateTime(frame: Frame, playhead: number, duration: number): number {
	const t = Math.max(frame.time + 0.5, playhead);
	return duration > 0 ? Math.min(duration, t) : t;
}
