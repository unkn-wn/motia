import { useRef } from 'react';
import Modal from '@/components/Modal';

const MAX_LISTED = 20;
const IMPORT_ACCEPT = '.zip,.json,application/zip,application/json';

/** "Import storyboard": a button (Projects page) or a small link (landing page) that picks a file. */
export function ImportStoryboardButton({ onFile, busy, variant }: { onFile: (file: File) => void; busy: boolean; variant: 'button' | 'link' }) {
	const inputRef = useRef<HTMLInputElement>(null);
	const className =
		variant === 'button'
			? 'inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm text-neutral-200 ring-1 ring-neutral-800 hover:bg-neutral-800 cursor-pointer disabled:opacity-60 disabled:cursor-default'
			: 'text-xs text-neutral-400 underline-offset-4 hover:text-neutral-200 hover:underline cursor-pointer disabled:opacity-60 disabled:cursor-default';
	return (
		<>
			<button type="button" className={className} disabled={busy} onClick={() => inputRef.current?.click()} title="Open a .motia.zip as a new project">
				{busy ? 'Importing…' : variant === 'button' ? 'Import storyboard' : 'or import a storyboard'}
			</button>
			<input
				ref={inputRef}
				type="file"
				accept={IMPORT_ACCEPT}
				className="hidden"
				data-testid="import-input"
				onChange={(e) => {
					const file = e.target.files?.[0];
					e.target.value = '';
					if (file) onFile(file);
				}}
			/>
		</>
	);
}

/** Why an import was refused. Nothing was written. */
export function ImportErrorsModal({ errors, onClose }: { errors: string[] | null; onClose: () => void }) {
	const shown = errors?.slice(0, MAX_LISTED) ?? [];
	const more = (errors?.length ?? 0) - shown.length;
	return (
		<Modal open={!!errors} onClose={onClose} title="This storyboard can't be imported">
			<p className="text-sm text-neutral-400">Nothing was added. What needs fixing:</p>
			<ul className="mt-3 max-h-64 overflow-y-auto space-y-1 text-sm" data-testid="import-errors">
				{shown.map((e, i) => (
					<li key={i} className="break-words">
						{e}
					</li>
				))}
				{more > 0 ? <li className="text-neutral-500">and {more} more</li> : null}
			</ul>
			<div className="mt-4 flex justify-end">
				<button onClick={onClose} className="px-3 py-1.5 rounded border border-neutral-700 bg-neutral-800 text-neutral-200 hover:bg-neutral-700 cursor-pointer">
					Close
				</button>
			</div>
		</Modal>
	);
}
