import { formatPreciseTime } from '../time';
import type { MotiaJson } from './motiaJson';

// README.md and STORYBOARD.md inside the export. Plain, user-facing copy (SPEC §7.3); the user's text is verbatim.

export function readmeMarkdown(title: string): string {
	return `# ${title}

**About this export.** This folder is a complete motia storyboard.

- \`motia.json\` holds every frame, note and setting.
- \`frames/\` has an SVG and a PNG of each frame.
- \`sheet.png\` shows every frame on one page.
- \`STORYBOARD.md\` lists frames and notes in time order.

Times are in seconds from the start of the song. Frame coordinates are in pixels from the top-left corner. An element
that keeps the same id across frames is the same object. "Canvas sketch" strokes are freehand marks drawn outside
frames and aren't tied to a time. To open this storyboard in motia again, choose **Import storyboard** on the Projects
page.

## Reading motia.json

- Frame space is board pixels with the origin at the top-left and y pointing down.
- \`x, y, w, h\` are the unrotated box. \`rotation\` is in degrees, clockwise, about the box centre.
- \`points\` are absolute frame pixels.
- A \`box\` with an \`assetId\` (its own, or its symbol's) shows that picture, from \`assets/\`. Without one it is a
  placeholder for something not drawn yet, named by its \`label\`.
- Times are seconds on the untrimmed song. \`trimStart\` and \`trimEnd\` give the range in use.
- \`canvasX\` and \`canvasY\` are positions on the motia canvas. They only matter when importing again.
- The same element \`id\` in two frames is the same object.
`;
}

/** A table cell: pipes and `<` escaped (so the text shows as written), line breaks kept as <br>. */
const cell = (text: string) =>
	text
		.replace(/\\/g, '\\\\')
		.replace(/\|/g, '\\|')
		.replace(/</g, '&lt;')
		.replace(/\r\n|\r|\n/g, '<br>');

const span = (time: number, endTime?: number) => (endTime !== undefined ? `${formatPreciseTime(time)} → ${formatPreciseTime(endTime)}` : formatPreciseTime(time));

export function storyboardMarkdown(doc: MotiaJson): string {
	const { project, board } = doc;
	const lines: string[] = [`# ${project.title}`, ''];
	const format = [`Board ${board.width}×${board.height}`, board.fps ? `${board.fps} fps` : '', board.style ? `style: ${board.style}` : ''].filter(Boolean);
	lines.push(format.join(' · '));
	if (project.audio) {
		const a = project.audio;
		lines.push('', `Song: ${a.name}, ${formatPreciseTime(a.durationSec)} long, in use from ${formatPreciseTime(a.trimStart)} to ${formatPreciseTime(a.trimEnd)}`);
	}

	// Frames and notes together, in time order (a frame before a note at the same time)
	type Row = { time: number; order: number; cells: string[] };
	const rows: Row[] = [
		...doc.frames.map((f, i) => ({
			time: f.time,
			order: 0,
			cells: [span(f.time, f.endTime), `Frame ${String(i + 1).padStart(3, '0')}`, cell(f.title), cell(f.notes), cell(f.group ?? '')],
		})),
		...doc.notes.map((n) => ({ time: n.time, order: 1, cells: [formatPreciseTime(n.time), 'Note', '', cell(n.content), ''] })),
	].sort((a, b) => a.time - b.time || a.order - b.order);
	lines.push('', '## Timeline', '', '| Time | | Title | Notes | Group |', '|---|---|---|---|---|');
	for (const r of rows) lines.push(`| ${r.cells.join(' | ')} |`);

	for (const [i, f] of doc.frames.entries()) {
		lines.push('', `## Frame ${String(i + 1).padStart(3, '0')} · ${span(f.time, f.endTime)}${f.title ? ` · ${cell(f.title)}` : ''}`, '');
		if (f.preview) lines.push(`![Frame ${i + 1}](${f.preview.png})`, '');
		if (f.group) lines.push(`Group: ${f.group}`, '');
		if (f.notes) lines.push(f.notes, '');
		if (f.elements.length === 0) {
			lines.push('No elements.');
			continue;
		}
		lines.push('| id | type | label | text | note |', '|---|---|---|---|---|');
		for (const el of f.elements) {
			const symbol = el.type === 'box' && el.symbolId ? doc.symbols.find((s) => s.id === el.symbolId) : undefined;
			const label = el.label ?? symbol?.label ?? '';
			const text = el.type === 'text' ? el.text : '';
			// A box's own picture is marked; a symbol's picture is listed with the symbol below
			const kind = symbol ? ` (symbol ${symbol.id})` : el.type === 'box' && el.assetId ? ' (image)' : '';
			lines.push(`| ${el.id} | ${el.type}${kind} | ${cell(label)} | ${cell(text)} | ${cell(el.note ?? '')} |`);
		}
	}

	if (doc.symbols.length > 0) {
		lines.push('', '## Symbols', '', '| id | label | note | image |', '|---|---|---|---|');
		for (const s of doc.symbols) {
			const asset = s.assetId ? doc.assets.find((a) => a.id === s.assetId) : undefined;
			lines.push(`| ${s.id} | ${cell(s.label)} | ${cell(s.note ?? '')} | ${asset?.file ?? ''} |`);
		}
	}

	const sketch = doc.canvasSketch.strokes.length;
	if (sketch > 0) lines.push('', '## Canvas sketch', '', `${sketch} freehand stroke${sketch === 1 ? '' : 's'} on the canvas, not tied to a time.`);
	return lines.join('\n') + '\n';
}
