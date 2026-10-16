import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
	ChevronDown,
	ChevronLeft,
	ChevronRight,
	Circle,
	CircleDashed,
	Crosshair,
	Grid3x3,
	Image as ImageIcon,
	Minus,
	MousePointer2,
	MoveUpRight,
	Pen,
	PictureInPicture2,
	Redo2,
	Expand,
	SquareSquare,
	Shapes,
	Square,
	SquareDashed,
	Type,
	Undo2,
	X,
} from 'lucide-react';
import { history } from '@utils/history';
import { isUserTyping } from '@utils/shortcutsUtils';
import { currentTimeStore, durationStore, isPlayingStore } from '@components/AudioControls/state';
import { useAudioActions } from '@contexts/objects/AudioContextObject';
import { useStoryboard, useStoryboardDoc } from '../StoryboardContext';
import { addElements, elementsForPaste, newId, removeElements, replaceElements, updateFrame } from '../model';
import { fitWithin } from '../assets/images';
import { frameTimeLabel } from '../canvas/layout';
import { formatPreciseTime, parseTime } from '../time';
import type { BoardFormat, Frame, FrameElement, StoryboardSymbol } from '../types';

type Onion = 'off' | 'prev' | 'both';
import { Artboard } from './Artboard';
import { FrameStrip } from './FrameStrip';
import { activeFrameAt, duplicateTime, framesByTime } from '../timeline';
import { PlaybackPreview } from './PlaybackPreview';
import { Inspector } from './Inspector';
import { BoardPopover } from './BoardPopover';
import { TextField } from './fields';
import { moveElement, type Pt } from './geometry';
import { ImagePickButton } from './ImagePick';
import { SymbolsPopover } from './SymbolsPopover';
import { useImageIntake } from './useImages';
import { useDismiss, useDockFit } from '@/hooks/useDockFit';
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

/** Padding per dock size (see DOCK_SIZES) around a 20 px icon. */
const DOCK_PADDING = ['p-3', 'p-2', 'p-1.5'];
const dockButton = (active: boolean, disabled = false, size = 0) =>
	`rounded-full ${DOCK_PADDING[size] ?? 'p-3'} shadow-md transition-colors duration-200 text-white ${
		disabled ? 'bg-neutral-700 opacity-50 cursor-not-allowed' : active ? 'bg-blue-600 hover:bg-blue-700 cursor-pointer' : 'bg-neutral-800 hover:bg-neutral-700 cursor-pointer'
	}`;
// Like the canvas page's playback buttons: no borders; on = filled
const pill = (on: boolean) =>
	`inline-flex items-center gap-1 rounded-lg px-2 py-1 compact:py-1.5 text-xs cursor-pointer ${
		on ? 'bg-neutral-700 text-white' : 'text-neutral-400 hover:text-white hover:bg-neutral-800'
	}`;
const iconButton = 'p-1.5 rounded-md text-neutral-400 hover:text-white hover:bg-neutral-800 cursor-pointer disabled:opacity-40 disabled:cursor-default';

/** Full-screen frame editor (SPEC §5); open while `editingFrameId` names an existing frame. */
export function FrameEditor() {
	const { editingFrameId, closeFrameEditor } = useStoryboard();
	const storyboard = useStoryboardDoc();
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
	const [onion, setOnion] = useState<Onion>('off');
	const [showSymbols, setShowSymbols] = useState(false);
	const [showBoard, setShowBoard] = useState(false);
	// Phones: the properties sheet starts closed so the board gets the screen
	const [sheetOpen, setSheetOpen] = useState(false);
	const sheet = useMemo(() => ({ open: sheetOpen, onToggle: () => setSheetOpen((v) => !v) }), [sheetOpen]);
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
	const fit = useCallback(() => setFitSignal((n) => n + 1), []);
	const toggleSymbols = useCallback(() => setShowSymbols((v) => !v), []);
	const pickImage = useCallback((file: File) => void insertImageRef.current(file), []);
	const dropImage = useCallback((file: File, at: Pt) => void insertImageRef.current(file, at), []);

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

	const insertImageRef = useRef(insertImage);
	useLayoutEffect(() => {
		insertImageRef.current = insertImage;
	}, [insertImage]);

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
	// Preview: plays from this frame and shows, over the board, each frame as the song reaches it. When playback
	// stops (Space, a press on the preview, the song's end), the editor opens the frame it stopped on.
	const { seekToTime, playPause } = useAudioActions();
	const [previewing, setPreviewing] = useState(false);
	const startPreview = useCallback(() => {
		// Nothing to play (the song isn't on this device yet)
		if (durationStore.getSnapshot() <= 0) return;
		seekToTime(frame.time);
		if (!isPlayingStore.getSnapshot()) playPause();
		setPreviewing(true);
	}, [seekToTime, playPause, frame.time]);
	const stopPreview = useCallback(() => {
		if (isPlayingStore.getSnapshot()) playPause();
		setPreviewing(false);
		const at = activeFrameAt(framesByTime(storyboardRef.current.frames), currentTimeStore.getSnapshot());
		if (at && at.id !== frame.id) openFrameEditor(at.id);
	}, [playPause, storyboardRef, frame.id, openFrameEditor]);
	useEffect(() => {
		if (!previewing) return;
		let started = isPlayingStore.getSnapshot();
		return isPlayingStore.subscribe(() => {
			if (isPlayingStore.getSnapshot()) started = true;
			else if (started) stopPreview();
		});
	}, [previewing, stopPreview]);

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
				// The topmost layer first: the preview, then an open popover, then the editor
				if (previewing) stopPreview();
				else if (showBoard) setShowBoard(false);
				else if (showSymbols) setShowSymbols(false);
				else closeFrameEditor();
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
	}, [frame.id, commit, storyboardRef, closeFrameEditor, addCopies, setSelectedIds, projectId, previewing, stopPreview, showBoard, showSymbols]);

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
				key={frame.id}
				frameId={frame.id}
				title={frame.title}
				time={frame.time}
				endTime={frame.endTime}
				position={`${index + 1}/${ordered.length}`}
				prevId={prevFrame?.id}
				nextId={nextFrame?.id}
			/>
			<div className="flex-1 flex min-h-0 max-md:flex-col">
				{/* On phones the inspector is a sheet along the bottom: closed, only its header row takes room; opened, it
				    covers the lower part of the board until it's closed again */}
				<div className="flex-1 flex flex-col min-w-0 min-h-0 max-md:pb-14">
					<div className="flex-1 relative min-w-0 min-h-0">
						<Artboard
							onion={onionFrames}
							defaultRefFrameId={defaultRefFrameId}
							onDropImage={dropImage}
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
						{previewing ? <PlaybackPreview ordered={ordered} board={board} onStop={stopPreview} /> : null}
						<ToolDock tool={tool} setTool={setTool} showSymbols={showSymbols} onToggleSymbols={toggleSymbols} onImage={pickImage} />
						{showSymbols ? <SymbolsPopover onPlace={placeSymbol} notify={notify} /> : null}
						{showBoard ? <BoardPopover board={board} /> : null}
						{notice ? (
							<div role="alert" className="absolute top-3 left-1/2 -translate-x-1/2 z-30 rounded-lg bg-red-900/90 px-3 py-1.5 text-sm text-red-100 shadow-lg">
								{notice}
							</div>
						) : null}
						<ViewToggles
							board={board}
							showBoard={showBoard}
							setShowBoard={setShowBoard}
							showSafe={showSafe}
							setShowSafe={setShowSafe}
							showGrid={showGrid}
							setShowGrid={setShowGrid}
							onion={onion}
							setOnion={setOnion}
							canOnion={!!prevFrame || !!nextFrame}
							onFit={fit}
						/>
					</div>
					<FrameStrip frame={frame} ordered={ordered} board={board} onOpen={openFrameEditor} onPreview={startPreview} onNewFromThis={() => copyFrame(true)} onDuplicate={() => copyFrame(false)} />
				</div>
				<Inspector frame={frame} selectedIds={selectedIds} notify={notify} ordered={ordered} sheet={sheet} />
			</div>
		</div>
	);
}

// Same place and spacing as the canvas page's dock, so the tools don't jump when the editor opens: 1/12 of the
// viewport from the top (the area starts under the 3rem header), 24 px from the left
const DOCK_TOP = 'max(0px, calc(100dvh / 12 - 3rem))';

/** Button sizes the dock can use, largest first (DOCK_PADDING around a 20 px icon). */
const DOCK_SIZES = [44, 36, 32];

/**
 * The tool dock; its own component so a drag on the board doesn't re-render it. It keeps every button on screen:
 * full size when it fits, smaller buttons when not, and otherwise (and on phones) the current tool, which opens
 * all tools, plus undo and redo.
 */
const ToolDock = memo(function ToolDock({
	tool,
	setTool,
	showSymbols,
	onToggleSymbols,
	onImage,
}: {
	tool: Tool;
	setTool: (t: Tool) => void;
	showSymbols: boolean;
	onToggleSymbols: () => void;
	onImage: (file: File) => void;
}) {
	const undoFlags = useSyncExternalStore(subscribeHistory, historyFlags);
	const navRef = useRef<HTMLElement>(null);
	const level = useDockFit(navRef, DOCK_SIZES, () => navRef.current?.parentElement?.getBoundingClientRect().bottom ?? window.innerHeight);
	const collapsed = level === DOCK_SIZES.length;
	const [menuOpen, setMenuOpen] = useState(false);
	const closeMenu = useCallback(() => setMenuOpen(false), []);
	useDismiss(navRef, menuOpen, closeMenu);
	const current = TOOLS.find((t) => t.tool === tool) ?? TOOLS[0];

	const tools = (inMenu: boolean) => (
		<>
			{TOOLS.map((t) => (
				<button
					key={t.tool}
					type="button"
					onClick={() => {
						setTool(t.tool);
						if (inMenu) closeMenu();
					}}
					className={dockButton(tool === t.tool, false, level)}
					title={t.key ? `${t.label} (${t.key})` : t.label}
					aria-label={t.label}
					aria-pressed={tool === t.tool}
				>
					{t.icon}
				</button>
			))}
			<ImagePickButton
				className={dockButton(false, false, level)}
				title="Image"
				onFile={(file) => {
					if (inMenu) closeMenu();
					onImage(file);
				}}
			>
				<ImageIcon className="w-5 h-5" />
			</ImagePickButton>
			<button
				type="button"
				onClick={() => {
					if (inMenu) closeMenu();
					onToggleSymbols();
				}}
				className={dockButton(showSymbols, false, level)}
				title="Symbols"
				aria-label="Symbols"
				aria-pressed={showSymbols}
			>
				<Shapes className="w-5 h-5" />
			</button>
		</>
	);

	return (
		<nav
			ref={navRef}
			aria-label="Tools"
			className={`absolute left-6 z-20 flex flex-col space-y-2 bg-neutral-800 border-2 border-neutral-600/20 p-1 rounded-full shadow-lg ${collapsed ? '' : 'overflow-y-auto'}`}
			style={{ top: DOCK_TOP, maxHeight: collapsed ? undefined : `calc(100% - ${DOCK_TOP} - 0.75rem)` }}
			data-level={collapsed ? 'collapsed' : ['full', 'dense', 'small'][level]}
		>
			{collapsed ? (
				<>
					<button
						type="button"
						onClick={() => setMenuOpen((v) => !v)}
						className={`relative ${dockButton(true)}`}
						title={`${current.label}: all tools`}
						aria-label={`Tools: ${current.label}`}
						aria-haspopup="menu"
						aria-expanded={menuOpen}
					>
						{current.icon}
						<ChevronDown className={`absolute bottom-0.5 left-1/2 -translate-x-1/2 w-3 h-3 transition-transform ${menuOpen ? 'rotate-180' : ''}`} />
					</button>
					{menuOpen ? (
						<div
							role="menu"
							aria-label="All tools"
							className="absolute left-full top-0 ml-3 grid w-max grid-cols-4 gap-2 rounded-3xl border-2 border-neutral-600/20 bg-neutral-800 p-2 shadow-lg"
						>
							{tools(true)}
						</div>
					) : null}
				</>
			) : (
				tools(false)
			)}
			<div className="border-t-2 border-neutral-600/20 rounded-full" />
			<button
				type="button"
				onClick={() => history.undo()}
				disabled={!(undoFlags & 1)}
				className={dockButton(false, !(undoFlags & 1), level)}
				title="Undo (Ctrl/Cmd+Z)"
				aria-label="Undo"
			>
				<Undo2 className="w-5 h-5" />
			</button>
			<button
				type="button"
				onClick={() => history.redo()}
				disabled={!(undoFlags & 2)}
				className={dockButton(false, !(undoFlags & 2), level)}
				title="Redo (Ctrl/Cmd+Shift+Z)"
				aria-label="Redo"
			>
				<Redo2 className="w-5 h-5" />
			</button>
		</nav>
	);
});

type Toggle = React.Dispatch<React.SetStateAction<boolean>>;

/** Board size (opens the board format), guides, grid, fit and onion skin, under the board. */
const ViewToggles = memo(function ViewToggles(props: {
	board: BoardFormat;
	showBoard: boolean;
	setShowBoard: Toggle;
	showSafe: boolean;
	setShowSafe: Toggle;
	showGrid: boolean;
	setShowGrid: Toggle;
	onion: Onion;
	setOnion: React.Dispatch<React.SetStateAction<Onion>>;
	canOnion: boolean;
	onFit: () => void;
}) {
	const { board, showBoard, setShowBoard, showSafe, setShowSafe, showGrid, setShowGrid, onion, setOnion, canOnion, onFit } = props;
	return (
		<div className="absolute bottom-3 left-24 compact:left-3 z-10 flex flex-wrap items-center gap-2 compact:gap-1.5 text-xs text-neutral-400">
			<button
				type="button"
				className={`${pill(showBoard)} tabular-nums`}
				aria-pressed={showBoard}
				aria-label="Board format"
				onClick={() => setShowBoard((v) => !v)}
				title="Board format (all frames)"
			>
				{board.width}×{board.height}
			</button>
			<button type="button" className={pill(showSafe)} aria-pressed={showSafe} onClick={() => setShowSafe((v) => !v)} title="Safe-area guides" aria-label="safe">
				<SquareSquare className="w-3.5 h-3.5" />
				<span className="compact:hidden">safe</span>
			</button>
			<button type="button" className={pill(showGrid)} aria-pressed={showGrid} onClick={() => setShowGrid((v) => !v)} title="Grid snap" aria-label="grid">
				<Grid3x3 className="w-3.5 h-3.5" />
				<span className="compact:hidden">grid</span>
			</button>
			<button type="button" className={pill(false)} onClick={onFit} title="Fit to view" aria-label="fit">
				<Expand className="w-3.5 h-3.5" />
				<span className="compact:hidden">fit</span>
			</button>
			<button
				type="button"
				className={`${pill(onion !== 'off')} disabled:opacity-40 disabled:cursor-default`}
				aria-pressed={onion !== 'off'}
				disabled={!canOnion}
				onClick={() => setOnion((o) => (o === 'off' ? 'prev' : 'off'))}
				title="Onion skin: show the previous frame"
				aria-label="onion"
			>
				<CircleDashed className="w-3.5 h-3.5" />
				<span className="compact:hidden">onion</span>
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
	);
});

function TimeField({ label, value, onCommit, name }: { label: string; value: number | undefined; onCommit: (t: number | undefined) => boolean; name: string }) {
	return (
		<div className="w-32">
			<TextField
				label={label}
				name={name}
				prefix={<span className="text-xs">{label}</span>}
				value={value === undefined ? '' : formatPreciseTime(value)}
				placeholder="–"
				className="tabular-nums"
				onCommit={(v) => {
					if (v.trim() === '') return onCommit(undefined);
					const t = parseTime(v);
					return t === null ? false : onCommit(t);
				}}
			/>
		</div>
	);
}

type HeaderProps = { frameId: string; title: string; time: number; endTime: number | undefined; position: string; prevId?: string; nextId?: string };

/** Title, start/end and frame navigation. Takes the frame's fields, not the frame, so a drag doesn't re-render it. */
const EditorHeader = memo(function EditorHeader({ frameId, title, time, endTime, position, prevId, nextId }: HeaderProps) {
	const { commit, storyboardRef, openFrameEditor, closeFrameEditor } = useStoryboard();
	const update = (patch: Parameters<typeof updateFrame>[2], label: string) => commit(updateFrame(storyboardRef.current, frameId, patch), label);
	const duration = () => durationStore.getSnapshot() || Infinity;

	const setStart = (t: number | undefined) => {
		if (t === undefined) return false;
		const t2 = Math.max(0, Math.min(duration(), t));
		// A span that would end before its new start is cleared
		update(endTime !== undefined && endTime <= t2 ? { time: t2, endTime: undefined } : { time: t2 }, 'SetFrameStart');
		return true;
	};
	const setEnd = (t: number | undefined) => {
		if (t === undefined) {
			update({ endTime: undefined }, 'ClearFrameEnd');
			return true;
		}
		const end = Math.min(duration(), t);
		if (end <= time) return false;
		update({ endTime: end }, 'SetFrameEnd');
		return true;
	};

	return (
		<header className="h-12 shrink-0 flex items-center gap-2 px-3 border-b border-neutral-800 bg-neutral-900">
			<div className="w-60 max-md:w-auto max-md:flex-1 min-w-0">
				<TextField label="Frame title" name="frame-title" value={title} placeholder="Untitled frame" className="font-medium" onCommit={(v) => update({ title: v }, 'FrameTitle')} />
			</div>
			<div className="h-5 w-px bg-neutral-800 max-md:hidden" />
			<div className="flex items-center max-md:hidden">
				<TimeField label="start" name="frame-start" value={time} onCommit={setStart} />
				<button type="button" className={iconButton} title="Set start to playhead" aria-label="Set start to playhead" onClick={() => setStart(currentTimeStore.getSnapshot())}>
					<Crosshair className="w-4 h-4" />
				</button>
			</div>
			<div className="flex items-center max-md:hidden">
				<TimeField label="end" name="frame-end" value={endTime} onCommit={setEnd} />
				<button type="button" className={iconButton} title="Set end to playhead" aria-label="Set end to playhead" onClick={() => setEnd(currentTimeStore.getSnapshot())}>
					<Crosshair className="w-4 h-4" />
				</button>
				<button type="button" className={iconButton} title="Clear end" aria-label="Clear end" disabled={endTime === undefined} onClick={() => setEnd(undefined)}>
					<X className="w-4 h-4" />
				</button>
			</div>
			<span className="md:hidden shrink-0 text-xs text-neutral-400">{frameTimeLabel({ time, endTime })}</span>
			<div className="ml-auto shrink-0 flex items-center gap-1 text-sm text-neutral-400 whitespace-nowrap">
				<button type="button" className={iconButton} onClick={prevId ? () => openFrameEditor(prevId) : undefined} disabled={!prevId} title="Previous frame" aria-label="Previous frame">
					<ChevronLeft className="w-4 h-4" />
				</button>
				<span className="tabular-nums">frame {position}</span>
				<button type="button" className={iconButton} onClick={nextId ? () => openFrameEditor(nextId) : undefined} disabled={!nextId} title="Next frame" aria-label="Next frame">
					<ChevronRight className="w-4 h-4" />
				</button>
			</div>
			<button type="button" onClick={closeFrameEditor} className={iconButton} title="Close (Esc)" aria-label="Close frame editor">
				<X className="w-5 h-5" />
			</button>
		</header>
	);
});
