import { useEffect, useLayoutEffect, useRef, useState } from 'react';

// Inspector fields. Text and numbers commit on blur or Enter (one undo step), never per keystroke; Escape reverts.
// Colours preview live while the picker moves and commit when it closes.

const inputClass =
	'w-full min-w-0 rounded-md bg-neutral-800 border border-neutral-700 px-2 py-1 text-sm text-neutral-100 outline-none focus:border-neutral-500';

export function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<label className="flex items-center gap-2 text-xs text-neutral-400">
			<span className="w-14 shrink-0">{label}</span>
			<div className="flex-1 min-w-0 flex items-center gap-1">{children}</div>
		</label>
	);
}

/**
 * Keeps a local draft while focused; otherwise mirrors the committed value. `cancelled` is set by Escape so the
 * blur that follows (which runs with this render's draft) doesn't commit it.
 */
function useDraft(value: string) {
	const [draft, setDraft] = useState(value);
	const focused = useRef(false);
	const cancelled = useRef(false);
	useEffect(() => {
		if (!focused.current) setDraft(value);
	}, [value]);
	const cancel = (el: HTMLElement) => {
		cancelled.current = true;
		setDraft(value);
		el.blur();
	};
	const blurred = (commit: () => void) => {
		focused.current = false;
		if (cancelled.current) cancelled.current = false;
		else commit();
	};
	return { draft, setDraft, focused, cancel, blurred };
}

export function TextField(props: {
	label: string;
	value: string;
	/** Return false to refuse the value (the field goes back to `value`). */
	onCommit: (v: string) => void | boolean;
	multiline?: boolean;
	placeholder?: string;
	name?: string;
}) {
	const { label, value, onCommit, multiline, placeholder, name } = props;
	const { draft, setDraft, focused, cancel, blurred } = useDraft(value);
	const commit = () => {
		if (draft !== value && onCommit(draft) === false) setDraft(value);
	};
	const common = {
		name,
		value: draft,
		placeholder,
		'aria-label': label,
		className: `${inputClass} ${multiline ? 'resize-none field-sizing-content min-h-[3.5rem]' : ''}`,
		onFocus: () => {
			focused.current = true;
		},
		onBlur: () => blurred(commit),
		onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraft(e.target.value),
		onKeyDown: (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
			if (e.key === 'Escape') {
				e.preventDefault();
				e.stopPropagation();
				cancel(e.currentTarget);
			} else if (e.key === 'Enter' && (!multiline || e.ctrlKey || e.metaKey)) {
				e.preventDefault();
				e.currentTarget.blur();
			}
		},
	};
	return <FieldRow label={label}>{multiline ? <textarea {...common} rows={2} /> : <input {...common} type="text" />}</FieldRow>;
}

export function NumberField(props: {
	label: string;
	value: number;
	onCommit: (v: number) => void;
	min?: number;
	max?: number;
	suffix?: string;
	digits?: number;
	name?: string;
}) {
	const { label, value, onCommit, min = -Infinity, max = Infinity, suffix, digits = 0, name } = props;
	const shown = Number(value.toFixed(digits)).toString();
	const { draft, setDraft, focused, cancel, blurred } = useDraft(shown);
	const commit = () => {
		// Untouched: nothing to commit (the shown value is rounded; committing it would move the element)
		if (draft === shown) return;
		const n = Number(draft);
		if (draft.trim() === '' || !Number.isFinite(n)) {
			setDraft(shown);
			return;
		}
		const next = Number(Math.max(min, Math.min(max, n)).toFixed(digits));
		if (next !== value) onCommit(next);
		setDraft(next.toString());
	};
	return (
		<FieldRow label={label}>
			<input
				name={name}
				aria-label={label}
				type="text"
				inputMode="decimal"
				value={draft}
				className={inputClass}
				onFocus={() => {
					focused.current = true;
				}}
				onBlur={() => blurred(commit)}
				onChange={(e) => setDraft(e.target.value)}
				onKeyDown={(e) => {
					if (e.key === 'Escape') {
						e.preventDefault();
						e.stopPropagation();
						cancel(e.currentTarget);
					} else if (e.key === 'Enter') {
						e.preventDefault();
						e.currentTarget.blur();
					}
				}}
			/>
			{suffix ? <span className="text-neutral-500">{suffix}</span> : null}
		</FieldRow>
	);
}

/** A colour, or none when `allowNone`. `onLive` previews while the picker moves; `onCommit` ends the change. */
export function ColorField(props: {
	label: string;
	value: string | null;
	allowNone?: boolean;
	onLive: (v: string) => void;
	onCommit: (v: string | null) => void;
	name?: string;
}) {
	const { label, value, allowNone, onLive, onCommit, name } = props;
	const ref = useRef<HTMLInputElement>(null);
	const onCommitRef = useRef(onCommit);
	useLayoutEffect(() => {
		onCommitRef.current = onCommit;
	});
	// The native `change` event fires once the picker closes; React's onChange fires on every move
	useEffect(() => {
		const el = ref.current;
		if (!el) return;
		const onChange = () => onCommitRef.current(el.value);
		el.addEventListener('change', onChange);
		return () => el.removeEventListener('change', onChange);
	}, []);
	return (
		<FieldRow label={label}>
			<input
				ref={ref}
				name={name}
				aria-label={label}
				type="color"
				value={value ?? '#000000'}
				onChange={(e) => onLive(e.target.value)}
				className={`h-7 w-9 shrink-0 cursor-pointer rounded border border-neutral-700 bg-neutral-800 p-0.5 ${value === null ? 'opacity-40' : ''}`}
			/>
			<span className="font-mono text-neutral-300">{value ?? 'none'}</span>
			{allowNone ? (
				<button
					type="button"
					aria-label={`${label}: ${value === null ? 'set' : 'none'}`}
					onClick={() => onCommit(value === null ? '#ffffff' : null)}
					className="ml-auto rounded px-1.5 py-0.5 text-neutral-400 hover:bg-neutral-700 hover:text-neutral-100 cursor-pointer"
				>
					{value === null ? 'set' : 'none'}
				</button>
			) : null}
		</FieldRow>
	);
}
