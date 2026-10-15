import { useCallback, useEffect, useRef } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { useStoryboard } from '../StoryboardContext';
import { addSymbol, newId, patchElements, reorderElements, removeElements, replaceElements, setBoard, updateFrame, updateSymbol, type ElementPatch } from '../model';
import { formatFrameTime } from '../canvas/layout';
import { ImagePickButton } from './ImagePick';
import { useImageIntake } from './useImages';
import type { BoardFormat, Frame, FrameElement, StoryboardDoc } from '../types';
import { applyBox, applyRotation, elementBox, isPointsElement } from './geometry';
import { ColorField, FieldRow, NumberField, TextField } from './fields';
import { textPatch } from './elements';

const BOARD_PRESETS: Array<{ label: string; width: number; height: number }> = [
	{ label: '16:9', width: 1920, height: 1080 },
	{ label: '9:16', width: 1080, height: 1920 },
	{ label: '1:1', width: 1080, height: 1080 },
	{ label: '4:5', width: 1080, height: 1350 },
	{ label: '21:9', width: 2560, height: 1080 },
];

const section = 'space-y-2 border-b border-neutral-800 pb-3';
const smallButton =
	'flex-1 inline-flex items-center justify-center gap-1 rounded-md bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 px-2 py-1 text-xs text-neutral-200 cursor-pointer';
const panelClass =
	'shrink-0 overflow-y-auto bg-neutral-900/95 border-neutral-800 p-3 space-y-3 text-sm md:w-72 md:border-l max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:max-h-[45vh] max-md:border-t max-md:rounded-t-2xl max-md:z-10';

type Apply = (v: string | null) => (doc: StoryboardDoc) => StoryboardDoc;

/**
 * Colour pickers preview live while dragging and land as one undo step. The live edit is tracked by token, so
 * one that something else settled (undo, another action, a drag) is never mistaken for still open; an open one
 * is settled when the panel goes away.
 */
function useColourEdit() {
	const { commit, storyboardRef, beginLiveEdit, liveUpdate, endLiveEdit, isLiveEditOpen } = useStoryboard();
	const token = useRef<number | null>(null);
	const isOpen = useCallback(() => token.current !== null && isLiveEditOpen(token.current), [isLiveEditOpen]);
	useEffect(
		() => () => {
			if (isOpen()) endLiveEdit();
		},
		[isOpen, endLiveEdit]
	);
	return useCallback(
		(apply: Apply, label: string) => ({
			onLive: (v: string) => {
				if (!isOpen()) token.current = beginLiveEdit('commit', label);
				liveUpdate(apply(v));
			},
			onCommit: (v: string | null) => {
				if (isOpen()) {
					liveUpdate(apply(v));
					endLiveEdit();
				} else {
					commit(apply(v)(storyboardRef.current), label);
				}
				token.current = null;
			},
		}),
		[isOpen, beginLiveEdit, liveUpdate, endLiveEdit, commit, storyboardRef]
	);
}

type InspectorProps = {
	frame: Frame;
	board: BoardFormat;
	selectedIds: string[];
	/** Shows a short message (e.g. an image that can't be used) */
	notify: (message: string) => void;
	/** All frames in time order (frame references pick from them) */
	ordered: Frame[];
};

/** Right panel (bottom sheet on small screens): the selection's properties, or the frame and board format. */
export function Inspector({ frame, board, selectedIds, notify, ordered }: InspectorProps) {
	const selected = frame.elements.filter((el) => selectedIds.includes(el.id));
	if (selected.length === 0) return <FrameInspector frame={frame} board={board} />;
	if (selected.length > 1) return <MultiInspector frame={frame} ids={selectedIds} />;
	// Remounted per element: a field never carries a draft from one element to another
	return <ElementInspector key={selected[0].id} frame={frame} el={selected[0]} notify={notify} ordered={ordered} />;
}

function FrameInspector({ frame, board }: { frame: Frame; board: BoardFormat }) {
	const { commit, storyboardRef } = useStoryboard();
	const colour = useColourEdit();
	const background: Apply = (v) => (doc) => updateFrame(doc, frame.id, { background: v ?? '#000000' });
	return (
		<aside className={panelClass} aria-label="Frame properties" data-testid="inspector">
			<div className={section}>
				<div className="text-xs uppercase tracking-wide text-neutral-500">Frame</div>
				<TextField
					label="notes"
					name="frame-notes"
					multiline
					value={frame.notes}
					placeholder="What happens in this frame"
					onCommit={(v) => commit(updateFrame(storyboardRef.current, frame.id, { notes: v }), 'FrameNotes')}
				/>
				<TextField
					label="group"
					name="frame-group"
					value={frame.group ?? ''}
					placeholder="e.g. shot 3"
					onCommit={(v) => {
						const group = v.trim() || undefined;
						if (group === frame.group) return false;
						commit(updateFrame(storyboardRef.current, frame.id, { group }), 'FrameGroup');
					}}
				/>
				<ColorField label="background" name="frame-background" value={frame.background} {...colour(background, 'FrameBackground')} />
			</div>
			<BoardSettings board={board} onChange={(b) => commit(setBoard(storyboardRef.current, b), 'BoardFormat')} />
		</aside>
	);
}

function Stacking({ frameId, ids }: { frameId: string; ids: string[] }) {
	const { commit, storyboardRef } = useStoryboard();
	const order = (dir: 1 | -1) => commit(reorderElements(storyboardRef.current, frameId, new Set(ids), dir), 'ReorderElements');
	return (
		<div className="flex gap-2">
			<button type="button" className={smallButton} onClick={() => order(1)} title="Bring forward">
				<ArrowUp className="w-3.5 h-3.5" /> forward
			</button>
			<button type="button" className={smallButton} onClick={() => order(-1)} title="Send back">
				<ArrowDown className="w-3.5 h-3.5" /> back
			</button>
			<button
				type="button"
				className={`${smallButton} text-red-300`}
				onClick={() => commit(removeElements(storyboardRef.current, frameId, new Set(ids)), 'DeleteElements')}
				title="Delete (Del)"
			>
				Delete
			</button>
		</div>
	);
}

function MultiInspector({ frame, ids }: { frame: Frame; ids: string[] }) {
	return (
		<aside className={panelClass} aria-label="Selection properties" data-testid="inspector">
			<div className="text-xs text-neutral-400">{ids.length} selected</div>
			<Stacking frameId={frame.id} ids={ids} />
		</aside>
	);
}

function ElementInspector({ frame, el, notify, ordered }: { frame: Frame; el: FrameElement; notify: (message: string) => void; ordered: Frame[] }) {
	const { commit, storyboardRef } = useStoryboard();
	const colour = useColourEdit();
	const patch = (p: ElementPatch, label: string) => commit(patchElements(storyboardRef.current, frame.id, new Map([[el.id, p]])), label);
	const box = elementBox(el);
	const setBox = (next: Partial<typeof box>, label: string) =>
		commit(replaceElements(storyboardRef.current, frame.id, new Map([[el.id, applyBox(el, box, { ...box, ...next })]])), label);
	const setColour =
		(key: 'fill' | 'stroke'): Apply =>
		(v) =>
		(doc) =>
			patchElements(doc, frame.id, new Map([[el.id, { [key]: v }]]));
	const hasFill = el.type === 'rect' || el.type === 'ellipse' || el.type === 'text';
	const hasStroke = el.type === 'rect' || el.type === 'ellipse' || isPointsElement(el);

	return (
		<aside className={panelClass} aria-label="Element properties" data-testid="inspector">
			<div className={section}>
				<div className="text-xs uppercase tracking-wide text-neutral-500">{el.type}</div>
				<TextField label="label" name="label" value={el.label ?? ''} placeholder="What this is" onCommit={(v) => patch({ label: v || undefined }, 'Label')} />
				<TextField label="note" name="note" multiline value={el.note ?? ''} placeholder="How it moves, what it means" onCommit={(v) => patch({ note: v || undefined }, 'Note')} />
			</div>
			<div className={section}>
				<div className="grid grid-cols-2 gap-2">
					<NumberField label="x" name="x" value={box.x} onCommit={(v) => setBox({ x: v }, 'Move')} />
					<NumberField label="y" name="y" value={box.y} onCommit={(v) => setBox({ y: v }, 'Move')} />
					<NumberField label="w" name="w" value={box.w} min={1} onCommit={(v) => setBox({ w: v }, 'Resize')} />
					<NumberField label="h" name="h" value={box.h} min={1} onCommit={(v) => setBox({ h: v }, 'Resize')} />
				</div>
				{!isPointsElement(el) ? (
					<NumberField
						label="rotate"
						name="rotation"
						value={el.rotation}
						suffix="°"
						min={-360}
						max={360}
						onCommit={(v) => commit(replaceElements(storyboardRef.current, frame.id, new Map([[el.id, applyRotation(el, box, v)]])), 'Rotate')}
					/>
				) : null}
				{el.type === 'rect' ? <NumberField label="radius" name="radius" value={el.radius} min={0} onCommit={(v) => patch({ radius: v }, 'Radius')} /> : null}
			</div>
			{el.type === 'box' || el.type === 'image' ? <ImageSection frame={frame} el={el} notify={notify} /> : null}
			{el.type === 'frameRef' ? (
				<div className={section}>
					<FieldRow label="shows">
						<select
							name="refFrame"
							aria-label="shows"
							value={el.refFrameId}
							onChange={(e) => patch({ refFrameId: e.target.value }, 'FrameRefTarget')}
							className="w-full min-w-0 rounded-md bg-neutral-800 border border-neutral-700 px-2 py-1 text-sm text-neutral-100 outline-none focus:border-neutral-500"
						>
							{el.refFrameId && !ordered.some((f) => f.id === el.refFrameId) ? <option value={el.refFrameId}>(deleted frame)</option> : null}
							{!el.refFrameId ? <option value="">(choose a frame)</option> : null}
							{ordered
								.filter((f) => f.id !== frame.id)
								.map((f) => (
									<option key={f.id} value={f.id}>
										{formatFrameTime(f.time)}
										{f.title ? ` · ${f.title}` : ''}
									</option>
								))}
						</select>
					</FieldRow>
				</div>
			) : null}
			<div className={section}>
				{el.type === 'text' ? (
					<>
						<TextField
							label="text"
							name="text"
							multiline
							value={el.text}
							// Empty text would leave an invisible element; delete it instead
							onCommit={(v) => (v.trim() ? patch(textPatch(el, v), 'Text') : false)}
						/>
						<NumberField label="font size" name="fontSize" value={el.fontSize} min={4} onCommit={(v) => patch({ fontSize: v, ...textPatch({ ...el, fontSize: v }, el.text) }, 'FontSize')} />
					</>
				) : null}
				{hasFill ? (
					<ColorField label="fill" name="fill" value={(el as { fill: string | null }).fill} allowNone={el.type !== 'text'} {...colour(setColour('fill'), 'Fill')} />
				) : null}
				{hasStroke ? (
					<>
						<ColorField label="stroke" name="stroke" value={(el as { stroke: string | null }).stroke} allowNone {...colour(setColour('stroke'), 'Stroke')} />
						<NumberField label="width" name="strokeWidth" value={(el as { strokeWidth: number }).strokeWidth} min={0} onCommit={(v) => patch({ strokeWidth: v }, 'StrokeWidth')} />
					</>
				) : null}
				<NumberField
					label="opacity"
					name="opacity"
					value={Math.round((el.opacity ?? 1) * 100)}
					suffix="%"
					min={0}
					max={100}
					onCommit={(v) => patch({ opacity: v >= 100 ? undefined : v / 100 }, 'Opacity')}
				/>
			</div>
			<Stacking frameId={frame.id} ids={[el.id]} />
		</aside>
	);
}

type BoxLike = Extract<FrameElement, { type: 'box' | 'image' }>;

/**
 * Images of boxes and image elements, and symbols. A symbol instance shows its symbol's name and image; changing
 * the image here changes it for every instance.
 */
function ImageSection({ frame, el, notify }: { frame: Frame; el: BoxLike; notify: (message: string) => void }) {
	const { storyboard, commit, storyboardRef } = useStoryboard();
	const intake = useImageIntake(notify);
	const symbol = el.type === 'box' && el.symbolId ? storyboard.symbols.find((s) => s.id === el.symbolId) : undefined;
	const hasImage = symbol ? !!symbol.assetId : !!el.assetId;

	const setImage = async (file: File) => {
		const added = await intake(file);
		// The element or symbol may have gone (undo, project change) while the image was read
		const current = storyboardRef.current;
		const stillThere = symbol
			? current.symbols.some((s) => s.id === symbol.id)
			: current.frames.find((f) => f.id === frame.id)?.elements.some((x) => x.id === el.id);
		if (!added || !stillThere) return;
		const doc = added.record(current);
		commit(
			symbol ? updateSymbol(doc, symbol.id, { assetId: added.asset.id }) : patchElements(doc, frame.id, new Map([[el.id, { assetId: added.asset.id }]])),
			'SetImage'
		);
	};
	const removeImage = () =>
		commit(
			symbol
				? updateSymbol(storyboardRef.current, symbol.id, { assetId: undefined })
				: patchElements(storyboardRef.current, frame.id, new Map([[el.id, { assetId: undefined }]])),
			'RemoveImage'
		);
	// The box becomes the first instance: its label and image move to the symbol, its note is copied
	const saveAsSymbol = () => {
		if (el.type !== 'box') return;
		const s = { id: newId('s_'), label: el.label || 'symbol', ...(el.note ? { note: el.note } : {}), ...(el.assetId ? { assetId: el.assetId } : {}) };
		const doc = addSymbol(storyboardRef.current, s);
		commit(patchElements(doc, frame.id, new Map([[el.id, { symbolId: s.id, label: undefined, assetId: undefined }]])), 'SaveSymbol');
	};

	return (
		<div className={section}>
			{symbol ? (
				<TextField
					label="symbol"
					name="symbol-name"
					value={symbol.label}
					onCommit={(v) => (v.trim() ? commit(updateSymbol(storyboardRef.current, symbol.id, { label: v.trim() }), 'RenameSymbol') : false)}
				/>
			) : null}
			<div className="flex gap-2">
				<ImagePickButton className={smallButton} title={hasImage ? 'Replace image' : 'Add image'} onFile={(f) => void setImage(f)}>
					{hasImage ? 'Replace image' : 'Add image'}
				</ImagePickButton>
				{hasImage && el.type === 'box' ? (
					<button type="button" className={smallButton} onClick={removeImage} title="Remove image">
						Remove image
					</button>
				) : null}
			</div>
			{el.type === 'box' && !symbol ? (
				<button type="button" className={smallButton} onClick={saveAsSymbol} title="Save as symbol, to place it in any frame">
					Save as symbol
				</button>
			) : null}
		</div>
	);
}

function BoardSettings({ board, onChange }: { board: BoardFormat; onChange: (b: BoardFormat) => void }) {
	const preset = BOARD_PRESETS.find((p) => p.width === board.width && p.height === board.height);
	return (
		<div className={section}>
			<div className="text-xs uppercase tracking-wide text-neutral-500">Board (all frames)</div>
			<FieldRow label="format">
				<div className="flex flex-wrap gap-1">
					{BOARD_PRESETS.map((p) => (
						<button
							key={p.label}
							type="button"
							onClick={() => onChange({ ...board, width: p.width, height: p.height })}
							className={`rounded px-1.5 py-0.5 text-xs cursor-pointer ${preset === p ? 'bg-neutral-600 text-white' : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'}`}
						>
							{p.label}
						</button>
					))}
				</div>
			</FieldRow>
			<div className="grid grid-cols-2 gap-2">
				<NumberField label="W" name="board-width" value={board.width} min={16} max={8192} onCommit={(v) => onChange({ ...board, width: v })} />
				<NumberField label="H" name="board-height" value={board.height} min={16} max={8192} onCommit={(v) => onChange({ ...board, height: v })} />
			</div>
			<NumberField label="fps" name="board-fps" value={board.fps ?? 0} min={0} max={240} onCommit={(v) => onChange(withOptional(board, 'fps', v > 0 ? v : undefined))} />
			<TextField
				label="style"
				name="board-style"
				value={board.style ?? ''}
				placeholder="Look and feel, in your words"
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
