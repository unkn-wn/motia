import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
	ChevronLeft,
	ChevronRight,
	Circle,
	CircleDashed,
	Crosshair,
	Grid3x3,
	Image as ImageIcon,
	Maximize,
	Minus,
	MousePointer2,
	MoveUpRight,
	Pen,
	PictureInPicture2,
	Redo2,
	Scan,
	Shapes,
	Square,
	SquareDashed,
	Type,
	Undo2,
	X,
} from 'lucide-react';
import { history } from '@utils/history';
import { isUserTyping } from '@utils/shortcutsUtils';
import { currentTimeStore, durationStore } from '@components/AudioControls/state';
import { useStoryboard } from '../StoryboardContext';
import { addElements, elementsForPaste, newId, removeElements, replaceElements, updateFrame } from '../model';
import { fitWithin } from '../assets/images';
import { frameTimeLabel } from '../canvas/layout';
import { formatPreciseTime, parseTime } from '../time';
import type { BoardFormat, Frame, FrameElement, StoryboardSymbol } from '../types';
import { Artboard } from './Artboard';
import { FrameStrip } from './FrameStrip';
import { duplicateTime, framesByTime } from '../timeline';
import { Inspector } from './Inspector';
import { TextField } from './fields';
import { moveElement, type Pt } from './geometry';
import { ImagePickButton } from './ImagePick';
import { SymbolsPopover } from './SymbolsPopover';
import { useImageIntake } from './useImages';
import { TOOL_KEYS, type Tool } from './elements';

// Copied elements, shared between the frames of a project for as long as the page is open (another project has
// none of their symbols, images or frames)
let clipboard: { projectId: string | null; frameId: string; elements: FrameElement[] } | null = null;

const PASTE_OFFSET = 20;
const subscribeHistory = (listener: () => void) => history.subscribe(listener);
const historyFlags = () => (history.canUndo() ? 1 : 0) | (history.canRedo() ? 2 : 0);

const TOOLS: Array<{ tool: Tool; label: string; key: string; icon: React.ReactNode }> = [
	{ tool: 'select', label: 'Select', key: 'V', icon: <MousePointer2 className="w-5 h-5" /> },
	{ tool: 'rect', label: 'Rectangle', key: 'R', icon: <Square className="w-5 h-5" /> },
	{ tool: 'ellipse', label: 'Ellipse', key: 'O', icon: <Circle className="w-5 h-5" /> },
	{ tool: 'line', label: 'Line', key: 'L', icon: <Minus className="w-5 h-5 -rotate-45" /> },
	{ tool: 'arrow', label: 'Arrow', key: 'A', icon: <MoveUpRight className="w-5 h-5" /> },
	{ tool: 'text', label: 'Text', key: 'T', icon: <Type className="w-5 h-5" /> },
	{ tool: 'pen', label: 'Pen', key: 'P', icon: <Pen className="w-5 h-5" /> },
	{ tool: 'box', label: 'Box', key: 'B', icon: <SquareDashed className="w-5 h-5" /> },
	{ tool: 'frameRef', label: 'Frame reference', key: '', icon: <PictureInPicture2 className="w-5 h-5" /> },
];

const NOTICE_MS = 4000;

const dockButton = (active: boolean, disabled = false) =>
	`rounded-full p-3 shadow-md transition-colors duration-200 text-white ${
		disabled ? 'bg-neutral-700 opacity-50 cursor-not-allowed' : active ? 'bg-blue-600 hover:bg-blue-700 cursor-pointer' : 'bg-neutral-800 hover:bg-neutral-700 cursor-pointer'
	}`;
const pill = (on: boolean) =>
	`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs cursor-pointer border ${
		on ? 'bg-neutral-700 border-neutral-500 text-white' : 'bg-neutral-800/80 border-neutral-700 text-neutral-300 hover:bg-neutral-700'
	}`;
const iconButton = 'p-1.5 rounded-md text-neutral-400 hover:text-white hover:bg-neutral-800 cursor-pointer disabled:opacity-40 disabled:cursor-default';

/** Full-screen frame editor (SPEC §5); open while `editingFrameId` names an existing frame. */
export function FrameEditor() {
	const { editingFrameId, storyboard, closeFrameEditor } = useStoryboard();
	const frame = editingFrameId ? storyboard.frames.find((f) => f.id === editingFrameId) : undefined;
	// The frame went away (deleted or undone): close
	useEffect(() => {
		if (editingFrameId && !frame) closeFrameEditor();
	}, [editingFrameId, frame, closeFrameEditor]);
	if (!frame) return null;
	return <OpenFrameEditor frame={frame} board={storyboard.board} frames={storyboard.frames} />;
}

function OpenFrameEditor({ frame, board, frames }: { frame: Frame; board: BoardFormat; frames: Frame[] }) {
	const { commit, storyboardRef, closeFrameEditor, openFrameEditor, handleDuplicateFrame, placeCard, projectId } = useStoryboard();
	const [tool, setTool] = useState<Tool>('select');
	const [selection, setSelection] = useState<{ frameId: string; ids: string[] }>({ frameId: frame.id, ids: [] });
	const [showSafe, setShowSafe] = useState(false);
	const [showGrid, setShowGrid] = useState(false);
	// Onion skin: ghost the previous frame (and optionally the next) at 30 %
	const [onion, setOnion] = useState<'off' | 'prev' | 'both'>('off');
	const [showSymbols, setShowSymbols] = useState(false);
	// A short message, e.g. when an image can't be used
	const [notice, setNotice] = useState<string | null>(null);
	const noticeTimer = useRef<number | null>(null);
	const notify = useCallback((message: string) => {
		setNotice(message);
		if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
		noticeTimer.current = window.setTimeout(() => setNotice(null), NOTICE_MS);
	}, []);
	useEffect(() => () => {
		if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
	}, []);
	const intake = useImageIntake(notify);
	const [fitSignal, setFitSignal] = useState(0);

	// Selection belongs to this frame and only names elements that still exist (undo can remove them)
	const selectedIds = useMemo(
		() => (selection.frameId === frame.id ? selection.ids.filter((id) => frame.elements.some((el) => el.id === id)) : []),
		[selection, frame]
	);
	const setSelectedIds = useCallback((ids: string[]) => setSelection({ frameId: frame.id, ids }), [frame.id]);
	// The key handler reads the selection through a ref, so it isn't re-attached on every drag update
	const selectedRef = useRef(selectedIds);
	useLayoutEffect(() => {
		selectedRef.current = selectedIds;
	}, [selectedIds]);

	const ordered = useMemo(() => framesByTime(frames), [frames]);
	const index = ordered.findIndex((f) => f.id === frame.id);
	const prevFrame = ordered[index - 1];
	const nextFrame = ordered[index + 1];
	const onionFrames = useMemo(
		() => (onion === 'off' ? [] : [prevFrame, onion === 'both' ? nextFrame : undefined].filter((f): f is Frame => !!f)),
		[onion, prevFrame, nextFrame]
	);
	// A new frame reference shows the previous frame by time (or another frame when this is the first)
	const defaultRefFrameId = prevFrame?.id ?? ordered.find((f) => f.id !== frame.id)?.id ?? '';

	/** An image element from a file, fitted within half the board, centred at `at`. */
	const insertImage = useCallback(
		async (file: File, at?: Pt) => {
			const added = await intake(file);
			// The frame may have gone (undo, project change) while the image was read
			if (!added || !storyboardRef.current.frames.some((f) => f.id === frame.id)) return;
			const { width: w, height: h } = fitWithin(added.asset.width, added.asset.height, Math.min(board.width, board.height) * 0.5);
			const c = at ?? { x: board.width / 2, y: board.height / 2 };
			const el: FrameElement = { id: newId('e_'), type: 'image', x: c.x - w / 2, y: c.y - h / 2, w, h, rotation: 0, assetId: added.asset.id };
			commit(addElements(added.record(storyboardRef.current), frame.id, [el]), 'AddImage');
			setSelectedIds([el.id]);
		},
		[intake, board, commit, storyboardRef, frame.id, setSelectedIds]
	);

	/** A box instance of a symbol at the board's centre, sized from the symbol's image. */
	const placeSymbol = useCallback(
		(symbol: StoryboardSymbol) => {
			const doc = storyboardRef.current;
			const asset = symbol.assetId ? doc.assets.find((a) => a.id === symbol.assetId) : undefined;
			const side = Math.min(board.width, board.height) * 0.3;
			const { width: w, height: h } = asset ? fitWithin(asset.width, asset.height, side) : { width: side, height: side };
			const el: FrameElement = { id: newId('e_'), type: 'box', x: (board.width - w) / 2, y: (board.height - h) / 2, w, h, rotation: 0, symbolId: symbol.id };
			commit(addElements(doc, frame.id, [el]), 'PlaceSymbol');
			setSelectedIds([el.id]);
			setShowSymbols(false);
		},
		[board, commit, storyboardRef, frame.id, setSelectedIds]
	);

	// Copies keep element ids (the same objects continue); "new frame from this" opens the copy
	const copyFrame = useCallback(
		(open: boolean) => {
			const time = duplicateTime(frame, currentTimeStore.getSnapshot(), durationStore.getSnapshot());
			const id = handleDuplicateFrame(frame.id, { time, ...placeCard(time) }, durationStore.getSnapshot());
			if (open) openFrameEditor(id);
		},
		[frame, handleDuplicateFrame, placeCard, openFrameEditor]
	);

	const addCopies = useCallback(
		(els: FrameElement[], label: string) => {
			if (!els.length) return;
			commit(addElements(storyboardRef.current, frame.id, els), label);
			setSelectedIds(els.map((el) => el.id));
		},
		[commit, storyboardRef, frame.id, setSelectedIds]
	);

	// The editor owns the keyboard while open (canvas shortcuts are suspended; Space and Ctrl+Z still work)
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (isUserTyping()) return;
			const mod = e.ctrlKey || e.metaKey;
			const key = e.key.toLowerCase();
			const doc = storyboardRef.current;
			const current = doc.frames.find((f) => f.id === frame.id);
			if (!current) return;
			const selectedIds = selectedRef.current;
			const selected = current.elements.filter((el) => selectedIds.includes(el.id));

			if (e.key === 'Escape') {
				e.preventDefault();
				closeFrameEditor();
			} else if ((e.key === 'Delete' || e.key === 'Backspace') && !mod) {
				if (!selected.length) return;
				e.preventDefault();
				commit(removeElements(doc, frame.id, new Set(selectedIds)), 'DeleteElements');
			} else if (mod && key === 'd') {
				e.preventDefault();
				const ids = new Set(current.elements.map((el) => el.id));
				addCopies(elementsForPaste(selected, ids, true).map((el) => moveElement(el, PASTE_OFFSET, PASTE_OFFSET)), 'DuplicateElements');
			} else if (mod && key === 'c') {
				if (!selected.length) return;
				e.preventDefault();
				clipboard = { projectId, frameId: frame.id, elements: selected };
			} else if (mod && key === 'v') {
				if (!clipboard || clipboard.projectId !== projectId) return;
				e.preventDefault();
				const same = clipboard.frameId === frame.id;
				const ids = new Set(current.elements.map((el) => el.id));
				const pasted = elementsForPaste(clipboard.elements, ids, same);
				addCopies(same ? pasted.map((el) => moveElement(el, PASTE_OFFSET, PASTE_OFFSET)) : pasted, 'PasteElements');
			} else if (mod && key === 'a') {
				e.preventDefault();
				setSelectedIds(current.elements.map((el) => el.id));
			} else if (e.key.startsWith('Arrow') && !mod) {
				if (!selected.length) return;
				e.preventDefault();
				const step = e.shiftKey ? 10 : 1;
				const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
				const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
				commit(replaceElements(doc, frame.id, new Map(selected.map((el) => [el.id, moveElement(el, dx, dy)]))), 'Nudge');
			} else if (!mod && !e.altKey && TOOL_KEYS[key]) {
				e.preventDefault();
				setTool(TOOL_KEYS[key]);
			}
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, [frame.id, commit, storyboardRef, closeFrameEditor, addCopies, setSelectedIds, projectId]);

	const undoFlags = useSyncExternalStore(subscribeHistory, historyFlags);

	return (
		<div
			data-frame-editor="true"
			data-prevent-erase
			role="dialog"
			aria-label="Frame editor"
			// A file dropped beside the board must not open in the tab (the board itself takes images)
			onDragOver={(e) => {
				if (e.dataTransfer.types.includes('Files')) e.preventDefault();
			}}
			onDrop={(e) => {
				if (e.dataTransfer.types.includes('Files')) e.preventDefault();
			}}
			className="fixed inset-0 z-[60] flex flex-col bg-neutral-900 text-neutral-200 select-none animate-fade-in"
		>
			<EditorHeader
				frame={frame}
				position={`${index + 1}/${ordered.length}`}
				onPrev={index > 0 ? () => openFrameEditor(ordered[index - 1].id) : undefined}
				onNext={index < ordered.length - 1 ? () => openFrameEditor(ordered[index + 1].id) : undefined}
				onClose={closeFrameEditor}
			/>
			<div className="flex-1 flex min-h-0 max-md:flex-col">
				{/* On phones the inspector is a sheet over the bottom 45 %: the board, tools and strip stay above it */}
				<div className="flex-1 flex flex-col min-w-0 min-h-0 max-md:pb-[45vh]">
					<div className="flex-1 relative min-w-0 min-h-0">
						<Artboard
							onion={onionFrames}
							defaultRefFrameId={defaultRefFrameId}
							onDropImage={(file, at) => void insertImage(file, at)}
							frame={frame}
							board={board}
							tool={tool}
							setTool={setTool}
							selectedIds={selectedIds}
							setSelectedIds={setSelectedIds}
							showSafe={showSafe}
							showGrid={showGrid}
							fitSignal={fitSignal}
						/>
						<nav
							aria-label="Tools"
							className="absolute top-3 left-3 z-10 flex flex-col space-y-2 bg-neutral-800 border-2 border-neutral-600/20 p-1 rounded-full shadow-lg max-h-[calc(100%-4rem)] overflow-y-auto"
						>
							{TOOLS.map((t) => (
								<button
									key={t.tool}
									type="button"
									onClick={() => setTool(t.tool)}
									className={dockButton(tool === t.tool)}
									title={t.key ? `${t.label} (${t.key})` : t.label}
									aria-label={t.label}
									aria-pressed={tool === t.tool}
								>
									{t.icon}
								</button>
							))}
							<ImagePickButton className={dockButton(false)} title="Image" onFile={(file) => void insertImage(file)}>
								<ImageIcon className="w-5 h-5" />
							</ImagePickButton>
							<button
								type="button"
								onClick={() => setShowSymbols((v) => !v)}
								className={dockButton(showSymbols)}
								title="Symbols"
								aria-label="Symbols"
								aria-pressed={showSymbols}
							>
								<Shapes className="w-5 h-5" />
							</button>
							<div className="border-t-2 border-neutral-600/20 rounded-full" />
							<button type="button" onClick={() => history.undo()} disabled={!(undoFlags & 1)} className={dockButton(false, !(undoFlags & 1))} title="Undo (Ctrl/Cmd+Z)">
								<Undo2 className="w-5 h-5" />
							</button>
							<button type="button" onClick={() => history.redo()} disabled={!(undoFlags & 2)} className={dockButton(false, !(undoFlags & 2))} title="Redo (Ctrl/Cmd+Shift+Z)">
								<Redo2 className="w-5 h-5" />
							</button>
						</nav>
					{showSymbols ? <SymbolsPopover onPlace={placeSymbol} notify={notify} /> : null}
					{notice ? (
						<div role="alert" className="absolute top-3 left-1/2 -translate-x-1/2 z-30 rounded-lg bg-red-900/90 px-3 py-1.5 text-sm text-red-100 shadow-lg">
							{notice}
						</div>
					) : null}
						<div className="absolute bottom-3 left-20 z-10 flex flex-wrap items-center gap-2 text-xs text-neutral-400">
							<span className="rounded-full bg-neutral-800/80 px-2.5 py-1 border border-neutral-700">
								{board.width}×{board.height}
							</span>
							<button type="button" className={pill(showSafe)} aria-pressed={showSafe} onClick={() => setShowSafe((v) => !v)} title="Safe-area guides">
								<Scan className="w-3.5 h-3.5" /> safe
							</button>
							<button type="button" className={pill(showGrid)} aria-pressed={showGrid} onClick={() => setShowGrid((v) => !v)} title="Grid snap">
								<Grid3x3 className="w-3.5 h-3.5" /> grid
							</button>
							<button type="button" className={pill(false)} onClick={() => setFitSignal((n) => n + 1)} title="Fit to view">
								<Maximize className="w-3.5 h-3.5" /> fit
							</button>
							<button
								type="button"
								className={`${pill(onion !== 'off')} disabled:opacity-40 disabled:cursor-default`}
								aria-pressed={onion !== 'off'}
								disabled={!prevFrame && !nextFrame}
								onClick={() => setOnion((o) => (o === 'off' ? 'prev' : 'off'))}
								title="Onion skin: show the previous frame"
							>
								<CircleDashed className="w-3.5 h-3.5" /> onion
							</button>
							{onion !== 'off' ? (
								<button
									type="button"
									className={pill(onion === 'both')}
									aria-pressed={onion === 'both'}
									onClick={() => setOnion((o) => (o === 'both' ? 'prev' : 'both'))}
									title="Onion skin: also show the next frame"
								>
									+ next
								</button>
							) : null}
						</div>
					</div>
					<FrameStrip frame={frame} ordered={ordered} board={board} onOpen={openFrameEditor} onNewFromThis={() => copyFrame(true)} onDuplicate={() => copyFrame(false)} />
				</div>
				<Inspector frame={frame} board={board} selectedIds={selectedIds} notify={notify} ordered={ordered} />
			</div>
		</div>
	);
}

function TimeField({ label, value, onCommit, name }: { label: string; value: number | undefined; onCommit: (t: number | undefined) => boolean; name: string }) {
	return (
		<div className="w-44">
			<TextField
				label={label}
				name={name}
				value={value === undefined ? '' : formatPreciseTime(value)}
				placeholder="m:ss.mmm"
				onCommit={(v) => {
					if (v.trim() === '') return onCommit(undefined);
					const t = parseTime(v);
					return t === null ? false : onCommit(t);
				}}
			/>
		</div>
	);
}

function EditorHeader({ frame, position, onPrev, onNext, onClose }: { frame: Frame; position: string; onPrev?: () => void; onNext?: () => void; onClose: () => void }) {
	const { commit, storyboardRef } = useStoryboard();
	const update = (patch: Parameters<typeof updateFrame>[2], label: string) => commit(updateFrame(storyboardRef.current, frame.id, patch), label);
	const duration = () => durationStore.getSnapshot() || Infinity;

	const setStart = (t: number | undefined) => {
		if (t === undefined) return false;
		const time = Math.max(0, Math.min(duration(), t));
		// A span that would end before its new start is cleared
		update(frame.endTime !== undefined && frame.endTime <= time ? { time, endTime: undefined } : { time }, 'SetFrameStart');
		return true;
	};
	const setEnd = (t: number | undefined) => {
		if (t === undefined) {
			update({ endTime: undefined }, 'ClearFrameEnd');
			return true;
		}
		const end = Math.min(duration(), t);
		if (end <= frame.time) return false;
		update({ endTime: end }, 'SetFrameEnd');
		return true;
	};

	return (
		<header className="h-14 shrink-0 flex items-center gap-3 px-3 border-b border-neutral-800 bg-neutral-900">
			<button
				type="button"
				onClick={onClose}
				className="shrink-0 flex items-center gap-1 rounded-md px-2 py-1 text-sm text-neutral-300 hover:bg-neutral-800 cursor-pointer"
				title="Back to canvas (Esc)"
				aria-label="Back to canvas"
			>
				<ChevronLeft className="w-4 h-4" /> <span className="max-md:hidden">back</span>
			</button>
			<div className="w-56 max-md:w-auto max-md:flex-1 min-w-0">
				<TextField label="title" name="frame-title" value={frame.title} placeholder="Untitled frame" onCommit={(v) => update({ title: v }, 'FrameTitle')} />
			</div>
			<div className="flex items-center gap-1 max-md:hidden">
				<TimeField label="start" name="frame-start" value={frame.time} onCommit={setStart} />
				<button type="button" className={iconButton} title="Set start to playhead" aria-label="Set start to playhead" onClick={() => setStart(currentTimeStore.getSnapshot())}>
					<Crosshair className="w-4 h-4" />
				</button>
			</div>
			<div className="flex items-center gap-1 max-md:hidden">
				<TimeField label="end" name="frame-end" value={frame.endTime} onCommit={setEnd} />
				<button type="button" className={iconButton} title="Set end to playhead" aria-label="Set end to playhead" onClick={() => setEnd(currentTimeStore.getSnapshot())}>
					<Crosshair className="w-4 h-4" />
				</button>
				<button type="button" className={iconButton} title="Clear end" aria-label="Clear end" disabled={frame.endTime === undefined} onClick={() => setEnd(undefined)}>
					<X className="w-4 h-4" />
				</button>
			</div>
			<span className="md:hidden shrink-0 text-xs text-neutral-400">{frameTimeLabel(frame)}</span>
			<div className="ml-auto shrink-0 flex items-center gap-1 text-sm text-neutral-400 whitespace-nowrap">
				<button type="button" className={iconButton} onClick={onPrev} disabled={!onPrev} title="Previous frame" aria-label="Previous frame">
					<ChevronLeft className="w-4 h-4" />
				</button>
				<span className="tabular-nums">frame {position}</span>
				<button type="button" className={iconButton} onClick={onNext} disabled={!onNext} title="Next frame" aria-label="Next frame">
					<ChevronRight className="w-4 h-4" />
				</button>
			</div>
			<button type="button" onClick={onClose} className={iconButton} title="Close (Esc)" aria-label="Close frame editor">
				<X className="w-5 h-5" />
			</button>
		</header>
	);
}
