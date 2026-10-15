import { describe, expect, it } from 'vitest';
import { formatPreciseTime, parseTime } from './time';

describe('precise times', () => {
	it('formats m:ss.mmm', () => {
		expect(formatPreciseTime(63)).toBe('1:03.000');
		expect(formatPreciseTime(65.4567)).toBe('1:05.457');
		expect(formatPreciseTime(5)).toBe('0:05.000');
	});

	it('parses m:ss.mmm, seconds, and rejects junk', () => {
		expect(parseTime('1:03.000')).toBe(63);
		expect(parseTime(' 65.5 ')).toBe(65.5);
		expect(parseTime('2:5')).toBe(125);
		expect(parseTime('1:75')).toBeNull();
		expect(parseTime('abc')).toBeNull();
		expect(parseTime('')).toBeNull();
	});
});
