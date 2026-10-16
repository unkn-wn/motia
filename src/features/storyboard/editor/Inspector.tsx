import { useCallback, useEffect, useRef } from 'react';
import {
	ArrowDown,
	ArrowUp,
	ChevronUp,
	Circle,
	Image as ImageIcon,
	Minus,
	MoveUpRight,
	Pen,
	PictureInPicture2,
	RotateCw,
	Square,
	SquareDashed,
	SquareRoundCorner,
	Trash2,
	Type,
} from 'lucide-react';
import { useStoryboard, useStoryboardDoc } from '../StoryboardContext';
import { addSymbol, newId, patchElements, reorderElements, removeElements, replaceElements, updateFrame, updateSymbol, type ElementPatch } from '../model';
import { formatFrameTime } from '../canvas/layout';
import { ImagePickButton } from './ImagePick';
import { useImageIntake } from './useImages';
import type { Frame, FrameElement, StoryboardDoc } from '../types';
import { applyBox, applyRotation, elementBox, isPointsElement } from './geometry';
import { ColorField, FieldRow, NumberField, TextField } from './fields';
import { textPatch } from './elements';

const TYPES: Record<FrameElement['type'], { name: string; icon: React.ReactNode }> = {
	rect: { name: 'Rectangle', icon: <Square className="w-4 h-4" /> },
	ellipse: { name: 'Ellipse', icon: <Circle className="w-4 h-4" /> },
	line: { name: 'Line', icon: <Minus className="w-4 h-4 -rotate-45" /> },
	arrow: { name: 'Arrow', icon: <MoveUpRight className="w-4 h-4" /> },
	text: { name: 'Text', icon: <Type className="w-4 h-4" /> },
	pen: { name: 'Pen stroke', icon: <Pen className="w-4 h-4" /> },
	box: { name: 'Box', icon: <SquareDashed className="w-4 h-4" /> },
	image: { name: 'Image', icon: <ImageIcon className="w-4 h-4" /> },
	frameRef: { name: 'Frame reference', icon: <PictureInPicture2 className="w-4 h-4" /> },
};

const section = 'space-y-1.5 pt-2';
/** Stroke width given to a shape whose stroke is turned on while its width is 0. */
const STROKE_ON_WIDTH = 8;
const smallButton = 'flex-1 inline-flex items-center justify-center gap-1 rounded-md bg-neutral-800 hover:bg-neutral-700 px-2 py-1 text-xs text-neutral-200 cursor-pointer';
const iconButton = 'grid h-7 w-7 shrink-0 place-items-center rounded-md text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100 cursor-pointer';
const panelClass =
	'shrink-0 overflow-y-auto bg-neutral-900 border-neutral-800 p-3 space-y-3 text-sm md:w-64 md:border-l max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:max-h-[45vh] max-md:border-t max-md:rounded-t-2xl max-md:z-30 max-md:pb-[calc(env(safe-area-inset-bottom)+0.75rem)] max-md:shadow-[0_-8px_24px_rgba(0,0,0,0.4)]';

/** On phones the panel is a bottom sheet: its header row always shows, the rest opens on demand. */
export type Sheet = { open: boolean; onToggle: () => void };

function Panel({ label, header, sheet, children }: { label: string; header: React.ReactNode; sheet: Sheet; children?: React.ReactNode }) {
	return (
		<aside className={panelClass} aria-label={label} data-testid="inspector">
			<div className="flex items-center gap-1">
				<div className="flex flex-1 min-w-0 items-center gap-1">{header}</div>
				{children ? (
					<button
						type="button"
						className={`${iconButton} md:hidden`}
						onClick={sheet.onToggle}
						aria-expanded={sheet.open}
						aria-label={sheet.open ? 'Hide properties' : 'Show properties'}
						title={sheet.open ? 'Hide properties' : 'Show properties'}
					>
						<ChevronUp className={`w-4 h-4 transition-transform ${sheet.open ? 'rotate-180' : ''}`} />
					</button>
				) : null}
			</div>
			{children ? <div className={`space-y-3 ${sheet.open ? '' : 'max-md:hidden'}`}>{children}</div> : null}
		</aside>
	);
}

type Apply<T = string | null> = (v: T) => (doc: StoryboardDoc) => StoryboardDoc;

/**
 * Live previews — a colour picker being dragged, a value dragged on its label — that land as one undo step. The
 * board updates at most once per animation frame, however fast the input events come (a picker sends one per
 * pointer move, often several per frame, and each would re-render the editor). The live edit is tracked by token,
 * so one that something else settled (undo, another action, a drag) is never mistaken for still open; an open one
 * is settled when the panel goes away.
 */
function useLiveEdit() {
	const { commit, storyboardRef, beginLiveEdit, liveUpdate, endLiveEdit, isLiveEditOpen } = useStoryboard();
	const token = useRef<number | null>(null);
	const pending = useRef<((doc: StoryboardDoc) => StoryboardDoc) | null>(null);
	const frame = useRef(0);
	const isOpen = useCallback(() => token.current !== null && isLiveEditOpen(token.current), [isLiveEditOpen]);
	const flush = useCallback(() => {
		cancelAnimationFrame(frame.current);
		frame.current = 0;
		const update = pending.current;
		pending.current = null;
		if (update && isOpen()) liveUpdate(update);
	}, [isOpen, liveUpdate]);
	useEffect(
		() => () => {
			flush();
			if (isOpen()) endLiveEdit();
		},
		[flush, isOpen, endLiveEdit]
	);
	return useCallback(
		<T,>(apply: Apply<T>, label: string) => ({
			onLive: (v: T) => {
				if (!isOpen()) token.current = beginLiveEdit('commit', label);
				pending.current = apply(v);
				if (!frame.current) frame.current = requestAnimationFrame(flush);
			},
			onCommit: (v: T) => {
				cancelAnimationFrame(frame.current);
				frame.current = 0;
				pending.current = null;
				if (isOpen()) {
					liveUpdate(apply(v));
					endLiveEdit();
				} else {
					commit(apply(v)(storyboardRef.current), label);
				}
				token.current = null;
			},
		}),
		[isOpen, beginLiveEdit, liveUpdate, endLiveEdit, commit, storyboardRef, flush]
	);
}

type InspectorProps = {
	frame: Frame;
	selectedIds: string[];
	/** Shows a short message (e.g. an image that can't be used) */
	notify: (message: string) => void;
	/** All frames in time order (frame references pick from them) */
	ordered: Frame[];
	sheet: Sheet;
};

/** Right panel (bottom sheet on small screens): the selection's properties, or the frame's. */
export function Inspector({ frame, selectedIds, notify, ordered, sheet }: InspectorProps) {
	const selected = frame.elements.filter((el) => selectedIds.includes(el.id));
	if (selected.length === 0) return <FrameInspector frame={frame} sheet={sheet} />;
	if (selected.length > 1) return <MultiInspector frame={frame} ids={selectedIds} sheet={sheet} />;
	// Remounted per element: a field never carries a draft from one element to another
	return <ElementInspector key={selected[0].id} frame={frame} el={selected[0]} notify={notify} ordered={ordered} sheet={sheet} />;
}

function FrameInspector({ frame, sheet }: { frame: Frame; sheet: Sheet }) {
	const { commit, storyboardRef } = useStoryboard();
	const live = useLiveEdit();
	const background: Apply = (v) => (doc) => updateFrame(doc, frame.id, { background: v ?? '#000000' });
	return (
		<Panel
			label="Frame properties"
			sheet={sheet}
			header={
				<>
					<div className="shrink-0 px-1.5 text-xs text-neutral-500">Frame</div>
					{/* Closed sheet: the notes at a glance; a tap opens them */}
					{sheet.open ? null : (
						<button type="button" onClick={sheet.onToggle} className="md:hidden min-w-0 flex-1 truncate text-left text-sm text-neutral-400 cursor-pointer">
							{frame.notes.split('\n')[0] || 'Notes, group, background'}
						</button>
					)}
				</>
			}
		>
			<TextField
				label="Frame notes"
				name="frame-notes"
				multiline
				value={frame.notes}
				placeholder="What happens in this frame…"
				className="min-h-24"
				onCommit={(v) => commit(updateFrame(storyboardRef.current, frame.id, { notes: v }), 'FrameNotes')}
			/>
			<TextField
				label="Group"
				name="frame-group"
				prefix="#"
				value={frame.group ?? ''}
				placeholder="group, e.g. shot 3"
				title="Optional tag shown on the card"
				onCommit={(v) => {
					const group = v.trim() || undefined;
					if (group === frame.group) return false;
					commit(updateFrame(storyboardRef.current, frame.id, { group }), 'FrameGroup');
				}}
			/>
			<div className={section}>
				<ColorField label="background" name="frame-background" value={frame.background} {...live(background, 'FrameBackground')} />
			</div>
		</Panel>
	);
}

function Stacking({ frameId, ids }: { frameId: string; ids: string[] }) {
	const { commit, storyboardRef } = useStoryboard();
	const order = (dir: 1 | -1) => commit(reorderElements(storyboardRef.current, frameId, new Set(ids), dir), 'ReorderElements');
	return (
		<div className="flex shrink-0">
			<button type="button" className={iconButton} onClick={() => order(1)} title="Bring forward" aria-label="Bring forward">
				<ArrowUp className="w-4 h-4" />
			</button>
			<button type="button" className={iconButton} onClick={() => order(-1)} title="Send back" aria-label="Send back">
				<ArrowDown className="w-4 h-4" />
			</button>
			<button
				type="button"
				className={`${iconButton} hover:text-red-300`}
				onClick={() => commit(removeElements(storyboardRef.current, frameId, new Set(ids)), 'DeleteElements')}
				title="Delete (Del)"
				aria-label="Delete"
			>
				<Trash2 className="w-4 h-4" />
			</button>
		</div>
	);
}

function MultiInspector({ frame, ids, sheet }: { frame: Frame; ids: string[]; sheet: Sheet }) {
	return (
		<Panel
			label="Selection properties"
			sheet={sheet}
			header={
				<>
					<div className="flex-1 px-1.5 text-sm text-neutral-300">{ids.length} selected</div>
					<Stacking frameId={frame.id} ids={ids} />
				</>
			}
		/>
	);
}

function ElementInspector({ frame, el, notify, ordered, sheet }: { frame: Frame; el: FrameElement; notify: (message: string) => void; ordered: Frame[]; sheet: Sheet }) {
	const { commit, storyboardRef } = useStoryboard();
	const live = useLiveEdit();
	const patch = (p: ElementPatch, label: string) => commit(patchElements(storyboardRef.current, frame.id, new Map([[el.id, p]])), label);
	const box = elementBox(el);
	// Each number as a change to the board: committed when typed, previewed live when dragged on its label (one undo
	// step at the end)
	const onBox =
		(key: 'x' | 'y' | 'w' | 'h'): Apply<number> =>
		(v) =>
		(doc) =>
			replaceElements(doc, frame.id, new Map([[el.id, applyBox(el, box, { ...box, [key]: v })]]));
	const onPatch =
		(p: (v: number) => ElementPatch): Apply<number> =>
		(v) =>
		(doc) =>
			patchElements(doc, frame.id, new Map([[el.id, p(v)]]));
	const onRotate: Apply<number> = (v) => (doc) => replaceElements(doc, frame.id, new Map([[el.id, applyRotation(el, box, v)]]));
	const number = (apply: Apply<number>, label: string) => ({ onCommit: (v: number) => commit(apply(v)(storyboardRef.current), label), scrub: live(apply, label) });
	// A stroke turned on for a shape without one gets a width that shows (a bordered shape, e.g. with no fill)
	const setColour =
		(key: 'fill' | 'stroke'): Apply =>
		(v) =>
		(doc) =>
			patchElements(
				doc,
				frame.id,
				new Map([[el.id, key === 'stroke' && v !== null && 'strokeWidth' in el && el.strokeWidth === 0 ? { stroke: v, strokeWidth: STROKE_ON_WIDTH } : { [key]: v }]])
			);
	const hasFill = el.type === 'rect' || el.type === 'ellipse' || el.type === 'text';
	const hasStroke = el.type === 'rect' || el.type === 'ellipse' || isPointsElement(el);
	const type = TYPES[el.type];

	return (
		<Panel
			label="Element properties"
			sheet={sheet}
			// The label is the element's name, like a layer name: it reads as the type until one is given
			header={
				<>
					<span className="shrink-0 pl-1 text-neutral-500" title={type.name}>
						{type.icon}
					</span>
					<div className="flex-1 min-w-0">
						<TextField
							label="Name"
							name="label"
							value={el.label ?? ''}
							placeholder={type.name}
							className="font-medium"
							title="Name (optional): used in exports and search"
							onCommit={(v) => patch({ label: v || undefined }, 'Label')}
						/>
					</div>
					<Stacking frameId={frame.id} ids={[el.id]} />
				</>
			}
		>
				<TextField
					label="Note"
					name="note"
					multiline
					value={el.note ?? ''}
					placeholder="Add a note: how it moves, what it means…"
					className="text-neutral-300"
					onCommit={(v) => patch({ note: v || undefined }, 'Note')}
				/>
			{el.type === 'text' ? (
				<div className={section}>
					<TextField
						label="Text"
						name="text"
						multiline
						value={el.text}
						className="bg-neutral-800/60!"
						// Empty text would leave an invisible element; delete it instead
						onCommit={(v) => (v.trim() ? patch(textPatch(el, v), 'Text') : false)}
					/>
				</div>
			) : null}
			<div className={section}>
				<div className="grid grid-cols-2 gap-1.5">
					<NumberField label="x" prefix="X" name="x" value={box.x} {...number(onBox('x'), 'Move')} />
					<NumberField label="y" prefix="Y" name="y" value={box.y} {...number(onBox('y'), 'Move')} />
					<NumberField label="width" prefix="W" name="w" value={box.w} min={1} {...number(onBox('w'), 'Resize')} />
					<NumberField label="height" prefix="H" name="h" value={box.h} min={1} {...number(onBox('h'), 'Resize')} />
					{!isPointsElement(el) ? (
						<NumberField
							label="rotation"
							prefix={<RotateCw className="w-3 h-3" />}
							name="rotation"
							value={el.rotation}
							suffix="°"
							min={-360}
							max={360}
							{...number(onRotate, 'Rotate')}
						/>
					) : null}
					{el.type === 'rect' ? (
						<NumberField
							label="corner radius"
							prefix={<SquareRoundCorner className="w-3 h-3" />}
							name="radius"
							value={el.radius}
							min={0}
							{...number(onPatch((v) => ({ radius: v })), 'Radius')}
						/>
					) : null}
					{el.type === 'text' ? (
						<NumberField
							label="font size"
							prefix={<Type className="w-3 h-3" />}
							name="fontSize"
							value={el.fontSize}
							min={4}
							{...number(onPatch((v) => ({ fontSize: v, ...textPatch({ ...el, fontSize: v }, el.text) })), 'FontSize')}
						/>
					) : null}
				</div>
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
							className="w-full min-w-0 h-7 rounded-md bg-neutral-800/60 px-1.5 text-sm text-neutral-100 outline-none hover:bg-neutral-800 focus:bg-neutral-800"
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
				{hasFill ? (
					<ColorField label="fill" name="fill" value={(el as { fill: string | null }).fill} allowNone={el.type !== 'text'} {...live(setColour('fill'), 'Fill')} />
				) : null}
				{hasStroke ? <ColorField label="stroke" name="stroke" value={(el as { stroke: string | null }).stroke} allowNone {...live(setColour('stroke'), 'Stroke')} /> : null}
				<div className="grid grid-cols-2 gap-1.5 pt-1">
					{hasStroke ? (
						<NumberField
							label="stroke width"
							prefix={<Minus className="w-3 h-3" strokeWidth={4} />}
							name="strokeWidth"
							value={(el as { strokeWidth: number }).strokeWidth}
							min={0}
							{...number(onPatch((v) => ({ strokeWidth: v })), 'StrokeWidth')}
						/>
					) : null}
					<NumberField
						label="opacity"
						prefix={<Circle className="w-3 h-3 fill-current opacity-50" />}
						name="opacity"
						value={Math.round((el.opacity ?? 1) * 100)}
						suffix="%"
						min={0}
						max={100}
						{...number(onPatch((v) => ({ opacity: v >= 100 ? undefined : v / 100 })), 'Opacity')}
					/>
				</div>
			</div>
		</Panel>
	);
}

type BoxLike = Extract<FrameElement, { type: 'box' | 'image' }>;

/**
 * Images of boxes and image elements, and symbols. A symbol instance shows its symbol's name and image; changing
 * the image here changes it for every instance.
 */
function ImageSection({ frame, el, notify }: { frame: Frame; el: BoxLike; notify: (message: string) => void }) {
	const { commit, storyboardRef } = useStoryboard();
	const storyboard = useStoryboardDoc();
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
					label="Symbol name"
					name="symbol-name"
					prefix={<span className="text-xs">symbol</span>}
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
