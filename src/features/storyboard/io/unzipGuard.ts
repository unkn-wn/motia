import { Unzip, UnzipInflate } from 'fflate';

// Opening an untrusted zip. Entries are read in order from their local headers (the central directory, where
// overlapping or lying entries hide, isn't used) and inflated in small steps, counting the bytes that really come
// out; reading stops as soon as a limit is passed. Sizes written in the zip are never trusted.

type ZipLimits = { totalBytes: number; files: number };
type OpenedZip = { files: Record<string, Uint8Array> } | { error: string };

const STEP = 64 * 1024;
export const TOO_LARGE = 'This file is too large to import (over 200 MB or 2,000 files).';
export const UNREADABLE = 'This file could not be opened as a storyboard.';

/** Unzips the entries `wanted` accepts; others are counted but never inflated. */
export function openZip(bytes: Uint8Array, limits: ZipLimits, wanted: (name: string) => boolean): OpenedZip {
	const files: Record<string, Uint8Array> = {};
	let count = 0;
	let total = 0;
	let error: string | null = null;
	const unzip = new Unzip();
	unzip.register(UnzipInflate);
	unzip.onfile = (file) => {
		if (error) return;
		count += 1;
		if (count > limits.files) {
			error = TOO_LARGE;
			return;
		}
		if (!wanted(file.name)) return;
		// Stored or deflated only, and each name once
		if ((file.compression !== 0 && file.compression !== 8) || file.name in files) {
			error = UNREADABLE;
			return;
		}
		const chunks: Uint8Array[] = [];
		let size = 0;
		file.ondata = (err, chunk, final) => {
			if (error) return;
			if (err) {
				error = UNREADABLE;
				return;
			}
			size += chunk.length;
			total += chunk.length;
			if (total > limits.totalBytes) {
				error = TOO_LARGE;
				file.terminate();
				return;
			}
			chunks.push(chunk);
			if (final) {
				const out = new Uint8Array(size);
				let at = 0;
				for (const c of chunks) {
					out.set(c, at);
					at += c.length;
				}
				files[file.name] = out;
			}
		};
		file.start();
	};
	try {
		for (let at = 0; at < bytes.length && !error; at += STEP) unzip.push(bytes.subarray(at, at + STEP), at + STEP >= bytes.length);
	} catch {
		return { error: error ?? UNREADABLE };
	}
	return error ? { error } : { files };
}
