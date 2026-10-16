import { useStoryboard } from '../StoryboardContext';
import { setBoard } from '../model';
import type { BoardFormat } from '../types';
import { NumberField, TextField } from './fields';

const BOARD_PRESETS: Array<{ label: string; width: number; height: number }> = [
	{ label: '16:9', width: 1920, height: 1080 },
	{ label: '9:16', width: 1080, height: 1920 },
	{ label: '1:1', width: 1080, height: 1080 },
	{ label: '4:5', width: 1080, height: 1350 },
	{ label: '21:9', width: 2560, height: 1080 },
];

/** The board format, shared by every frame: opened from the board size under the artboard. */
export function BoardPopover({ board }: { board: BoardFormat }) {
	const { commit, storyboardRef } = useStoryboard();
	const onChange = (b: BoardFormat) => commit(setBoard(storyboardRef.current, b), 'BoardFormat');
	const preset = BOARD_PRESETS.find((p) => p.width === board.width && p.height === board.height);
	return (
		<div
			role="dialog"
			aria-label="Board format"
			data-testid="board-format"
			className="absolute bottom-12 left-24 compact:left-3 z-20 w-64 max-w-[calc(100%-1.5rem)] rounded-2xl border-2 border-neutral-600/20 bg-neutral-900/95 p-3 shadow-lg space-y-2 text-sm"
		>
			<div className="text-xs text-neutral-500">Board · all frames</div>
			<div className="grid grid-cols-5 gap-0.5 rounded-md bg-neutral-800/60 p-0.5">
				{BOARD_PRESETS.map((p) => (
					<button
						key={p.label}
						type="button"
						onClick={() => onChange({ ...board, width: p.width, height: p.height })}
						aria-pressed={preset === p}
						className={`rounded py-1 text-xs cursor-pointer ${preset === p ? 'bg-neutral-600 text-white' : 'text-neutral-300 hover:bg-neutral-700'}`}
					>
						{p.label}
					</button>
				))}
			</div>
			<div className="grid grid-cols-3 gap-1.5">
				<NumberField label="board width" prefix="W" name="board-width" value={board.width} min={16} max={8192} onCommit={(v) => onChange({ ...board, width: v })} />
				<NumberField label="board height" prefix="H" name="board-height" value={board.height} min={16} max={8192} onCommit={(v) => onChange({ ...board, height: v })} />
				<NumberField
					label="fps (0 = none)"
					prefix="fps"
					name="board-fps"
					value={board.fps ?? 0}
					min={0}
					max={240}
					onCommit={(v) => onChange(withOptional(board, 'fps', v > 0 ? v : undefined))}
				/>
			</div>
			<TextField
				label="Style"
				name="board-style"
				value={board.style ?? ''}
				placeholder="Style: look and feel, in your words"
				className="bg-neutral-800/60!"
				onCommit={(v) => onChange(withOptional(board, 'style', v || undefined))}
			/>
		</div>
	);
}

function withOptional<K extends 'fps' | 'style'>(board: BoardFormat, key: K, value: BoardFormat[K] | undefined): BoardFormat {
	const next = { ...board };
	if (value === undefined) delete next[key];
	else next[key] = value;
	return next;
}
