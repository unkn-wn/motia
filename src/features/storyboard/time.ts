// Precise song times for editing: `m:ss.mmm`.

export function formatPreciseTime(t: number): string {
	const ms = Math.round(Math.max(0, t) * 1000);
	const minutes = Math.floor(ms / 60000);
	const seconds = (ms % 60000) / 1000;
	return `${minutes}:${seconds.toFixed(3).padStart(6, '0')}`;
}

/** Reads `m:ss.mmm`, `ss.mmm` or plain seconds. Returns null for anything else. */
export function parseTime(text: string): number | null {
	const m = /^\s*(?:(\d+):)?(\d+(?:\.\d*)?)\s*$/.exec(text);
	if (!m) return null;
	const seconds = Number(m[2]);
	if (m[1] !== undefined && seconds >= 60) return null;
	const total = (m[1] ? Number(m[1]) * 60 : 0) + seconds;
	return Number.isFinite(total) ? total : null;
}
