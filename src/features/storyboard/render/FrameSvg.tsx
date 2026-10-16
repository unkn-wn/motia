import { memo, useId } from 'react';
import { FRAME_REF_MAX_DEPTH, type BoardFormat, type Frame, type FrameElement, type Point, type StoryboardSymbol } from '../types';

// The one renderer of a frame model: the editor draws it live; thumbnails, export and frame references render
// it to static markup. Everything comes from the model through React; nothing from a file is injected as markup.


type Props = {
	frame: Frame;
	board: BoardFormat;
	/** Resolves frame references (live). Without it, a frame ref shows only its box. */
	resolveFrame?: (id: string) => Frame | undefined;
	/**
	 * Image URL for an asset id (data: URLs for static rendering): undefined while it loads (nothing drawn yet),
	 * null when the image isn't on this device ("Image missing").
	 */
	assetUrl?: (assetId: string) => string | null | undefined;
	/** Resolves a box's symbol: the symbol's image and label stand in for every instance. */
	resolveSymbol?: (id: string) => StoryboardSymbol | undefined;
	depth?: number;
	className?: string;
	/** Leave out the frame background (layers drawn over another background). */
	transparent?: boolean;
};

const BOX_STROKE = '#a3a3a3';

/** Text as XML allows it: control characters (pasted from other apps) would make the SVG unreadable. */
const xmlText = (s: string) => [...s].filter((c) => c.charCodeAt(0) >= 32 || c === '\t' || c === '\n').join('');
const xmlLabel = (s: string | undefined) => (s ? xmlText(s) || undefined : undefined);

const pointsAttr = (pts: Point[]) => pts.map(([x, y]) => `${x},${y}`).join(' ');

function arrowHead(pts: Point[], size: number): string | null {
	if (pts.length < 2) return null;
	const [x2, y2] = pts[pts.length - 1];
	const [x1, y1] = pts[pts.length - 2];
	const a = Math.atan2(y2 - y1, x2 - x1);
	const spread = Math.PI / 7;
	const p1: Point = [x2 - size * Math.cos(a - spread), y2 - size * Math.sin(a - spread)];
	const p2: Point = [x2 - size * Math.cos(a + spread), y2 - size * Math.sin(a + spread)];
	return pointsAttr([[x2, y2], p1, p2]);
}

function Placeholder({ x, y, w, h, label, caption, dashed = true }: { x: number; y: number; w: number; h: number; label?: string; caption?: string; dashed?: boolean }) {
	const fontSize = Math.max(12, Math.min(w, h) * 0.12);
	return (
		<>
			<rect
				x={x}
				y={y}
				width={w}
				height={h}
				fill="rgba(255,255,255,0.04)"
				stroke={BOX_STROKE}
				strokeWidth={Math.max(2, Math.min(w, h) * 0.01)}
				strokeDasharray={dashed ? `${fontSize * 0.6} ${fontSize * 0.4}` : undefined}
			/>
			{label ? (
				<text
					x={x + w / 2}
					y={y + h / 2}
					fill="#d4d4d4"
					stroke="#0a0a0a"
					strokeWidth={fontSize * 0.12}
					paintOrder="stroke"
					fontSize={fontSize}
					fontFamily="system-ui, sans-serif"
					textAnchor="middle"
					dominantBaseline="central"
				>
					{xmlText(label)}
				</text>
			) : null}
			{caption ? (
				<text
					x={x + w / 2}
					y={y + h / 2 + (label ? fontSize * 1.1 : 0)}
					fill="#a3a3a3"
					fontSize={fontSize * 0.6}
					fontFamily="system-ui, sans-serif"
					textAnchor="middle"
					dominantBaseline="central"
				>
					{caption}
				</text>
			) : null}
		</>
	);
}

type ElementProps = { el: FrameElement; props: Props; clipId: string };

function ElementSvgImpl({ el, props, clipId }: ElementProps) {
	const common = {
		'data-id': el.id,
		'data-type': el.type,
		'data-label': xmlLabel(el.label),
		opacity: el.opacity !== undefined && el.opacity < 1 ? el.opacity : undefined,
	};
	switch (el.type) {
		case 'line':
		case 'arrow':
		case 'pen': {
			const head = el.type === 'arrow' ? arrowHead(el.points, Math.max(12, el.strokeWidth * 4)) : null;
			const stroke = el.stroke ?? 'none';
			return (
				<g {...common}>
					<polyline
						points={pointsAttr(el.points)}
						fill="none"
						stroke={stroke}
						strokeWidth={el.strokeWidth}
						strokeLinecap="round"
						strokeLinejoin="round"
					/>
					{head ? <polygon points={head} fill={stroke} /> : null}
				</g>
			);
		}
		default:
			break;
	}

	const { x, y, w, h, rotation } = el;
	const transform = rotation ? `rotate(${rotation} ${x + w / 2} ${y + h / 2})` : undefined;
	switch (el.type) {
		case 'rect':
			return (
				<rect
					{...common}
					transform={transform}
					x={x}
					y={y}
					width={w}
					height={h}
					rx={el.radius || undefined}
					fill={el.fill ?? 'none'}
					stroke={el.stroke ?? undefined}
					strokeWidth={el.stroke ? el.strokeWidth : undefined}
				/>
			);
		case 'ellipse':
			return (
				<ellipse
					{...common}
					transform={transform}
					cx={x + w / 2}
					cy={y + h / 2}
					rx={w / 2}
					ry={h / 2}
					fill={el.fill ?? 'none'}
					stroke={el.stroke ?? undefined}
					strokeWidth={el.stroke ? el.strokeWidth : undefined}
				/>
			);
		case 'text': {
			const lines = xmlText(el.text).split('\n');
			return (
				<text {...common} transform={transform} x={x} y={y} fill={el.fill} fontSize={el.fontSize} fontFamily="system-ui, sans-serif">
					{lines.map((line, i) => (
						<tspan key={i} x={x} dy={i === 0 ? el.fontSize : el.fontSize * 1.2}>
							{line || ' '}
						</tspan>
					))}
				</text>
			);
		}
		case 'box':
		case 'image': {
			// A symbol instance takes the symbol's image (so changing it updates every instance) and, unless it
			// has its own, the symbol's label. A box whose symbol isn't in the project draws as a plain box.
			const symbol = el.type === 'box' && el.symbolId ? props.resolveSymbol?.(el.symbolId) : undefined;
			const assetId = symbol ? symbol.assetId : el.assetId;
			const label = el.type === 'box' ? (el.label ?? symbol?.label) : undefined;
			// No resolver (plain static rendering) counts as missing; undefined from a resolver = still loading
			const url = assetId ? (props.assetUrl ? props.assetUrl(assetId) : null) : undefined;
			return (
				<g {...common} data-label={xmlLabel(el.label || label)} transform={transform}>
					{url ? (
						<>
							<clipPath id={clipId}>
								<rect x={x} y={y} width={w} height={h} />
							</clipPath>
							<image href={url} x={x} y={y} width={w} height={h} preserveAspectRatio="xMidYMid slice" clipPath={`url(#${clipId})`} />
						</>
					) : null}
					{el.type === 'box' ? <Placeholder x={x} y={y} w={w} h={h} label={label} caption={url === null ? 'image missing' : undefined} /> : null}
					{el.type === 'image' && url === null ? <Placeholder x={x} y={y} w={w} h={h} label="Image missing" /> : null}
				</g>
			);
		}
		case 'frameRef': {
			const depth = props.depth ?? 0;
			const target = depth < FRAME_REF_MAX_DEPTH ? props.resolveFrame?.(el.refFrameId) : undefined;
			return (
				<g {...common} transform={transform}>
					{target ? (
						<svg x={x} y={y} width={w} height={h} viewBox={`0 0 ${props.board.width} ${props.board.height}`} preserveAspectRatio="xMidYMid meet">
							{/* The shown frame always has its own background, whatever the outer frame is drawn on */}
							<FrameSvg {...props} frame={target} depth={depth + 1} transparent={false} className={undefined} />
						</svg>
					) : null}
					<Placeholder
						x={x}
						y={y}
						w={w}
						h={h}
						label={target ? undefined : el.label}
						caption={!target && el.refFrameId && props.resolveFrame && depth < FRAME_REF_MAX_DEPTH ? 'frame missing' : undefined}
						dashed
					/>
				</g>
			);
		}
	}
}

/**
 * Elements are immutable, so one re-renders only when it changed or when a lookup it uses did: moving one element
 * of a frame re-renders that element, not the frame's others.
 */
const ElementSvg = memo(ElementSvgImpl, (a: ElementProps, b: ElementProps) => {
	if (a.el !== b.el || a.clipId !== b.clipId) return false;
	const p = a.props;
	const q = b.props;
	if (p === q) return true;
	switch (b.el.type) {
		case 'box':
		case 'image':
			return p.assetUrl === q.assetUrl && p.resolveSymbol === q.resolveSymbol;
		case 'frameRef':
			// Draws another frame with every lookup
			return p.board === q.board && p.depth === q.depth && p.resolveFrame === q.resolveFrame && p.assetUrl === q.assetUrl && p.resolveSymbol === q.resolveSymbol;
		default:
			return true;
	}
});

function FrameSvgImpl(props: Props) {
	const { frame, board, depth = 0, className, transparent } = props;
	const uid = useId().replace(/:/g, '');
	const body = (
		<>
			{transparent ? null : <rect width={board.width} height={board.height} fill={frame.background} />}
			{frame.elements.map((el, i) => (
				<ElementSvg key={`${el.id}-${i}`} el={el} props={props} clipId={`clip-${uid}-${i}`} />
			))}
		</>
	);
	if (depth > 0) return <g data-frame-id={frame.id}>{body}</g>;
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox={`0 0 ${board.width} ${board.height}`}
			width={board.width}
			height={board.height}
			className={className}
			data-frame-id={frame.id}
		>
			{body}
		</svg>
	);
}

/**
 * Re-renders only when the frame, board or resolvers change (frames are immutable). `resolveFrame` changes with
 * every board edit, so it only counts for a frame that shows other frames.
 */
export const FrameSvg = memo(FrameSvgImpl, (prev, next) => {
	for (const key of Object.keys({ ...prev, ...next }) as (keyof Props)[]) {
		if (prev[key] === next[key]) continue;
		if (key === 'resolveFrame' && !next.frame.elements.some((el) => el.type === 'frameRef')) continue;
		return false;
	}
	return true;
});
