import { describe, expect, it } from 'vitest';
import { strToU8, Zip, ZipDeflate, ZipPassThrough, zipSync } from 'fflate';
import { openZip, TOO_LARGE, UNREADABLE } from './unzipGuard';

const limits = { totalBytes: 1024 * 1024, files: 10 };
const wanted = (name: string) => name === 'motia.json' || name.startsWith('assets/');

/** A zip as the export writes it (streamed: sizes come after the data). */
function streamedZip(entries: Record<string, Uint8Array>, deflate: boolean): Uint8Array {
	const chunks: Uint8Array[] = [];
	const zip = new Zip((err, data) => {
		if (err) throw err;
		chunks.push(data);
	});
	for (const [name, data] of Object.entries(entries)) {
		const f = deflate ? new ZipDeflate(name) : new ZipPassThrough(name);
		zip.add(f);
		f.push(data, true);
	}
	zip.end();
	const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
	let at = 0;
	for (const c of chunks) {
		out.set(c, at);
		at += c.length;
	}
	return out;
}

describe('openZip', () => {
	it('reads the wanted entries of plain and streamed zips; others are skipped', () => {
		const entries = { 'motia.json': strToU8('{"a":1}'), 'assets/a.png': new Uint8Array([1, 2, 3]), 'other/x.txt': strToU8('x') };
		for (const bytes of [zipSync(entries), streamedZip(entries, true), streamedZip(entries, false)]) {
			const r = openZip(bytes, limits, wanted);
			expect('files' in r && Object.keys(r.files).sort()).toEqual(['assets/a.png', 'motia.json']);
			expect('files' in r && r.files['assets/a.png']).toEqual(new Uint8Array([1, 2, 3]));
		}
	});

	it('stops at the size limit, counting what really comes out', () => {
		const bomb = zipSync({ 'assets/zero.png': new Uint8Array(2 * 1024 * 1024) });
		expect(openZip(bomb, limits, wanted)).toEqual({ error: TOO_LARGE });
	});

	it('is not fooled by sizes written into the zip', () => {
		const bomb = zipSync({ 'assets/zero.png': new Uint8Array(2 * 1024 * 1024) }, { level: 9 });
		const lie = bomb.slice();
		const view = new DataView(lie.buffer);
		// Local header: uncompressed size at 22; central directory entry (signature 0x02014b50): at 24
		view.setUint32(22, 1, true);
		for (let i = 0; i < lie.length - 4; i++) if (view.getUint32(i, true) === 0x02014b50) view.setUint32(i + 24, 1, true);
		expect(openZip(lie, limits, wanted)).toEqual({ error: TOO_LARGE });
	});

	it('limits the number of files, and refuses repeated names and garbage', () => {
		const many = zipSync(Object.fromEntries(Array.from({ length: 11 }, (_, i) => [`x/${i}`, strToU8('x')])));
		expect(openZip(many, limits, wanted)).toEqual({ error: TOO_LARGE });
		const once = streamedZip({ 'motia.json': strToU8('{}') }, false);
		const twice = new Uint8Array([...once.subarray(0, once.length - 22 - 46 - 'motia.json'.length), ...once]);
		expect(openZip(twice, limits, wanted)).toEqual({ error: UNREADABLE });
		// Garbage yields nothing readable (import then reports there is no motia.json)
		const garbage = openZip(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 9, 9, 9]), limits, wanted);
		expect('error' in garbage || Object.keys(garbage.files).length === 0).toBe(true);
	});
});
