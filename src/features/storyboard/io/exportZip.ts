import { Zip, ZipDeflate, ZipPassThrough, strToU8 } from 'fflate';
import { saveAs } from 'file-saver';
import type { Note } from '@types';
import { sketchStrokes } from '@/lib/notesPayload';
import { getAsset } from '../assets/localAssets';
import { framesByTime } from '../timeline';
import type { StoryboardDoc } from '../types';
import { validateMotiaJson } from '../validate';
import { readmeMarkdown, storyboardMarkdown } from './markdown';
import { assetFileName, buildMotiaJson, frameFileStem, type MotiaAudio } from './motiaJson';
import { canvasPng, createContactSheet, frameImage, frameMarkup, type RenderContext } from './rasterize';

// The `<title>.motia.zip` export (SPEC §7.1): motia.json, README.md, STORYBOARD.md, sheet.png, an SVG and a PNG of
// every frame, the images, and the song when asked. Frames render one at a time, yielding between them, so the page
// stays responsive on big boards.

type ExportInput = {
	title: string;
	orientation: 'vertical' | 'horizontal';
	notes: Note[];
	storyboard: StoryboardDoc;
	/** The song; its file goes in only with `includeAudio`. */
	audio?: { file: File; durationSec: number; trimStart: number; trimEnd: number };
	includeAudio: boolean;
	onProgress?: (fraction: number) => void;
};

const XML_HEADER = '<?xml version="1.0" encoding="UTF-8"?>\n';
const NAME_LIMIT = 120;
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)$/i;
/** Larger frame images are scaled down to fit (browsers refuse bigger canvases, Safari first). */
const MAX_CANVAS_PIXELS = 16_000_000;

/** A name that is safe on every file system: no separators or control characters, extension kept. */
export function safeFileName(name: string, fallback: string): string {
	const chars = [...name].map((c) => (c.charCodeAt(0) < 32 || '\\/:*?"<>|'.includes(c) ? '_' : c));
	const dot = chars.lastIndexOf('.');
	const ext = dot > 0 && /^\.[A-Za-z0-9]{1,8}$/.test(chars.slice(dot).join('')) ? chars.slice(dot) : [];
	const stem = (ext.length ? chars.slice(0, dot) : chars)
		.join('')
		.trim()
		.replace(/^\.+/, '');
	const cut = [...stem]
		.slice(0, NAME_LIMIT)
		.join('')
		.replace(/[\s.]+$/, '');
	if (!cut) return fallback + ext.join('');
	return (WINDOWS_RESERVED.test(cut) ? `${cut}_` : cut) + ext.join('');
}

// Yields to the page between frames; unlike setTimeout, a message isn't slowed down in a background tab
const nextTask = () =>
	new Promise<void>((resolve) => {
		const channel = new MessageChannel();
		channel.port1.onmessage = () => {
			channel.port1.close();
			resolve();
		};
		channel.port2.postMessage(null);
	});
const bytesOf = async (blob: Blob) => new Uint8Array(await blob.arrayBuffer());

type ExportResult = { blob: Blob; fileName: string; warnings: string[] };

async function buildExportZip(input: ExportInput): Promise<ExportResult> {
	const { storyboard, onProgress } = input;
	const ordered = framesByTime(storyboard.frames);
	const steps = ordered.length + 2;
	let done = 0;
	const step = () => onProgress?.(++done / steps);
	const warnings: string[] = [];

	const chunks: Uint8Array[] = [];
	let finish!: () => void;
	let fail!: (err: Error) => void;
	const finished = new Promise<void>((resolve, reject) => {
		finish = resolve;
		fail = reject;
	});
	// Observed at the end; until then a failure must not surface as unhandled
	finished.catch(() => {});
	const zip = new Zip((err, data, final) => {
		if (err) return fail(err);
		chunks.push(data);
		if (final) finish();
	});
	// Text compresses; PNGs, images and audio are already compressed and are stored as they are
	const add = (name: string, data: Uint8Array, compress: boolean) => {
		const file = compress ? new ZipDeflate(name, { level: 6 }) : new ZipPassThrough(name);
		zip.add(file);
		file.push(data, true);
	};

	// Images on this device (an image made on another device, or one that can't be read, is left out)
	const present = new Map<string, Uint8Array>();
	for (const asset of storyboard.assets) {
		try {
			const stored = await getAsset(asset.id);
			if (stored) present.set(asset.id, await bytesOf(stored.blob));
		} catch {
			/* not on this device */
		}
	}
	step();

	const audioPath = input.includeAudio && input.audio ? `audio/${safeFileName(input.audio.file.name, 'song')}` : undefined;
	const audio: MotiaAudio | undefined = input.audio
		? {
				name: input.audio.file.name,
				durationSec: input.audio.durationSec,
				trimStart: input.audio.trimStart,
				trimEnd: input.audio.trimEnd,
				...(audioPath ? { file: audioPath } : {}),
			}
		: undefined;
	const json = buildMotiaJson(
		{ title: input.title, orientation: input.orientation, audio, notes: input.notes, sketch: sketchStrokes(input.notes), storyboard, exportedAt: new Date() },
		new Set(present.keys())
	);
	const jsonText = JSON.stringify(json, null, 2);
	// The export must open in motia again. If it wouldn't, the file still downloads (it holds the user's work) and
	// the user is told.
	const check = validateMotiaJson(JSON.parse(jsonText));
	if (!check.ok) warnings.push(`This file may not open in motia again (${check.errors[0]}).`);
	add('motia.json', strToU8(jsonText), true);
	add('README.md', strToU8(readmeMarkdown(input.title)), true);
	add('STORYBOARD.md', strToU8(storyboardMarkdown(json)), true);

	// Frames: the SVG points at the images in assets/; the PNG has them drawn in
	const ctx: RenderContext = { frames: storyboard.frames, symbols: storyboard.symbols };
	const byId = new Map(storyboard.assets.map((a) => [a.id, a]));
	const svgAssetUrl = (id: string) => {
		const asset = byId.get(id);
		return asset && present.has(id) ? `../${assetFileName(asset)}` : null;
	};
	const { width, height } = storyboard.board;
	const k = Math.min(1, Math.sqrt(MAX_CANVAS_PIXELS / (width * height)));
	const canvas = document.createElement('canvas');
	canvas.width = Math.max(1, Math.round(width * k));
	canvas.height = Math.max(1, Math.round(height * k));
	const g = canvas.getContext('2d')!;
	const sheet = createContactSheet(storyboard.board, ordered.length);
	for (const [i, frame] of ordered.entries()) {
		const stem = frameFileStem(i, frame);
		// One frame that can't be drawn leaves out its pictures, not the whole export
		try {
			add(`frames/${stem}.svg`, strToU8(XML_HEADER + (await frameMarkup(frame, storyboard.board, ctx, svgAssetUrl))), true);
			const image = await frameImage(frame, storyboard.board, ctx);
			g.clearRect(0, 0, canvas.width, canvas.height);
			g.drawImage(image, 0, 0, canvas.width, canvas.height);
			add(`frames/${stem}.png`, await bytesOf(await canvasPng(canvas)), false);
			sheet.draw(i, frame, image);
		} catch (err) {
			console.error('Frame export failed', frame.id, err);
			warnings.push(`Frame ${String(i + 1).padStart(3, '0')} could not be drawn; its data is in motia.json.`);
		}
		step();
		await nextTask();
	}
	try {
		add('sheet.png', await bytesOf(await sheet.toPng()), false);
	} catch (err) {
		console.error('Contact sheet failed', err);
		warnings.push('The contact sheet could not be drawn.');
	}

	for (const asset of storyboard.assets) {
		const data = present.get(asset.id);
		if (!data) continue;
		add(assetFileName(asset), data, false);
		present.delete(asset.id);
	}
	if (audioPath && input.audio) {
		await nextTask();
		add(audioPath, await bytesOf(input.audio.file), false);
	}
	zip.end();
	await finished;
	step();
	return { blob: new Blob(chunks as BlobPart[], { type: 'application/zip' }), fileName: `${safeFileName(input.title, 'storyboard')}.motia.zip`, warnings };
}

/** Builds the export and hands it to the browser as a download. Returns what the user should know about it. */
export async function exportProject(input: ExportInput): Promise<string[]> {
	const { blob, fileName, warnings } = await buildExportZip(input);
	saveAs(blob, fileName);
	return warnings;
}
