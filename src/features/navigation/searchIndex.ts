import type { Note } from '@types';
import { cardRect } from '@/features/storyboard/canvas/layout';
import type { BoardFormat, Frame } from '@/features/storyboard/types';
import { NOTE_CARD_WIDTH } from '@utils/canvasUtils';

// Notes and frames along the song, for the index rail and Find. Pure; never edits anything.

/** Centring a note uses the middle of its card and a line below its top. */
const NOTE_CARD_MID_Y = 20;

export type IndexItem = {
	kind: 'note' | 'frame';
	id: string;
	time: number;
	endTime?: number;
	/** Note: its text. Frame: its title. */
	title: string;
	/** Note colour name (notes only) */
	color?: string;
	/** Where the item sits on the canvas (world units): jumping centres this point */
	at: { x: number; y: number };
};

/** Text notes and frames in time order (at the same time, a frame before a note; otherwise creation order). */
export function buildIndex(notes: Note[], frames: Frame[], board: BoardFormat): IndexItem[] {
	const items: IndexItem[] = [];
	for (const f of frames) {
		const r = cardRect(f, board);
		items.push({ kind: 'frame', id: f.id, time: f.time, endTime: f.endTime, title: f.title, at: { x: r.x + r.w / 2, y: r.y + r.h / 2 } });
	}
	for (const n of notes) {
		if (n.type === 'drawing') continue;
		items.push({ kind: 'note', id: n.id, time: n.time, title: n.content, color: n.color, at: { x: n.canvasX + NOTE_CARD_WIDTH / 2, y: n.canvasY + NOTE_CARD_MID_Y } });
	}
	return items
		.map((item, i) => ({ item, i }))
		.sort((a, b) => a.item.time - b.item.time || (a.item.kind === b.item.kind ? a.i - b.i : a.item.kind === 'frame' ? -1 : 1))
		.map((x) => x.item);
}

/** The item on screen at `t`: the latest one whose time is ≤ t, or null before the first. */
export function activeItemAt(items: IndexItem[], t: number): IndexItem | null {
	let lo = 0;
	let hi = items.length;
	while (lo < hi) {
		const mid = (lo + hi) >> 1;
		if (items[mid].time <= t) lo = mid + 1;
		else hi = mid;
	}
	return lo > 0 ? items[lo - 1] : null;
}

export type SearchResult = { item: IndexItem; /** The matching text, as written */ snippet: string };

const firstLine = (s: string) => s.split(/\r?\n/).find((l) => l.trim()) ?? '';

/**
 * Matches note text, frame titles, frame notes, element labels and element notes (case-insensitive), in time order.
 * A note shows its matching line; a frame its title and what matched.
 */
export function search(items: IndexItem[], notes: Note[], frames: Frame[], query: string): SearchResult[] {
	const q = query.trim().toLowerCase();
	if (!q) return [];
	const has = (s: string | undefined) => !!s && s.toLowerCase().includes(q);
	const noteById = new Map(notes.map((n) => [n.id, n]));
	const frameById = new Map(frames.map((f) => [f.id, f]));
	const results: SearchResult[] = [];
	for (const item of items) {
		if (item.kind === 'note') {
			const content = noteById.get(item.id)?.content ?? '';
			if (!has(content)) continue;
			const line = content.split(/\r?\n/).find((l) => l.toLowerCase().includes(q)) ?? firstLine(content);
			results.push({ item, snippet: line.trim() });
			continue;
		}
		const f = frameById.get(item.id);
		if (!f) continue;
		const fields = [f.notes, ...f.elements.flatMap((el) => [el.label, el.note])];
		const matched = has(f.title) ? '' : fields.find((s) => has(s));
		if (!has(f.title) && matched === undefined) continue;
		const detail = matched ? (matched.split(/\r?\n/).find((l) => l.toLowerCase().includes(q)) ?? firstLine(matched)).trim() : '';
		results.push({ item, snippet: [f.title, detail].filter(Boolean).join(' · ') });
	}
	return results;
}
