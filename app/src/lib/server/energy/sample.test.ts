import { describe, expect, it } from 'vitest';
import { sampleSlots, sampleUsage } from './sample.ts';

describe('sampleUsage', () => {
	it('has today up to now, with the Half-hour it’s in partly used', () => {
		const { today } = sampleUsage(new Date('2026-10-28T08:15:00Z'));
		expect(today).toHaveLength(17);
		expect(today[0]).toEqual({
			from: '2026-10-28T00:00:00.000Z',
			house: 0.18,
			car: 3.4
		});
		expect(today.at(-1)).toEqual({
			from: '2026-10-28T08:00:00.000Z',
			house: 0.21,
			car: 0
		});
	});

	it('has all of yesterday, 50 Half-hours the day the clocks went back', () => {
		expect(sampleUsage(new Date('2026-10-28T08:15:00Z')).yesterday).toHaveLength(48);
		expect(sampleUsage(new Date('2026-10-26T08:15:00Z')).yesterday).toHaveLength(50);
	});
});

describe('sampleSlots', () => {
	it('has a slot this afternoon', () => {
		expect(sampleSlots(new Date('2026-10-28T08:15:00Z'))).toEqual([
			{ from: '2026-10-28T13:00:00.000Z', to: '2026-10-28T14:30:00.000Z' }
		]);
	});
});
