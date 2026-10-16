import React, { memo, useEffect, useRef, useState } from 'react';
import { ChevronDown, Download } from 'lucide-react';

const MESSAGE_MS = 8000;

interface ExportButtonProps {
	/** Builds and downloads `<title>.motia.zip`, reporting progress from 0 to 1; resolves to what the user should know. */
	onExport: (includeAudio: boolean, onProgress: (fraction: number) => void) => Promise<string[]>;
}

/** Export downloads straight away; "Include audio file" (off by default) sits in a small popover beside it. */
const ExportButtonComponent: React.FC<ExportButtonProps> = ({ onExport }) => {
	const [includeAudio, setIncludeAudio] = useState(false);
	const [optionsOpen, setOptionsOpen] = useState(false);
	const [progress, setProgress] = useState<number | null>(null);
	// After an export: a failure, or what the user should know about the file
	const [message, setMessage] = useState<string | null>(null);
	const rootRef = useRef<HTMLDivElement>(null);

	// The options popover closes on a press anywhere else, or Escape
	useEffect(() => {
		if (!optionsOpen) return;
		const onDown = (e: PointerEvent) => {
			if (!rootRef.current?.contains(e.target as Node)) setOptionsOpen(false);
		};
		const onKey = (e: KeyboardEvent) => {
			if (e.key !== 'Escape') return;
			e.preventDefault();
			setOptionsOpen(false);
		};
		document.addEventListener('pointerdown', onDown, true);
		document.addEventListener('keydown', onKey);
		return () => {
			document.removeEventListener('pointerdown', onDown, true);
			document.removeEventListener('keydown', onKey);
		};
	}, [optionsOpen]);

	useEffect(() => {
		if (!message) return;
		const t = window.setTimeout(() => setMessage(null), MESSAGE_MS);
		return () => window.clearTimeout(t);
	}, [message]);

	const run = async () => {
		if (progress !== null) return;
		setOptionsOpen(false);
		setMessage(null);
		setProgress(0);
		try {
			const warnings = await onExport(includeAudio, setProgress);
			if (warnings.length) setMessage(`Exported. ${warnings.join(' ')}`);
		} catch (err) {
			console.error('Export failed', err);
			setMessage('The export failed. Try again.');
		} finally {
			setProgress(null);
		}
	};

	const busy = progress !== null;
	return (
		<div ref={rootRef} className="relative flex items-center">
			<button
				type="button"
				onClick={() => void run()}
				disabled={busy}
				aria-label="Export"
				title="Export storyboard (.motia.zip)"
				className="h-6 min-w-6 px-1 grid place-items-center rounded-md cursor-pointer text-neutral-400 hover:bg-neutral-800/60 hover:text-neutral-200 transition-colors disabled:cursor-default"
			>
				{busy ? (
					<span role="progressbar" aria-label="Exporting" aria-valuenow={Math.round(progress * 100)} className="text-[11px] tabular-nums text-neutral-300">
						{Math.round(progress * 100)}%
					</span>
				) : (
					<Download className="w-4 h-4" />
				)}
			</button>
			<button
				type="button"
				onClick={() => setOptionsOpen((v) => !v)}
				aria-label="Export options"
				aria-expanded={optionsOpen}
				title="Export options"
				className="h-6 w-4 grid place-items-center rounded-md cursor-pointer text-neutral-500 hover:bg-neutral-800/60 hover:text-neutral-200 transition-colors"
			>
				<ChevronDown className="w-3 h-3" />
			</button>
			{optionsOpen ? (
				<div
					role="dialog"
					aria-label="Export options"
					className="absolute left-0 top-8 z-50 whitespace-nowrap rounded-lg border border-neutral-700 bg-neutral-900/95 px-3 py-2 text-xs text-neutral-200 shadow-xl"
				>
					<label className="flex items-center gap-2 cursor-pointer">
						<input type="checkbox" checked={includeAudio} onChange={(e) => setIncludeAudio(e.target.checked)} className="accent-blue-500" />
						Include audio file
					</label>
				</div>
			) : null}
			{message ? (
				<div role="alert" className="absolute left-0 top-8 z-50 w-72 rounded-lg bg-red-900/90 px-3 py-1.5 text-xs text-red-100 shadow-lg">
					{message}
				</div>
			) : null}
		</div>
	);
};

export const ExportButton = memo(ExportButtonComponent);
