import { describe, expect, it } from 'vitest';
import { openUsageStore } from './usage-store.ts';

const half = (from: string, house: number, minutes = 30) => ({
	from: `2026-10-28T${from}:00.000Z`,
	house,
	car: 0,
	minutes
});

describe('openUsageStore', () => {
	it('gives back the Half-hours in a range, in time order', () => {
		const store = openUsageStore(':memory:');
		store.save([half('08:00', 0.4), half('07:30', 0.3), half('09:00', 0.5)]);
		expect(store.between(new Date('2026-10-28T07:30:00Z'), new Date('2026-10-28T09:00:00Z'))).toEqual([
			{ from: '2026-10-28T07:30:00.000Z', house: 0.3, car: 0 },
			{ from: '2026-10-28T08:00:00.000Z', house: 0.4, car: 0 }
		]);
		store.close();
	});

	it('replaces a Half-hour as it fills up, but never with less of it', () => {
		const store = openUsageStore(':memory:');
		store.save([half('08:00', 0.1, 10)]);
		store.save([half('08:00', 0.4, 30)]);
		store.save([half('08:00', 0.2, 12)]);
		expect(store.between(new Date('2026-10-28T08:00:00Z'), new Date('2026-10-28T08:30:00Z'))[0]!.house).toBe(0.4);
		store.close();
	});
});
