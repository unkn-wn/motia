import { describe, expect, it } from 'vitest';
import { fitWithin, headerSize, sniffImageType } from './images';

const bytes = (...b: number[]) => new Uint8Array([...b, ...new Array(16).fill(0)]);
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

describe('image intake', () => {
	it('recognises raster images by their bytes', () => {
		expect(sniffImageType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe('image/png');
		expect(sniffImageType(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe('image/jpeg');
		expect(sniffImageType(bytes(...ascii('GIF89a')))).toBe('image/gif');
		expect(sniffImageType(bytes(...ascii('GIF87a')))).toBe('image/gif');
		expect(sniffImageType(bytes(...ascii('RIFF'), 0, 0, 0, 0, ...ascii('WEBP')))).toBe('image/webp');
	});

	it('rejects SVG, other formats and look-alikes', () => {
		expect(sniffImageType(bytes(...ascii('<svg xmlns="http://www.w3.org/2000/svg">')))).toBeNull();
		expect(sniffImageType(bytes(...ascii('<?xml version="1.0"?><svg')))).toBeNull();
		expect(sniffImageType(bytes(...ascii('RIFF'), 0, 0, 0, 0, ...ascii('WAVE')))).toBeNull();
		expect(sniffImageType(bytes(...ascii('GIF80a')))).toBeNull();
		expect(sniffImageType(new Uint8Array([]))).toBeNull();
	});

	it('fits large images within 2048 px, keeping the aspect ratio', () => {
		expect(fitWithin(4096, 2048)).toEqual({ width: 2048, height: 1024 });
		expect(fitWithin(1000, 3000)).toEqual({ width: 683, height: 2048 });
		expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
	});

	it('reads the pixel size from the header, without decoding', () => {
		const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, ...ascii('IHDR'), 0, 0, 0x75, 0x30, 0, 0, 0x01, 0x00]);
		expect(headerSize(png, 'image/png')).toEqual({ width: 30000, height: 256 });
		expect(headerSize(new Uint8Array([...ascii('GIF89a'), 0x10, 0x27, 0x20, 0x00]), 'image/gif')).toEqual({ width: 10000, height: 32 });
		// JPEG: an APP0 segment, then SOF0 (height before width)
		const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xc0, 0, 17, 8, 0x0b, 0xb8, 0x0f, 0xa0, 3, 0, 0, 0, 0, 0, 0]);
		expect(headerSize(jpeg, 'image/jpeg')).toEqual({ width: 4000, height: 3000 });
		const webp = new Uint8Array([...ascii('RIFF'), 0, 0, 0, 0, ...ascii('WEBPVP8X'), 10, 0, 0, 0, 0, 0, 0, 0, 0x7f, 0x0c, 0, 0x37, 0x09, 0]);
		expect(headerSize(webp, 'image/webp')).toEqual({ width: 3200, height: 2360 });
		expect(headerSize(new Uint8Array([0xff, 0xd8, 0x00]), 'image/jpeg')).toBeNull();
	});
});
