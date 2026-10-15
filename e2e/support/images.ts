import { deflateSync } from 'node:zlib';

// Test images built at run time (nothing binary is committed).

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
	let c = n;
	for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
	return c >>> 0;
});

function crc32(buf: Buffer): number {
	let c = 0xffffffff;
	for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
	return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
	const len = Buffer.alloc(4);
	len.writeUInt32BE(data.length);
	const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
	const crc = Buffer.alloc(4);
	crc.writeUInt32BE(crc32(body));
	return Buffer.concat([len, body, crc]);
}

/** A solid-colour RGB PNG, or random pixels (doesn't compress: its size stays near width × height × 3 bytes). */
export function makePng(width: number, height: number, rgb: [number, number, number] | 'noise'): Buffer {
	const header = Buffer.alloc(13);
	header.writeUInt32BE(width, 0);
	header.writeUInt32BE(height, 4);
	header[8] = 8; // bit depth
	header[9] = 2; // RGB
	const rows = Array.from({ length: height }, () => {
		const row = Buffer.alloc(1 + width * 3);
		for (let x = 0; x < width; x++) row.set(rgb === 'noise' ? [rand(), rand(), rand()] : rgb, 1 + x * 3);
		return row;
	});
	const raw = Buffer.concat(rows);
	return Buffer.concat([
		Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
		chunk('IHDR', header),
		chunk('IDAT', deflateSync(raw)),
		chunk('IEND', Buffer.alloc(0)),
	]);
}

const rand = () => Math.floor(Math.random() * 256);

export const svgFile = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>');
