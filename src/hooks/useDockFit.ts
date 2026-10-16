import { useCallback, useLayoutEffect, useRef, useState, useSyncExternalStore, type RefObject } from 'react';

const NARROW = '(max-width: 767px)';
const subscribeNarrow = (cb: () => void) => {
	const mq = window.matchMedia(NARROW);
	mq.addEventListener('change', cb);
	return () => mq.removeEventListener('change', cb);
};
const isNarrow = () => window.matchMedia(NARROW).matches;

/** Space kept free under a dock. */
const MARGIN_PX = 12;

/**
 * Which layout a vertical dock of round buttons can use, between its top and `bottom()`:
 * - `i < sizes.length`: everything, with buttons of `sizes[i]` px (largest first) — the largest that fits;
 * - `sizes.length + j`: collapsed, layout j of `collapsed` (their heights in px, preferred first) — the first that
 *   fits; `sizes.length + collapsed.length` is the smallest collapsed layout, used when none fits.
 * Phones always get a collapsed layout.
 *
 * The full dock's height at another size follows from the one rendered: everything but the buttons stays the same.
 */
export function useDockFit(ref: RefObject<HTMLElement | null>, sizes: number[], bottom: () => number, collapsed: number[] = []): number {
	const narrow = useSyncExternalStore(subscribeNarrow, isNarrow);
	const [level, setLevel] = useState(0);
	const [available, setAvailable] = useState(Infinity);
	// Height of the dock without its buttons, and how many there are (measured whenever it isn't collapsed)
	const shape = useRef<{ rest: number; buttons: number } | null>(null);
	const levelRef = useRef(level);
	levelRef.current = level;
	const bottomRef = useRef(bottom);
	bottomRef.current = bottom;
	const sizesRef = useRef(sizes);
	sizesRef.current = sizes;

	const measure = useCallback(() => {
		const el = ref.current;
		if (!el) return;
		const sizes = sizesRef.current;
		const current = levelRef.current;
		// (A dock collapsed for a phone renders no full layout to measure)
		if (current < sizes.length && el.dataset.level !== 'collapsed') {
			const buttons = el.querySelectorAll(':scope > button, :scope > * > button').length;
			shape.current = { rest: el.scrollHeight - buttons * sizes[current], buttons };
		}
		const room = bottomRef.current() - el.getBoundingClientRect().top - MARGIN_PX;
		setAvailable((a) => (Math.abs(a - room) < 1 ? a : room));
		if (!shape.current) return;
		const { rest, buttons } = shape.current;
		let next = sizes.findIndex((size) => rest + buttons * size <= room);
		if (next < 0) next = sizes.length;
		if (next !== current) setLevel(next);
	}, [ref]);

	// After each render (the dock re-renders rarely) and whenever the window changes size
	useLayoutEffect(measure);
	useLayoutEffect(() => {
		window.addEventListener('resize', measure);
		return () => window.removeEventListener('resize', measure);
	}, [measure]);

	if (!narrow && level < sizes.length) return level;
	const j = collapsed.findIndex((h) => h <= available);
	return sizes.length + (j < 0 ? collapsed.length : j);
}

/** Closes a popover on a press anywhere outside `ref` while `open`. */
export function useDismiss(ref: RefObject<HTMLElement | null>, open: boolean, close: () => void) {
	useLayoutEffect(() => {
		if (!open) return;
		const onDown = (e: PointerEvent) => {
			if (ref.current && !ref.current.contains(e.target as Node)) close();
		};
		document.addEventListener('pointerdown', onDown, true);
		return () => document.removeEventListener('pointerdown', onDown, true);
	}, [ref, open, close]);
}
