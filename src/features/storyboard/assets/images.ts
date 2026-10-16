// Pictures for boxes (and symbols): raster only, recognised by their bytes (not the name or the browser's type),
// and downscaled to at most MAX_IMAGE_SIDE on the long side. Vector images (SVG) are never accepted.

type RasterMime = 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif';

const MAX_IMAGE_SIDE = 2048;

const startsWith = (b: Uint8Array, sig: number[], at = 0) => sig.every((v, i) => b[at + i] === v);

/** The raster type from the file's first bytes, or null for anything else. */
export function sniffImageType(bytes: Uint8Array): RasterMime | null {
	if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
	if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
	if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38]) && (bytes[4] === 0x37 || bytes[4] === 0x39) && bytes[5] === 0x61) return 'image/gif';
	if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) return 'image/webp';
	return null;
}

/** Size that fits within `max` on the long side, keeping the aspect ratio. */
export function fitWithin(width: number, height: number, max = MAX_IMAGE_SIDE): { width: number; height: number } {
	const k = Math.min(1, max / Math.max(width, height));
	return { width: Math.max(1, Math.round(width * k)), height: Math.max(1, Math.round(height * k)) };
}

/** Larger files are refused before they are read. */
export const MAX_FILE_BYTES = 50 * 1024 * 1024;
/** Larger images are refused before they are decoded (decoding allocates 4 bytes per pixel). */
export const MAX_IMAGE_PIXELS = 64_000_000;
/** Kept files above this size are re-encoded (large metadata chunks). */
const REENCODE_BYTES = 4 * 1024 * 1024;

const u16be = (b: Uint8Array, i: number) => (b[i] << 8) | b[i + 1];
const u16le = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8);
const u24le = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16);
const u32be = (b: Uint8Array, i: number) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;

/** Pixel size from the file header, without decoding; null when the header can't be read. */
export function headerSize(bytes: Uint8Array, mime: RasterMime): { width: number; height: number } | null {
	const b = bytes;
	if (mime === 'image/png') return b.length >= 24 ? { width: u32be(b, 16), height: u32be(b, 20) } : null;
	if (mime === 'image/gif') return b.length >= 10 ? { width: u16le(b, 6), height: u16le(b, 8) } : null;
	if (mime === 'image/webp') {
		if (b.length < 30) return null;
		const chunk = String.fromCharCode(b[12], b[13], b[14], b[15]);
		if (chunk === 'VP8X') return { width: u24le(b, 24) + 1, height: u24le(b, 27) + 1 };
		if (chunk === 'VP8L') {
			const bits = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24);
			return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
		}
		if (chunk === 'VP8 ') return { width: u16le(b, 26) & 0x3fff, height: u16le(b, 28) & 0x3fff };
		return null;
	}
	// JPEG: walk the segments to the first start-of-frame marker
	let i = 2;
	while (i + 9 < b.length) {
		if (b[i] !== 0xff) return null;
		const marker = b[i + 1];
		if (marker === 0xff) {
			i += 1;
			continue;
		}
		const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
		if (isSof) return { width: u16be(b, i + 7), height: u16be(b, i + 5) };
		i += 2 + u16be(b, i + 2);
	}
	return null;
}

export class ImageRejected extends Error {}

const HEADER_BYTES = 256 * 1024;

/**
 * Reads a dropped or picked file into a stored-ready image, or throws ImageRejected. The size is checked from the
 * header before decoding; the image is decoded straight at its stored size. JPEGs are always re-encoded, so camera
 * metadata (location) is not kept.
 */
export async function prepareImage(file: Blob): Promise<{ blob: Blob; mime: RasterMime; width: number; height: number }> {
	if (file.size > MAX_FILE_BYTES) throw new ImageRejected('This image is too large (over 50 MB).');
	const head = new Uint8Array(await file.slice(0, HEADER_BYTES).arrayBuffer());
	const mime = sniffImageType(head);
	if (!mime) throw new ImageRejected('Only PNG, JPEG, WebP and GIF images can be used.');
	const declared = headerSize(head, mime);
	if (declared && (declared.width < 1 || declared.height < 1)) throw new ImageRejected('This image could not be read.');
	if (declared && declared.width * declared.height > MAX_IMAGE_PIXELS) throw new ImageRejected('This image has too many pixels.');
	const source = new Blob([file], { type: mime });
	const target = declared ? fitWithin(declared.width, declared.height) : null;
	let bitmap: ImageBitmap;
	try {
		bitmap = await createImageBitmap(source, target ? { resizeWidth: target.width, resizeHeight: target.height, resizeQuality: 'high' } : undefined);
	} catch {
		throw new ImageRejected('This image could not be read.');
	}
	try {
		const size = fitWithin(bitmap.width, bitmap.height);
		const unchanged = declared && declared.width === size.width && declared.height === size.height;
		if (unchanged && mime !== 'image/jpeg' && file.size <= REENCODE_BYTES) return { blob: source, mime, width: size.width, height: size.height };
		const canvas = document.createElement('canvas');
		canvas.width = size.width;
		canvas.height = size.height;
		canvas.getContext('2d')!.drawImage(bitmap, 0, 0, size.width, size.height);
		// GIFs are kept as their first frame, in PNG
		const wanted: RasterMime = mime === 'image/gif' ? 'image/png' : mime;
		const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, wanted, 0.9));
		if (!blob) throw new ImageRejected('This image could not be resized.');
		// A browser that can't write the wanted type (WebP on Safari) writes PNG
		const outMime = sniffImageType(new Uint8Array(await blob.slice(0, 16).arrayBuffer())) ?? 'image/png';
		return { blob: new Blob([blob], { type: outMime }), mime: outMime, width: size.width, height: size.height };
	} finally {
		bitmap.close();
	}
}
