// Made-up rates, slots and usage, as in the Energy mockups: the car charged overnight, and a slot this afternoon.
import { halfHoursOf, type HalfHourUse, type Live, type Rates, type Slot } from '#lib/energy.ts';
import { addDays, dayKey, formatTime, ukTime } from '#lib/time.ts';

export const sampleTariff: { name: string; rates: Rates } = {
	name: 'Intelligent Octopus Go',
	rates: { peak: 27.4, offPeak: 7.5 }
};

// kWh for each wall-clock Half-hour from 00:00.
const HOUSE = [
	0.18, 0.15, 0.14, 0.14, 0.13, 0.13, 0.14, 0.13, 0.13, 0.14, 0.15, 0.16, 0.32, 0.45, 0.52, 0.48, 0.42, 0.3, 0.22, 0.2,
	0.19, 0.2, 0.21, 0.24, 0.3, 0.28, 0.22, 0.2, 0.2, 0.21, 0.24, 0.3, 0.38, 0.45, 0.62, 0.7, 0.66, 0.55, 0.48, 0.42, 0.4,
	0.38, 0.36, 0.33, 0.3, 0.27, 0.24, 0.2
];
const CAR = [3.4, 3.4, 3.4, 3.4, 3.4, 3.4, 1.2, ...Array<number>(41).fill(0)];

export function sampleSlots(now: Date): Slot[] {
	const today = dayKey(now);
	return [
		{
			from: ukTime(today, '13:00').toISOString(),
			to: ukTime(today, '14:30').toISOString()
		}
	];
}

/** A day's use up to `until`, with the Half-hour it's in only partly used. */
function day(key: string, until: Date): HalfHourUse[] {
	const use: HalfHourUse[] = [];
	for (const from of halfHoursOf(key)) {
		if (from >= until) break;
		const [hour, minute] = formatTime(from).split(':').map(Number) as [number, number];
		const i = hour * 2 + (minute >= 30 ? 1 : 0);
		const part = Math.min(1, (until.getTime() - from.getTime()) / (30 * 60_000));
		use.push({
			from: from.toISOString(),
			house: Math.round(HOUSE[i]! * part * 100) / 100,
			car: Math.round(CAR[i]! * part * 100) / 100
		});
	}
	return use;
}

export function sampleUsage(now: Date): {
	today: HalfHourUse[];
	yesterday: HalfHourUse[];
	live: Live;
} {
	const today = dayKey(now);
	return {
		today: day(today, now),
		yesterday: day(addDays(today, -1), ukTime(today, '00:00')),
		live: { watts: 800, car: 'plugged' }
	};
}
