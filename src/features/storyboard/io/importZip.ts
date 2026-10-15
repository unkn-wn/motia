import { strFromU8 } from 'fflate';
import type { Note } from '@types';
import { createProject, deleteProject, newProjectId, saveProjectNotes } from '@/lib/db';
import { buildNotesPayload, planStoryboardWrite, SKETCH_NOTE_ID, STORYBOARD_HOLD_BYTES } from '@/lib/notesPayload';
import { deleteLocalAudio, saveLocalAudio } from '@/lib/localAudio';
import { audioTypeOf } from '@/lib/audioFiles';
import { deleteProjectAssets, putAsset } from '../assets/localAssets';
import { headerSize, MAX_FILE_BYTES, MAX_IMAGE_PIXELS, sniffImageType } from '../assets/images';
import { newId } from '../model';
import { serializeStoryboard } from '../storage';
import type { FrameElement, StoryboardDoc } from '../types';
import { validateMotiaJson } from '../validate';
import type { MotiaJson } from './motiaJson';
import { openZip } from './unzipGuard';

// Import (SPEC §7.4): a `.motia.zip` or a bare `motia.json` becomes a new project. The file is untrusted: the zip is
// opened with size and count limits, `motia.json` is checked strictly, images must really be PNG/JPEG/WebP/GIF, and
// nothing is written unless everything passes.

export const IMPORT_LIMITS = { totalBytes: 200 * 1024 * 1024, files: 2000, jsonBytes: 50 * 1024 * 1024 };

export type ParsedImport = {
	json: MotiaJson;
	storyboard: StoryboardDoc;
	/** Image bytes by their new asset id */
	assets: Map<string, Blob>;
	audio: File | null;
};

export type ImportCheck = { ok: true; value: ParsedImport } | { ok: false; errors: string[] };

const fail = (...errors: string[]): ImportCheck => ({ ok: false, errors });
const isZip = (b: Uint8Array) => b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04;
const wantedEntry = (name: string) => name === 'motia.json' || /^(assets|audio)\/[^/]+$/.test(name);

/**
 * The board with new asset ids. Images on this device are filed by asset id alone, so an import (often of a project
 * still on this device) must never reuse one: it would take over, and later delete, the other project's images.
 */
function withNewAssetIds(doc: StoryboardDoc): { doc: StoryboardDoc; ids: Map<string, string> } {
	const ids = new Map(doc.assets.map((a) => [a.id, newId('a_')]));
	const id = (old: string | undefined) => (old === undefined ? undefined : (ids.get(old) ?? old));
	const element = (el: FrameElement): FrameElement => {
		if (el.type === 'image') return { ...el, assetId: id(el.assetId)! };
		if (el.type === 'box' && el.assetId) return { ...el, assetId: id(el.assetId) };
		return el;
	};
	return {
		ids,
		doc: {
			...doc,
			assets: doc.assets.map((a) => ({ ...a, id: ids.get(a.id)! })),
			symbols: doc.symbols.map((s) => (s.assetId ? { ...s, assetId: id(s.assetId) } : s)),
			frames: doc.frames.map((f) => ({ ...f, elements: f.elements.map(element) })),
		},
	};
}

/** Reads and checks an import file. Nothing is written here. */
export async function readImport(file: File): Promise<ImportCheck> {
	if (file.size > IMPORT_LIMITS.totalBytes) return fail('This file is too large to import (over 200 MB).');
	const bytes = new Uint8Array(await file.arrayBuffer());
	let files: Record<string, Uint8Array> = {};
	let jsonBytes: Uint8Array | undefined;
	if (isZip(bytes)) {
		const opened = openZip(bytes, IMPORT_LIMITS, wantedEntry);
		if ('error' in opened) return fail(opened.error);
		files = opened.files;
		jsonBytes = files['motia.json'];
		if (!jsonBytes) return fail('This zip has no motia.json, so it is not a motia storyboard.');
	} else {
		jsonBytes = bytes;
	}
	if (jsonBytes.length > IMPORT_LIMITS.jsonBytes) return fail('motia.json is too large.');

	let parsed: unknown;
	try {
		parsed = JSON.parse(strFromU8(jsonBytes));
	} catch {
		return fail('This file could not be read as a motia storyboard.');
	}
	const checked = validateMotiaJson(parsed);
	if (!checked.ok) return fail(...checked.errors);
	const json = checked.value;
	const errors: string[] = [];

	const { doc: storyboard, ids } = withNewAssetIds({
		version: 1,
		board: json.board,
		frames: json.frames.map((f) => {
			const { preview: _preview, ...frame } = f;
			void _preview;
			return frame;
		}),
		symbols: json.symbols,
		assets: json.assets.map(({ id, mime, width, height }) => ({ id, mime, width, height })),
	});

	// Images: their bytes must be what the file says they are, within the sizes the app takes in
	const assets = new Map<string, Blob>();
	for (const a of json.assets) {
		if (!a.file) continue;
		const data = files[a.file];
		if (!data) continue; // not in this export (made on another device): shown as "Image missing"
		const mime = sniffImageType(data.subarray(0, 16));
		if (!mime) {
			errors.push(`${a.file}: not a PNG, JPEG, WebP or GIF image.`);
			continue;
		}
		if (mime !== a.mime) {
			errors.push(`${a.file}: the file is ${mime}, not ${a.mime}.`);
			continue;
		}
		const size = headerSize(data.subarray(0, 256 * 1024), mime);
		if (!size || size.width < 1 || size.height < 1 || data.length > MAX_FILE_BYTES) {
			errors.push(`${a.file}: this image could not be read.`);
			continue;
		}
		if (size.width * size.height > MAX_IMAGE_PIXELS) {
			errors.push(`${a.file}: the image has too many pixels.`);
			continue;
		}
		assets.set(ids.get(a.id)!, new Blob([data as BlobPart], { type: mime }));
	}

	// The song: its type from its name (an unknown one is left to the browser to recognise)
	const audioPath = json.project.audio?.file;
	const audioData = audioPath ? files[audioPath] : undefined;
	const audio =
		audioPath && audioData ? new File([audioData as BlobPart], json.project.audio!.name || audioPath.slice('audio/'.length), { type: audioTypeOf(audioPath) }) : null;

	// It must fit one project: the size at which the app still saves board changes (SPEC §8)
	const bytesNeeded = planStoryboardWrite(buildNotesPayload(toNotes(json)), serializeStoryboard(storyboard)).bytes;
	if (bytesNeeded > STORYBOARD_HOLD_BYTES) errors.push('This storyboard is too big for one project.');

	if (errors.length > 0) return { ok: false, errors };
	return { ok: true, value: { json, storyboard, assets, audio } };
}

/** The notes as the app keeps them: text notes plus one note holding the canvas sketch. */
function toNotes(json: MotiaJson): Note[] {
	const now = new Date();
	const notes: Note[] = json.notes.map((n) => ({ ...n, createdAt: now }));
	if (json.canvasSketch.strokes.length > 0) {
		notes.push({
			id: SKETCH_NOTE_ID,
			time: 0,
			canvasX: 0,
			canvasY: 0,
			content: '',
			color: 'blue',
			createdAt: now,
			type: 'drawing',
			drawing: {
				strokes: json.canvasSketch.strokes.map((s) => ({ points: s.points.map(([x, y]) => ({ x, y })), color: s.color, strokeWidth: s.width })),
				bounds: { width: 0, height: 0 },
			},
		});
	}
	return notes;
}

/** The trim kept within the song: start ≤ end ≤ duration. */
function trimWithin(a: NonNullable<MotiaJson['project']['audio']>) {
	const end = a.durationSec > 0 ? Math.min(a.trimEnd, a.durationSec) : a.trimEnd;
	const start = Math.min(a.trimStart, end);
	return { trimStart: start, trimEnd: end };
}

/**
 * Writes a checked import as a new project of `uid`; returns its id. The project's meta doc goes last: until then the
 * project isn't listed, so nothing (the projects list, a guest's redirect to their project) opens it half-written.
 * A failure part-way removes what was written.
 */
export async function writeImport(uid: string, data: ParsedImport): Promise<string> {
	const { json, storyboard, assets, audio } = data;
	const a = json.project.audio;
	const pid = newProjectId(uid);
	try {
		await saveProjectNotes(uid, pid, toNotes(json), undefined, serializeStoryboard(storyboard), { holdOversized: false });
		for (const meta of storyboard.assets) {
			const blob = assets.get(meta.id);
			if (blob) await putAsset({ ...meta, projectId: pid, blob });
		}
		if (audio) await saveLocalAudio(pid, audio);
		const name = a?.name || audio?.name || 'audio';
		await createProject(uid, {
			id: pid,
			title: json.project.title.trim() || name,
			orientation: json.project.orientation,
			audio: { name, size: audio?.size ?? 0, type: audio?.type ?? '', ...(a ? { durationSec: a.durationSec, ...trimWithin(a) } : {}) },
		});
		return pid;
	} catch (err) {
		await deleteProject(uid, pid).catch(() => {});
		await deleteProjectAssets(pid).catch(() => {});
		await deleteLocalAudio(pid).catch(() => {});
		throw err;
	}
}
