import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FrameSvg } from './FrameSvg';
import type { BoxElement, Frame, StoryboardSymbol } from '../types';

const board = { width: 1920, height: 1080 };
const frameWith = (...elements: BoxElement[]): Frame => ({ id: 'f1', time: 1, title: '', notes: '', background: '#000000', canvasX: 0, canvasY: 0, elements });
const box = (extra: Partial<BoxElement> = {}): BoxElement => ({ id: 'b1', type: 'box', x: 10, y: 10, w: 200, h: 100, rotation: 0, ...extra });
const render = (frame: Frame, props: { assetUrl?: (id: string) => string | null | undefined; resolveSymbol?: (id: string) => StoryboardSymbol | undefined } = {}) =>
	renderToStaticMarkup(createElement(FrameSvg, { frame, board, ...props }));

const DASHED = 'stroke-dasharray';

describe('a box', () => {
	it('without a picture: the dashed placeholder with its label', () => {
		const svg = render(frameWith(box({ label: 'coin' })), { assetUrl: () => 'data:x' });
		expect(svg).toContain(DASHED);
		expect(svg).toContain('>coin<');
		expect(svg).not.toContain('<image');
	});

	it('with its picture loaded: just the picture; the label stays its name only', () => {
		const svg = render(frameWith(box({ label: 'coin', assetId: 'a1' })), { assetUrl: () => 'data:image/png;base64,AA' });
		expect(svg).toContain('<image');
		expect(svg).not.toContain(DASHED);
		expect(svg).not.toContain('>coin<');
		expect(svg).toContain('data-label="coin"');
	});

	it('while its picture loads: nothing yet (no placeholder flashing first)', () => {
		const svg = render(frameWith(box({ label: 'coin', assetId: 'a1' })), { assetUrl: () => undefined });
		expect(svg).not.toContain('<image');
		expect(svg).not.toContain(DASHED);
	});

	it('with its picture missing on this device: the placeholder says so, under its name or on its own', () => {
		const named = render(frameWith(box({ label: 'logo', assetId: 'a1' })), { assetUrl: () => null });
		expect(named).toContain(DASHED);
		expect(named).toContain('>logo<');
		expect(named).toContain('>image missing<');
		const nameless = render(frameWith(box({ assetId: 'a1' })), { assetUrl: () => null });
		expect(nameless).toContain('>Image missing<');
		expect(nameless).not.toContain('>image missing<');
	});

	it("as a symbol instance: the symbol's picture, or its label on the placeholder", () => {
		const symbol: StoryboardSymbol = { id: 's1', label: 'coin', assetId: 'a1' };
		const withPicture = render(frameWith(box({ symbolId: 's1' })), { assetUrl: () => 'data:image/png;base64,AA', resolveSymbol: () => symbol });
		expect(withPicture).toContain('<image');
		expect(withPicture).not.toContain(DASHED);
		const noPicture = render(frameWith(box({ symbolId: 's1' })), { assetUrl: () => 'data:x', resolveSymbol: () => ({ id: 's1', label: 'coin' }) });
		expect(noPicture).toContain(DASHED);
		expect(noPicture).toContain('>coin<');
	});
});
