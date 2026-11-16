import { describe, expect, it } from 'vitest';
import { sampleCharge, sampleSlots, sampleUsage } from './sample.ts';

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

describe('sampleCharge', () => {
	it('rises with the night’s charging from 52% to its 80% limit, then holds there, read every 10 minutes', () => {
		const { charge, chargeToday } = sampleCharge(new Date('2026-10-28T08:15:00Z'));
		expect(chargeToday).toHaveLength(50);
		expect(chargeToday[0]).toEqual({ at: '2026-10-28T00:00:00.000Z', percent: 52 });
		// Half an hour in, 3.4 kWh of 77.
		expect(chargeToday[3]).toEqual({ at: '2026-10-28T00:30:00.000Z', percent: 56.4 });
		expect(chargeToday.at(-1)).toEqual({ at: '2026-10-28T08:10:00.000Z', percent: 80 });
		expect(charge).toEqual({ at: '2026-10-28T08:10:00.000Z', percent: 80, limit: 80 });
	});
});
