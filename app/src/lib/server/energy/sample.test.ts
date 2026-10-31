import { describe, expect, it } from 'vitest';
import { sampleRates } from './sample.ts';

describe('sampleRates', () => {
	it('covers today from midnight, before tomorrow’s are published', () => {
		const rates = sampleRates(new Date('2026-10-28T08:15:00Z'));
		expect(rates).toHaveLength(48);
		expect(rates[0]!.from).toBe('2026-10-28T00:00:00.000Z');
		expect(rates[16]).toEqual({ from: '2026-10-28T08:00:00.000Z', to: '2026-10-28T08:30:00.000Z', pence: 24.2 });
	});

	it('adds tomorrow from 16:00', () => {
		const rates = sampleRates(new Date('2026-10-28T16:00:00Z'));
		expect(rates).toHaveLength(96);
		expect(rates.some((r) => r.pence < 0)).toBe(true);
	});

	it('has 50 Half-hours on the day the clocks go back, and 46 when they go forward', () => {
		expect(sampleRates(new Date('2026-10-25T08:00:00Z'))).toHaveLength(50);
		expect(sampleRates(new Date('2026-03-29T08:00:00Z'))).toHaveLength(46);
	});
});
