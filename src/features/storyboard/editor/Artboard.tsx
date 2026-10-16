import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useStoryboard } from '../StoryboardContext';
import { addElements, newId, patchElements, removeElements, replaceElements } from '../model';
import { simplifyPenPoints } from '../storage';
import { FrameSvg } from '../render/FrameSvg';
import { useFrameRender } from '../render/useFrameRender';
import type { BoardFormat, Frame, FrameElement, Point } from '../types';
import {
	applyBox,
	applyRotation,
	boxBounds,
	boxCenter,
	elementBox,
	elementsInRect,
	handlePositions,
	hitTestElements,
	moveElement,
	resizeBox,
	rotatePoint,
	rotationToward,
	snap,
	type Box,
	type Handle,
	type Pt,
} from './geometry';
import { penStroke, shapeFromDrag, textAt, textPatch, type ShapeTool, type Tool } from './elements';

type View = { scale: number; x: number; y: number };
type TextElement = Extract<FrameElement, { type: 'text' }>;
type TextEdit = { el: TextElement; isNew: boolean; value: string };

type Gesture =
	| { kind: 'pan'; client: Pt; view: View }
	| { kind: 'pinch'; dist: number; mid: Pt; view: View }
	| { kind: 'move'; start: Pt; client: Pt; moved: boolean; originals: FrameElement[] }
	| { kind: 'endpoint'; index: number; el: Extract<FrameElement, { points: Point[] }>; client: Pt; moved: boolean }
	| { kind: 'resize'; handle: Exclude<Handle, 'rotate'>; start: Pt; el: FrameElement; box: Box; client: Pt; moved: boolean }
	| { kind: 'rotate'; el: FrameElement; box: Box; client: Pt; moved: boolean }
	| { kind: 'marquee'; start: Pt; base: string[] }
	| { kind: 'shape'; tool: ShapeTool; start: Pt; client: Pt; id: string }
	| { kind: 'pen'; points: Point[] }
	| { kind: 'text'; start: Pt; client: Pt };

const FIT_PADDING = 32;
/** Room on the left for the tool dock (phones: its collapsed form floats over the board instead). */
const FIT_PADDING_LEFT = 104;
const NARROW_PX = 768;
const HANDLE_PX = 8;
const HANDLE_HIT_PX = 12;
const ROTATE_OFFSET_PX = 28;
const HIT_TOLERANCE_PX = 6;
const DRAG_THRESHOLD_PX = 3;
const DOUBLE_TAP_MS = 300;

type Props = {
	frame: Frame;
	board: BoardFormat;
	tool: Tool;
	setTool: (t: Tool) => void;
	selectedIds: string[];
	setSelectedIds: (ids: string[]) => void;
	showSafe: boolean;
	showGrid: boolean;
	/** Increments to fit the board to the viewport again. */
	fitSignal: number;
	/** Neighbouring frames ghosted under this one (onion skin), not interactive. */
	onion: Frame[];
	/** The frame a new frame reference shows (the previous one by time). */
	defaultRefFrameId: string;
	/** An image file dropped onto the artboard, with the board point it was dropped at. */
	onDropImage: (file: File, at: Pt) => void;
};

/** The frame's artboard: SVG at board resolution, fitted to the viewport; all drawing and transform gestures. */
export function Artboard({ frame, board, tool, setTool, selectedIds, setSelectedIds, showSafe, showGrid, fitSignal, onion, defaultRefFrameId, onDropImage }: Props) {
	const { commit, storyboardRef, beginLiveEdit, liveUpdate, endLiveEdit, cancelLiveEdit, abortLiveEdit } = useStoryboard();
	const lookups = useFrameRender();
	const containerRef = useRef<HTMLDivElement>(null);
	const [size, setSize] = useState({ w: 0, h: 0 });
	const [view, setView] = useState<View>({ scale: 0.1, x: 0, y: 0 });
	const viewRef = useRef(view);
	useLayoutEffect(() => {
		viewRef.current = view;
	}, [view]);
	const userViewRef = useRef(false);

	const [draft, setDraft] = useState<FrameElement | null>(null);
	const [marquee, setMarquee] = useState<{ a: Pt; b: Pt } | null>(null);
	const [textEdit, setTextEditState] = useState<TextEdit | null>(null);
	// The element whose text edit is open. An edit commits once: a press on the board both blurs the editor (which
	// commits) and finishes the edit, and a second commit would add a new text twice under the same id.
	const openEditRef = useRef<string | null>(null);
	const setTextEdit = useCallback((edit: TextEdit | null) => {
		openEditRef.current = edit ? edit.el.id : null;
		setTextEditState(edit);
	}, []);
	const gestureRef = useRef<Gesture | null>(null);
	const pointersRef = useRef(new Map<number, Pt>());
	const lastTapRef = useRef<{ id: string; t: number; client: Pt } | null>(null);

	useEffect(() => () => abortLiveEdit(), [abortLiveEdit]);

	const gridStep = board.width / 48;
	const snapPt = useCallback((p: Pt) => (showGrid ? { x: snap(p.x, gridStep), y: snap(p.y, gridStep) } : p), [showGrid, gridStep]);

	// Track the viewport size and fit the board until the user zooms or pans
	useLayoutEffect(() => {
		const el = containerRef.current;
		if (!el) return;
		const update = () => setSize({ w: el.clientWidth, h: el.clientHeight });
		update();
		const ro = new ResizeObserver(update);
		ro.observe(el);
		return () => ro.disconnect();
	}, []);
	useEffect(() => {
		userViewRef.current = false;
	}, [fitSignal, board.width, board.height]);
	useEffect(() => {
		if (userViewRef.current || size.w === 0 || size.h === 0) return;
		const padLeft = size.w < NARROW_PX ? FIT_PADDING : FIT_PADDING_LEFT;
		const availW = size.w - padLeft - FIT_PADDING;
		const scale = Math.max(0.01, Math.min(availW / board.width, (size.h - FIT_PADDING * 2) / board.height));
		setView({ scale, x: padLeft + (availW - board.width * scale) / 2, y: (size.h - board.height * scale) / 2 });
	}, [size, board.width, board.height, fitSignal]);

	const toFrame = useCallback((client: Pt): Pt => {
		const r = containerRef.current!.getBoundingClientRect();
		const v = viewRef.current;
		return { x: (client.x - r.left - v.x) / v.scale, y: (client.y - r.top - v.y) / v.scale };
	}, []);
	const toScreen = (p: Pt): Pt => ({ x: view.x + p.x * view.scale, y: view.y + p.y * view.scale });

	const zoomAt = useCallback((client: Pt, factor: number) => {
		const r = containerRef.current!.getBoundingClientRect();
		const v = viewRef.current;
		const scale = Math.max(0.02, Math.min(8, v.scale * factor));
		const k = scale / v.scale;
		const px = client.x - r.left;
		const py = client.y - r.top;
		userViewRef.current = true;
		setView({ scale, x: px - (px - v.x) * k, y: py - (py - v.y) * k });
	}, []);

	// Wheel zooms around the pointer (non-passive so the page doesn't zoom or scroll)
	useEffect(() => {
		const el = containerRef.current;
		if (!el) return;
		const onWheel = (e: WheelEvent) => {
			e.preventDefault();
			zoomAt({ x: e.clientX, y: e.clientY }, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)));
		};
		el.addEventListener('wheel', onWheel, { passive: false });
		return () => el.removeEventListener('wheel', onWheel);
	}, [zoomAt]);

	const selected = frame.elements.filter((el) => selectedIds.includes(el.id));
	const single = selected.length === 1 ? selected[0] : null;

	const commitText = useCallback(
		(edit: TextEdit) => {
			if (openEditRef.current !== edit.el.id) return;
			const doc = storyboardRef.current;
			const value = edit.value;
			if (edit.isNew) {
				if (value.trim()) {
					const el = { ...edit.el, ...textPatch(edit.el, value) } as TextElement;
					commit(addElements(doc, frame.id, [el]), 'AddText');
					setSelectedIds([el.id]);
				}
			} else if (!value.trim()) {
				commit(removeElements(doc, frame.id, new Set([edit.el.id])), 'DeleteText');
			} else if (value !== edit.el.text) {
				commit(patchElements(doc, frame.id, new Map([[edit.el.id, textPatch(edit.el, value)]])), 'Text');
			}
			setTextEdit(null);
		},
		[commit, storyboardRef, frame.id, setSelectedIds, setTextEdit]
	);

	const startTextEdit = (el: TextElement) => {
		setSelectedIds([el.id]);
		setTextEdit({ el, isNew: false, value: el.text });
	};

	const lineEnds = single && (single.type === 'line' || single.type === 'arrow') && single.points.length === 2 ? single : null;
	const endpointAt = (client: Pt): number | null => {
		if (!lineEnds) return null;
		const r = containerRef.current!.getBoundingClientRect();
		for (let i = 0; i < 2; i++) {
			const s = toScreen({ x: lineEnds.points[i][0], y: lineEnds.points[i][1] });
			if (Math.hypot(client.x - r.left - s.x, client.y - r.top - s.y) <= HANDLE_HIT_PX) return i;
		}
		return null;
	};

	const handleAt = (client: Pt): Handle | null => {
		if (!single || lineEnds) return null;
		const r = containerRef.current!.getBoundingClientRect();
		const pos = handlePositions(elementBox(single), ROTATE_OFFSET_PX / view.scale);
		for (const [h, p] of Object.entries(pos) as Array<[Handle, Pt]>) {
			const s = toScreen(p);
			if (Math.hypot(client.x - r.left - s.x, client.y - r.top - s.y) <= HANDLE_HIT_PX) return h;
		}
		return null;
	};

	/** Ends the current gesture; `cancelled` drops drafts and reverts live transforms. */
	const finishGesture = (client: Pt | null, cancelled: boolean, shift = false) => {
		const g = gestureRef.current;
		gestureRef.current = null;
		if (!g) return;
		const doc = storyboardRef.current;
		switch (g.kind) {
			case 'move':
			case 'resize':
			case 'rotate':
			case 'endpoint':
				if (cancelled) cancelLiveEdit();
				else endLiveEdit();
				break;
			case 'marquee':
				setMarquee(null);
				break;
			case 'shape':
				if (!cancelled && client) {
					// From the release point: the last move may not have rendered yet
					const shape = shapeFromDrag(g.tool, g.start, snapPt(toFrame(client)), shift, g.id, defaultRefFrameId);
					commit(addElements(doc, frame.id, [shape]), 'AddShape');
					setSelectedIds([shape.id]);
					setTool('select');
				}
				setDraft(null);
				break;
			case 'pen': {
				const points = simplifyPenPoints(g.points);
				if (!cancelled && points.length >= 2) commit(addElements(doc, frame.id, [penStroke(points)]), 'AddPen');
				setDraft(null);
				break;
			}
			case 'text':
				if (!cancelled && client && Math.hypot(client.x - g.client.x, client.y - g.client.y) < DRAG_THRESHOLD_PX * 3) {
					setTextEdit({ el: textAt(g.start), isNew: true, value: '' });
					setTool('select');
				}
				break;
			default:
				break;
		}
	};

	const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
		// A focused inspector or header field commits to what it was showing before the selection changes
		const focused = document.activeElement as HTMLElement | null;
		if (focused && (focused.tagName === 'INPUT' || focused.tagName === 'TEXTAREA') && focused.closest('[data-frame-editor]')) focused.blur();
		if (textEdit) {
			commitText(textEdit);
			return;
		}
		const client = { x: e.clientX, y: e.clientY };
		pointersRef.current.set(e.pointerId, client);
		e.currentTarget.setPointerCapture?.(e.pointerId);

		// A second finger: pinch-zoom and two-finger pan; whatever one finger started is dropped
		if (pointersRef.current.size === 2) {
			finishGesture(null, true);
			const [a, b] = [...pointersRef.current.values()];
			gestureRef.current = { kind: 'pinch', dist: Math.max(10, Math.hypot(a.x - b.x, a.y - b.y)), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, view: viewRef.current };
			return;
		}
		if (pointersRef.current.size > 2) return;
		if (e.button === 1) {
			e.preventDefault();
			gestureRef.current = { kind: 'pan', client, view: viewRef.current };
			return;
		}
		if (e.button !== 0) return;

		const p = toFrame(client);
		if (tool === 'select') {
			const end = endpointAt(client);
			if (end !== null && lineEnds) {
				beginLiveEdit('commit', 'MoveEndpoint');
				gestureRef.current = { kind: 'endpoint', index: end, el: lineEnds, client, moved: false };
				return;
			}
			const hit = hitTestElements(frame.elements, p, HIT_TOLERANCE_PX / view.scale);
			// On an element smaller than its handles, the body wins (it can still be moved and edited)
			const handle = handleAt(client);
			const small = single ? Math.min(elementBox(single).w, elementBox(single).h) * view.scale < HANDLE_HIT_PX * 3 : false;
			if (handle && single && !(small && hit?.id === single.id)) {
				const box = elementBox(single);
				if (handle === 'rotate') {
					beginLiveEdit('commit', 'Rotate');
					gestureRef.current = { kind: 'rotate', el: single, box, client, moved: false };
				} else {
					beginLiveEdit('commit', 'Resize');
					gestureRef.current = { kind: 'resize', handle, start: snapPt(p), el: single, box, client, moved: false };
				}
				return;
			}
			if (hit) {
				if (e.shiftKey) {
					setSelectedIds(selectedIds.includes(hit.id) ? selectedIds.filter((id) => id !== hit.id) : [...selectedIds, hit.id]);
					return;
				}
				const ids = selectedIds.includes(hit.id) ? selectedIds : [hit.id];
				if (ids !== selectedIds) setSelectedIds(ids);
				beginLiveEdit('commit', 'MoveElements');
				gestureRef.current = { kind: 'move', start: p, client, moved: false, originals: frame.elements.filter((el) => ids.includes(el.id)) };
				return;
			}
			// Touch: one finger on the surround (off the board) pans; two fingers pan and pinch anywhere
			if (e.pointerType === 'touch' && (p.x < 0 || p.y < 0 || p.x > board.width || p.y > board.height)) {
				setSelectedIds([]);
				gestureRef.current = { kind: 'pan', client, view: viewRef.current };
				return;
			}
			const base = e.shiftKey ? selectedIds : [];
			setSelectedIds(base);
			gestureRef.current = { kind: 'marquee', start: p, base };
			return;
		}
		if (tool === 'pen') {
			gestureRef.current = { kind: 'pen', points: [[p.x, p.y]] };
			setDraft(penStroke([[p.x, p.y]], 'draft'));
			return;
		}
		if (tool === 'text') {
			gestureRef.current = { kind: 'text', start: snapPt(p), client };
			return;
		}
		const start = snapPt(p);
		const id = newId('e_');
		// No draft yet: a press alone would show the default-sized shape a click makes, then jump to the drag
		gestureRef.current = { kind: 'shape', tool, start, client, id };
	};

	const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
		if (!pointersRef.current.has(e.pointerId)) return;
		const client = { x: e.clientX, y: e.clientY };
		pointersRef.current.set(e.pointerId, client);
		const g = gestureRef.current;
		if (!g) return;
		const p = toFrame(client);
		// A press on a handle with a little jitter changes nothing (and records no undo step)
		if (g.kind === 'resize' || g.kind === 'rotate' || g.kind === 'endpoint') {
			if (!g.moved && Math.hypot(client.x - g.client.x, client.y - g.client.y) < DRAG_THRESHOLD_PX) return;
			g.moved = true;
		}
		switch (g.kind) {
			case 'pinch': {
				if (pointersRef.current.size < 2) return;
				const [a, b] = [...pointersRef.current.values()];
				const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
				const k = Math.max(0.02 / g.view.scale, Math.min(8 / g.view.scale, Math.hypot(a.x - b.x, a.y - b.y) / g.dist));
				const r = containerRef.current!.getBoundingClientRect();
				const ox = g.mid.x - r.left;
				const oy = g.mid.y - r.top;
				userViewRef.current = true;
				setView({ scale: g.view.scale * k, x: ox - (ox - g.view.x) * k + (mid.x - g.mid.x), y: oy - (oy - g.view.y) * k + (mid.y - g.mid.y) });
				return;
			}
			case 'pan':
				userViewRef.current = true;
				setView({ ...g.view, x: g.view.x + client.x - g.client.x, y: g.view.y + client.y - g.client.y });
				return;
			case 'move': {
				// A click with a little jitter is not a move
				if (!g.moved && Math.hypot(client.x - g.client.x, client.y - g.client.y) < DRAG_THRESHOLD_PX) return;
				g.moved = true;
				let dx = p.x - g.start.x;
				let dy = p.y - g.start.y;
				if (showGrid) {
					dx = snap(dx, gridStep);
					dy = snap(dy, gridStep);
				}
				const moved = new Map(g.originals.map((el) => [el.id, moveElement(el, dx, dy)]));
				liveUpdate((doc) => replaceElements(doc, frame.id, moved));
				return;
			}
			case 'resize': {
				const q = snapPt(p);
				const box = resizeBox(g.box, g.handle, q.x - g.start.x, q.y - g.start.y, e.shiftKey);
				liveUpdate((doc) => replaceElements(doc, frame.id, new Map([[g.el.id, applyBox(g.el, g.box, box)]])));
				return;
			}
			case 'endpoint': {
				const other = g.el.points[1 - g.index];
				let q = snapPt(p);
				if (e.shiftKey) {
					// 45° steps around the other end
					const len = Math.hypot(q.x - other[0], q.y - other[1]);
					const ang = Math.round(Math.atan2(q.y - other[1], q.x - other[0]) / (Math.PI / 4)) * (Math.PI / 4);
					q = { x: other[0] + len * Math.cos(ang), y: other[1] + len * Math.sin(ang) };
				}
				const points = g.el.points.map((pt, i) => (i === g.index ? ([q.x, q.y] as Point) : pt));
				liveUpdate((doc) => replaceElements(doc, frame.id, new Map([[g.el.id, { ...g.el, points }]])));
				return;
			}
			case 'rotate': {
				const deg = rotationToward(g.box, p, e.shiftKey);
				liveUpdate((doc) => replaceElements(doc, frame.id, new Map([[g.el.id, applyRotation(g.el, g.box, deg)]])));
				return;
			}
			case 'marquee': {
				setMarquee({ a: g.start, b: p });
				const hits = elementsInRect(frame.elements, { x: g.start.x, y: g.start.y, w: p.x - g.start.x, h: p.y - g.start.y });
				setSelectedIds([...new Set([...g.base, ...hits])]);
				return;
			}
			case 'shape':
				if (Math.hypot(client.x - g.client.x, client.y - g.client.y) < DRAG_THRESHOLD_PX) return;
				setDraft(shapeFromDrag(g.tool, g.start, snapPt(p), e.shiftKey, g.id, defaultRefFrameId));
				return;
			case 'pen': {
				const last = g.points[g.points.length - 1];
				if (Math.hypot(p.x - last[0], p.y - last[1]) * view.scale < 1.5) return;
				g.points = [...g.points, [p.x, p.y]];
				setDraft(penStroke(g.points, 'draft'));
				return;
			}
			default:
				return;
		}
	};

	const onPointerUp = (e: React.PointerEvent<HTMLDivElement>, cancelled = false) => {
		if (!pointersRef.current.has(e.pointerId)) return;
		pointersRef.current.delete(e.pointerId);
		const client = { x: e.clientX, y: e.clientY };
		const g = gestureRef.current;
		if (g?.kind === 'pinch') {
			if (pointersRef.current.size < 2) gestureRef.current = null;
			return;
		}
		// A quick second tap/click on a text element edits it in place
		if (!cancelled && g?.kind === 'move' && tool === 'select') {
			const p = toFrame(client);
			const hit = hitTestElements(frame.elements, p, HIT_TOLERANCE_PX / view.scale);
			const last = lastTapRef.current;
			const now = Date.now();
			if (hit?.type === 'text' && last?.id === hit.id && now - last.t < DOUBLE_TAP_MS && Math.hypot(client.x - last.client.x, client.y - last.client.y) < 20) {
				lastTapRef.current = null;
				finishGesture(client, false);
				startTextEdit(hit);
				return;
			}
			lastTapRef.current = hit ? { id: hit.id, t: now, client } : null;
		}
		finishGesture(client, cancelled, e.shiftKey);
	};

	const editingId = textEdit && !textEdit.isNew ? textEdit.el.id : null;
	// The board's background is drawn underneath, so onion-skin frames sit between it and this frame's elements
	const shown: Frame = useMemo(
		() => (editingId ? { ...frame, elements: frame.elements.filter((el) => el.id !== editingId) } : frame),
		[frame, editingId]
	);
	const boardScreen = { x: view.x, y: view.y, w: board.width * view.scale, h: board.height * view.scale };

	const outline = (el: FrameElement) => {
		const b = elementBox(el);
		const c = boxCenter(b);
		return [
			{ x: b.x, y: b.y },
			{ x: b.x + b.w, y: b.y },
			{ x: b.x + b.w, y: b.y + b.h },
			{ x: b.x, y: b.y + b.h },
		]
			.map((q) => toScreen(rotatePoint(q, c, b.rotation)))
			.map((q) => `${q.x},${q.y}`)
			.join(' ');
	};

	const cursor = tool === 'select' ? 'default' : tool === 'text' ? 'text' : 'crosshair';

	return (
		<div
			ref={containerRef}
			className="absolute inset-0 overflow-hidden touch-none select-none bg-neutral-950"
			style={{ cursor }}
			onPointerDown={onPointerDown}
			onPointerMove={onPointerMove}
			onPointerUp={(e) => onPointerUp(e)}
			onPointerCancel={(e) => onPointerUp(e, true)}
			onContextMenu={(e) => e.preventDefault()}
			onDragOver={(e) => {
				if (e.dataTransfer.types.includes('Files')) e.preventDefault();
			}}
			onDrop={(e) => {
				const file = e.dataTransfer.files[0];
				if (!file) return;
				e.preventDefault();
				onDropImage(file, toFrame({ x: e.clientX, y: e.clientY }));
			}}
			data-testid="artboard"
			data-scale={view.scale}
			data-offset-x={view.x}
			data-offset-y={view.y}
		>
			<div
				className="absolute shadow-2xl ring-1 ring-neutral-700"
				style={{ left: boardScreen.x, top: boardScreen.y, width: boardScreen.w, height: boardScreen.h, background: frame.background }}
			>
				{onion.map((g) => (
					<div key={g.id} className="absolute inset-0 pointer-events-none" style={{ opacity: 0.3 }} data-testid="onion-skin">
						<FrameSvg frame={g} board={board} {...lookups} transparent className="block w-full h-full" />
					</div>
				))}
				<FrameSvg frame={shown} board={board} {...lookups} transparent className="absolute inset-0 block w-full h-full" />
			</div>
			<svg className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden>
				{draft ? (
					<g transform={`translate(${view.x} ${view.y}) scale(${view.scale})`} opacity={0.85}>
						<FrameSvg frame={{ ...frame, elements: [draft] }} board={board} {...lookups} transparent depth={1} />
					</g>
				) : null}
				{showGrid ? (
					<g stroke="rgba(255,255,255,0.08)" strokeWidth={1}>
						{Array.from({ length: Math.floor(board.width / gridStep) + 1 }, (_, i) => (
							<line key={`v${i}`} x1={boardScreen.x + i * gridStep * view.scale} x2={boardScreen.x + i * gridStep * view.scale} y1={boardScreen.y} y2={boardScreen.y + boardScreen.h} />
						))}
						{Array.from({ length: Math.floor(board.height / gridStep) + 1 }, (_, i) => (
							<line key={`h${i}`} y1={boardScreen.y + i * gridStep * view.scale} y2={boardScreen.y + i * gridStep * view.scale} x1={boardScreen.x} x2={boardScreen.x + boardScreen.w} />
						))}
					</g>
				) : null}
				{showSafe ? (
					<g fill="none" stroke="rgba(250,204,21,0.6)" strokeDasharray="6 4" strokeWidth={1}>
						{[0.05, 0.1].map((inset) => (
							<rect
								key={inset}
								x={boardScreen.x + boardScreen.w * inset}
								y={boardScreen.y + boardScreen.h * inset}
								width={boardScreen.w * (1 - inset * 2)}
								height={boardScreen.h * (1 - inset * 2)}
							/>
						))}
					</g>
				) : null}
				{selected.map((el) => (
					<polygon key={el.id} points={outline(el)} fill="none" stroke="rgb(96,165,250)" strokeWidth={1.5} />
				))}
				{lineEnds && !textEdit
					? lineEnds.points.map((pt, i) => {
							const q = toScreen({ x: pt[0], y: pt[1] });
							return <circle key={i} data-handle={`end${i}`} cx={q.x} cy={q.y} r={HANDLE_PX / 2 + 1} fill="#f5f5f5" stroke="rgb(96,165,250)" strokeWidth={1.5} />;
						})
					: null}
				{single && !lineEnds && !textEdit
					? (() => {
							const pos = handlePositions(elementBox(single), ROTATE_OFFSET_PX / view.scale);
							const top = toScreen(handlePositions(elementBox(single), 0).n);
							const rot = toScreen(pos.rotate);
							return (
								<g data-testid="handles">
									<line x1={top.x} y1={top.y} x2={rot.x} y2={rot.y} stroke="rgb(96,165,250)" strokeWidth={1} />
									<circle cx={rot.x} cy={rot.y} r={HANDLE_PX / 2 + 1} fill="#171717" stroke="rgb(96,165,250)" strokeWidth={1.5} data-handle="rotate" />
									{(Object.entries(pos) as Array<[Handle, Pt]>)
										.filter(([h]) => h !== 'rotate')
										.map(([h, q]) => {
											const s = toScreen(q);
											return (
												<rect
													key={h}
													data-handle={h}
													x={s.x - HANDLE_PX / 2}
													y={s.y - HANDLE_PX / 2}
													width={HANDLE_PX}
													height={HANDLE_PX}
													fill="#f5f5f5"
													stroke="rgb(96,165,250)"
													strokeWidth={1}
												/>
											);
										})}
								</g>
							);
						})()
					: null}
				{marquee ? (
					<rect
						x={Math.min(toScreen(marquee.a).x, toScreen(marquee.b).x)}
						y={Math.min(toScreen(marquee.a).y, toScreen(marquee.b).y)}
						width={Math.abs(toScreen(marquee.b).x - toScreen(marquee.a).x)}
						height={Math.abs(toScreen(marquee.b).y - toScreen(marquee.a).y)}
						fill="rgba(96,165,250,0.12)"
						stroke="rgb(96,165,250)"
						strokeDasharray="4 3"
					/>
				) : null}
			</svg>
			{textEdit ? <TextEditor edit={textEdit} view={view} onChange={(value) => setTextEdit({ ...textEdit, value })} onCommit={commitText} onCancel={() => setTextEdit(null)} /> : null}
			{selected.length > 0 && !textEdit ? <SelectionBounds els={selected} toScreen={toScreen} /> : null}
		</div>
	);
}

/** In-place text editing over the artboard, at the element's size and rotation. Enter commits, Shift+Enter breaks. */
function TextEditor({ edit, view, onChange, onCommit, onCancel }: { edit: TextEdit; view: View; onChange: (v: string) => void; onCommit: (e: TextEdit) => void; onCancel: () => void }) {
	const ref = useRef<HTMLTextAreaElement>(null);
	// Enter/Escape finish the edit; a blur that follows must not commit it again
	const done = useRef(false);
	useEffect(() => {
		ref.current?.focus();
		ref.current?.select();
	}, []);
	const { el } = edit;
	return (
		<textarea
			ref={ref}
			aria-label="Edit text in place"
			value={edit.value}
			onChange={(e) => onChange(e.target.value)}
			onBlur={() => {
				if (!done.current) onCommit(edit);
			}}
			onPointerDown={(e) => e.stopPropagation()}
			onKeyDown={(e) => {
				if (e.key === 'Escape') {
					e.preventDefault();
					e.stopPropagation();
					done.current = true;
					onCancel();
				} else if (e.key === 'Enter' && !e.shiftKey) {
					e.preventDefault();
					done.current = true;
					onCommit(edit);
				}
			}}
			className="absolute bg-transparent outline-none ring-1 ring-blue-400/70 resize-none overflow-hidden p-0 m-0 field-sizing-content"
			style={{
				left: view.x + el.x * view.scale,
				top: view.y + el.y * view.scale,
				minWidth: Math.max(40, el.w * view.scale),
				fontSize: el.fontSize * view.scale,
				lineHeight: 1.2,
				color: el.fill,
				fontFamily: 'system-ui, sans-serif',
				// Same pivot as the element: its box centre
				transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
				transformOrigin: `${(el.w * view.scale) / 2}px ${(el.h * view.scale) / 2}px`,
			}}
		/>
	);
}

/** Axis-aligned bounds of a multi-selection, as a faint frame (multi-selections move but don't resize). */
function SelectionBounds({ els, toScreen }: { els: FrameElement[]; toScreen: (p: Pt) => Pt }) {
	if (els.length < 2) return null;
	const boxes = els.map((el) => boxBounds(elementBox(el)));
	const x = Math.min(...boxes.map((b) => b.x));
	const y = Math.min(...boxes.map((b) => b.y));
	const a = toScreen({ x, y });
	const b = toScreen({ x: Math.max(...boxes.map((q) => q.x + q.w)), y: Math.max(...boxes.map((q) => q.y + q.h)) });
	return <div className="absolute pointer-events-none border border-dashed border-blue-400/60" style={{ left: a.x - 4, top: a.y - 4, width: b.x - a.x + 8, height: b.y - a.y + 8 }} />;
}
