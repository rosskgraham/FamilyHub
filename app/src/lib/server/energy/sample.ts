// Made-up Agile rates with a realistic shape: cheap overnight and early afternoon, dear from 16:00 to 19:00.
import { TOMORROW_FROM, type Rate } from '#lib/energy.ts';
import { addDays, dayKey, formatTime, ukTime, type DayKey } from '#lib/time.ts';

// Pence per kWh for each wall-clock Half-hour from 00:00, as in the Energy mockups.
const TODAY = [
	14.1, 13.6, 12.9, 12.4, 11.8, 11.2, 10.9, 10.6, 10.9, 11.5, 12.8, 14.2, 17.9, 20.4, 23.1, 24.8,
	24.2, 22.6, 20.1, 18.7, 16.9, 15.2, 13.4, 12.1, 10.8, 9.6, 8.9, 8.4, 8.7, 9.5, 11.9, 14.8,
	29.6, 33.4, 36.2, 35.1, 31.8, 27.3, 22.4, 20.9, 19.6, 18.2, 17.4, 16.1, 15.3, 14.6, 14.0, 13.2
];
// A windy night, so Agile pays for a while.
const TOMORROW = TODAY.map((p, i) => (i === 6 ? -1.4 : i === 7 ? -2.1 : Math.round(p * 9) / 10));

/** Every Half-hour of a UK day: 48, or 46 and 50 when the clocks change. */
function halfHours(day: DayKey, prices: number[]): Rate[] {
	const end = ukTime(addDays(day, 1), '00:00').getTime();
	const rates: Rate[] = [];
	for (let t = ukTime(day, '00:00').getTime(); t < end; t += 30 * 60_000) {
		const [hour, minute] = formatTime(new Date(t)).split(':').map(Number) as [number, number];
		rates.push({
			from: new Date(t).toISOString(),
			to: new Date(t + 30 * 60_000).toISOString(),
			pence: prices[hour * 2 + (minute >= 30 ? 1 : 0)]!
		});
	}
	return rates;
}

/** Today's sample rates, and tomorrow's once they'd have been published. */
export function sampleRates(now: Date): Rate[] {
	const today = dayKey(now);
	const rates = halfHours(today, TODAY);
	return formatTime(now) >= TOMORROW_FROM ? [...rates, ...halfHours(addDays(today, 1), TOMORROW)] : rates;
}
