import { useEffect, useMemo, useRef, useState } from 'react';
import { useWaveformContext } from '@contexts/objects/WaveformContextObject';
import { formatFrameTime } from '@/features/storyboard/canvas/layout';
import { getColorCode } from '@utils/colorUtils';
import { buildIndex, search, type SearchResult } from './searchIndex';

const MAX_RESULTS = 50;

/**
 * Find (SPEC §6.2): note text, frame titles and notes, element labels and notes, in time order. ↑/↓ choose,
 * Enter jumps (seek + centre), Esc closes. Results are never editable.
 */
export function FindPalette({ onClose }: { onClose: () => void }) {
	const { notes, frames, board, jumpTo } = useWaveformContext();
	const [query, setQuery] = useState('');
	const [selected, setSelected] = useState(0);
	const rootRef = useRef<HTMLDivElement>(null);
	const listRef = useRef<HTMLUListElement>(null);
	const inputRef = useRef<HTMLInputElement>(null);

	const items = useMemo(() => buildIndex(notes, frames, board), [notes, frames, board]);
	const results = useMemo(() => search(items, notes, frames, query).slice(0, MAX_RESULTS), [items, notes, frames, query]);
	const current = Math.min(selected, Math.max(0, results.length - 1));

	// A press outside closes it
	useEffect(() => {
		const onDown = (e: PointerEvent) => {
			if (!rootRef.current?.contains(e.target as Node)) onClose();
		};
		document.addEventListener('pointerdown', onDown, true);
		return () => document.removeEventListener('pointerdown', onDown, true);
	}, [onClose]);

	// Keep the chosen result in view
	useEffect(() => {
		listRef.current?.children[current]?.scrollIntoView({ block: 'nearest' });
	}, [current]);

	const go = (r: SearchResult | undefined) => {
		if (!r) return;
		jumpTo(r.item.time, r.item.at);
		onClose();
	};

	// On the whole palette, so Esc (and Ctrl+F, which selects the query) work wherever focus is inside it
	const onKeyDown = (e: React.KeyboardEvent) => {
		if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
			e.preventDefault();
			inputRef.current?.select();
		} else if (e.key === 'Escape') {
			e.preventDefault();
			e.stopPropagation();
			onClose();
		} else if (e.key === 'ArrowDown') {
			e.preventDefault();
			setSelected(Math.min(results.length - 1, current + 1));
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			setSelected(Math.max(0, current - 1));
		} else if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
			e.preventDefault();
			go(results[current]);
		}
	};
	const listShown = !!query.trim();
	const optionId = (i: number) => `find-result-${i}`;

	return (
		<div
			ref={rootRef}
			role="dialog"
			aria-label="Find"
			data-prevent-erase
			onKeyDown={onKeyDown}
			className="fixed top-16 left-1/2 -translate-x-1/2 z-50 w-[28rem] max-w-[calc(100vw-2rem)] rounded-xl border border-neutral-700 bg-neutral-900/95 shadow-xl backdrop-blur-sm"
		>
			<input
				ref={inputRef}
				autoFocus
				type="text"
				value={query}
				onChange={(e) => {
					setQuery(e.target.value);
					setSelected(0);
				}}
				placeholder="Find notes and frames"
				aria-label="Find"
				role="combobox"
				aria-autocomplete="list"
				aria-expanded={listShown && results.length > 0}
				aria-controls={listShown ? 'find-results' : undefined}
				aria-activedescendant={listShown && results.length > 0 ? optionId(current) : undefined}
				className="w-full bg-transparent px-4 py-3 text-sm text-neutral-100 outline-none placeholder:text-neutral-500"
			/>
			{listShown ? (
				<ul ref={listRef} id="find-results" role="listbox" aria-label="Results" className="max-h-80 overflow-y-auto border-t border-neutral-800 py-1">
					{results.length === 0 ? <li className="px-4 py-2 text-sm text-neutral-500">Nothing found</li> : null}
					{results.map((r, i) => (
						<li
							key={`${r.item.kind}-${r.item.id}`}
							id={optionId(i)}
							role="option"
							aria-selected={i === current}
							data-kind={r.item.kind}
							data-id={r.item.id}
							onPointerEnter={() => setSelected(i)}
							onClick={() => go(r)}
							className={`flex items-center gap-2 px-4 py-1.5 text-sm cursor-pointer ${i === current ? 'bg-neutral-800 text-neutral-100' : 'text-neutral-300'}`}
						>
							{r.item.kind === 'note' ? (
								<span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: getColorCode(r.item.color ?? 'blue') }} />
							) : (
								<span className="h-2 w-2 shrink-0 rounded-[2px] bg-neutral-300" />
							)}
							<span className="shrink-0 tabular-nums text-neutral-500">{formatFrameTime(r.item.time)}</span>
							<span className="truncate">{r.snippet}</span>
						</li>
					))}
				</ul>
			) : null}
		</div>
	);
}
