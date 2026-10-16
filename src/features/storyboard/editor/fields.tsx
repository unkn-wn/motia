import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Ban, Plus } from 'lucide-react';

// Inspector fields. Text and numbers commit on blur or Enter (one undo step), never per keystroke; Escape reverts.
// Colours preview live while the picker moves and commit when it closes.

// Fields read as plain text until hovered or focused; the placeholder (or a short prefix) says what they are
const inputClass =
	'w-full min-w-0 rounded-md bg-transparent px-1.5 py-1 text-sm text-neutral-100 placeholder:text-neutral-500 outline-none hover:bg-neutral-800/60 focus:bg-neutral-800';
const boxClass =
	'flex items-center gap-1.5 h-7 min-w-0 rounded-md bg-neutral-800/60 px-2 text-sm text-neutral-100 hover:bg-neutral-800 focus-within:bg-neutral-800';

/** A labelled row: the label in a narrow muted column, the control beside it. */
export function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<label className="flex items-center gap-2 text-xs text-neutral-400">
			<span className="w-16 shrink-0 pl-1.5 capitalize">{label}</span>
			<div className="flex-1 min-w-0 flex items-center gap-1">{children}</div>
		</label>
	);
}

/**
 * A local draft while focused; otherwise the committed value itself (derived, not copied into state, so a value
 * that changes on every drag move costs no extra render). `cancelled` is set by Escape so the blur that follows
 * (which runs with this render's draft) doesn't commit it.
 */
function useDraft(value: string) {
	const [editing, setEditing] = useState<string | null>(null);
	const cancelled = useRef(false);
	const draft = editing ?? value;
	const focus = () => setEditing(value);
	const cancel = (el: HTMLElement) => {
		cancelled.current = true;
		el.blur();
	};
	const blurred = (commit: () => void) => {
		if (cancelled.current) cancelled.current = false;
		else commit();
		setEditing(null);
	};
	return { draft, setDraft: setEditing, focus, cancel, blurred };
}

export function TextField(props: {
	label: string;
	value: string;
	/** Return false to refuse the value (the field goes back to `value`). */
	onCommit: (v: string) => void | boolean;
	multiline?: boolean;
	placeholder?: string;
	name?: string;
	/** Shown before the text, e.g. `#` for a tag */
	prefix?: React.ReactNode;
	/** Extra input classes (size, weight) */
	className?: string;
	title?: string;
}) {
	const { label, value, onCommit, multiline, placeholder, name, prefix, className = '', title } = props;
	const { draft, setDraft, focus, cancel, blurred } = useDraft(value);
	// A refused value needs nothing more: once blurred, the field shows `value` again
	const commit = () => {
		if (draft !== value) onCommit(draft);
	};
	const common = {
		name,
		value: draft,
		placeholder,
		'aria-label': label,
		title,
		className: `${inputClass} ${multiline ? 'resize-none field-sizing-content min-h-[3.5rem]' : ''} ${className}`,
		onFocus: focus,
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
	const field = multiline ? <textarea {...common} rows={2} /> : <input {...common} type="text" />;
	if (!prefix) return field;
	return (
		<div className="flex items-center gap-0.5 min-w-0">
			<span className="shrink-0 pl-1.5 text-sm text-neutral-500" aria-hidden>
				{prefix}
			</span>
			{field}
		</div>
	);
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
	/** Shown inside the box before the number (defaults to the label) */
	prefix?: React.ReactNode;
	/**
	 * Drag on the prefix to change the value: `onLive` while dragging, `onCommit` once at the end (one undo step).
	 * `step` per pixel; Shift ×10, Alt ×0.1.
	 */
	scrub?: { onLive: (v: number) => void; onCommit: (v: number) => void };
	step?: number;
}) {
	const { label, value, onCommit, min = -Infinity, max = Infinity, suffix, digits = 0, name, prefix = label, scrub, step = 1 } = props;
	const inputRef = useRef<HTMLInputElement>(null);
	const drag = useRef<{ x0: number; v0: number; v: number; moved: boolean } | null>(null);
	// The click that ends a drag must not focus the field (the label would; shortcuts like Ctrl+Z then stop working)
	const dragged = useRef(false);
	const clamp = (n: number) => Number(Math.max(min, Math.min(max, n)).toFixed(digits));
	const shown = Number(value.toFixed(digits)).toString();
	const { draft, setDraft, focus, cancel, blurred } = useDraft(shown);
	// Once blurred the field shows the (new) value, so an invalid draft simply goes away
	const commit = () => {
		// Untouched: nothing to commit (the shown value is rounded; committing it would move the element)
		if (draft === shown) return;
		const n = Number(draft);
		if (draft.trim() === '' || !Number.isFinite(n)) return;
		const next = clamp(n);
		if (next !== value) onCommit(next);
	};
	return (
		<label className={boxClass} title={scrub ? `${label} (drag the label to change)` : label}>
			<span
				className={`shrink-0 self-stretch flex items-center text-[11px] text-neutral-500 ${scrub ? '-ml-2 pl-2 pr-1 cursor-ew-resize touch-none select-none hover:text-neutral-200' : ''}`}
				aria-hidden
				onPointerDown={(e) => {
					if (!scrub || e.button !== 0) return;
					// Not a focus or text selection: a drag (a tap without moving still focuses the field, on release)
					e.preventDefault();
					e.currentTarget.setPointerCapture(e.pointerId);
					drag.current = { x0: e.clientX, v0: value, v: value, moved: false };
				}}
				onPointerMove={(e) => {
					const d = drag.current;
					if (!d || !scrub) return;
					const dx = e.clientX - d.x0;
					if (!d.moved && Math.abs(dx) < 3) return;
					d.moved = true;
					const next = clamp(d.v0 + dx * step * (e.shiftKey ? 10 : e.altKey ? 0.1 : 1));
					if (next === d.v) return;
					d.v = next;
					scrub.onLive(next);
				}}
				onPointerUp={() => {
					const d = drag.current;
					drag.current = null;
					if (!d || !scrub) return;
					dragged.current = d.moved;
					if (!d.moved) inputRef.current?.focus();
					else if (d.v !== d.v0) scrub.onCommit(d.v);
				}}
				onClick={(e) => {
					if (!dragged.current) return;
					dragged.current = false;
					e.preventDefault();
				}}
				onPointerCancel={() => {
					const d = drag.current;
					drag.current = null;
					if (d?.moved && scrub && d.v !== d.v0) scrub.onCommit(d.v);
				}}
			>
				{prefix}
			</span>
			<input
				ref={inputRef}
				name={name}
				aria-label={label}
				type="text"
				inputMode="decimal"
				value={draft}
				className="w-full min-w-0 bg-transparent outline-none tabular-nums"
				onFocus={focus}
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
			{suffix ? <span className="text-xs text-neutral-500">{suffix}</span> : null}
		</label>
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
	// While the picker moves, the field shows what it was given at once (the board catches up once per frame)
	const [draft, setDraft] = useState<string | null>(null);
	const onCommitRef = useRef(onCommit);
	useLayoutEffect(() => {
		onCommitRef.current = onCommit;
	});
	// The native `change` event fires once the picker closes; React's onChange fires on every move
	useEffect(() => {
		const el = ref.current;
		if (!el) return;
		const onChange = () => {
			setDraft(null);
			onCommitRef.current(el.value);
		};
		el.addEventListener('change', onChange);
		return () => el.removeEventListener('change', onChange);
	}, []);
	const shown = draft ?? value;
	const none = shown === null;
	return (
		<FieldRow label={label}>
			<span className="relative h-6 w-6 shrink-0">
				<input
					ref={ref}
					name={name}
					aria-label={label}
					type="color"
					value={shown ?? '#ffffff'}
					onChange={(e) => {
						setDraft(e.target.value);
						onLive(e.target.value);
					}}
					// A picker closed without a change (cancelled): show the value again
					onBlur={() => setDraft(null)}
					className={`h-6 w-6 cursor-pointer rounded border border-neutral-700 bg-transparent p-0 [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded-[3px] [&::-webkit-color-swatch]:border-0 ${none ? 'opacity-0' : ''}`}
				/>
				{/* Transparent: a checkerboard with a slash (the picker still opens on it, to pick a colour) */}
				{none ? (
					<span
						aria-hidden
						className="pointer-events-none absolute inset-0 rounded border border-neutral-700 bg-[conic-gradient(#525252_25%,#262626_0_50%,#525252_0_75%,#262626_0)] bg-[length:8px_8px]"
					>
						<span className="absolute left-1/2 top-[-3px] h-[30px] w-[1.5px] -translate-x-1/2 rotate-45 bg-red-400" />
					</span>
				) : null}
			</span>
			<span className={`font-mono uppercase ${none ? 'text-neutral-500' : 'text-neutral-300'}`}>{none ? 'none' : shown}</span>
			{allowNone ? (
				<button
					type="button"
					aria-label={`${label}: ${none ? 'set' : 'none'}`}
					title={none ? `Add ${label}` : `Make transparent (no ${label})`}
					onClick={() => onCommit(none ? '#ffffff' : null)}
					className="ml-auto grid h-6 w-6 place-items-center rounded-md text-neutral-500 hover:bg-neutral-800 hover:text-neutral-100 cursor-pointer"
				>
					{none ? <Plus className="w-3.5 h-3.5" /> : <Ban className="w-3.5 h-3.5" />}
				</button>
			) : null}
		</FieldRow>
	);
}
