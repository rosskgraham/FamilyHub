import { beforeEach, describe, expect, it } from 'vitest';
import { warmth } from '#lib/pi-temperature.ts';
import { piTemperature, readTemperature, record, resetHighest } from './pi-temperature.ts';

const reads = (value: string) => () => value;
const missing = () => {
	throw new Error('ENOENT');
};

beforeEach(resetHighest);

describe('readTemperature', () => {
	it('reads millidegrees as °C, to a tenth', () => {
		expect(readTemperature(reads('52634\n'))).toBe(52.6);
	});

	it('has none on a PC', () => {
		expect(readTemperature(missing)).toBeNull();
	});

	it('has none when the kernel gives nonsense', () => {
		expect(readTemperature(reads('?'))).toBeNull();
	});
});

describe('piTemperature', () => {
	it('keeps the highest seen since start', () => {
		record(71.2);
		expect(piTemperature(reads('55000'))).toEqual({ now: 55, highest: 71.2 });
	});

	it('counts the reading it shows', () => {
		record(50);
		expect(piTemperature(reads('62000'))).toEqual({ now: 62, highest: 62 });
	});

	it('is null on a PC', () => {
		expect(piTemperature(missing)).toBeNull();
	});
});

describe('warmth', () => {
	it.each([
		[45, 'fine'],
		[69.9, 'fine'],
		[70, 'warm'],
		[79.9, 'warm'],
		[80, 'hot'],
		[86, 'hot']
	] as const)('%s °C is %s', (celsius, expected) => {
		expect(warmth(celsius)).toBe(expected);
	});
});
