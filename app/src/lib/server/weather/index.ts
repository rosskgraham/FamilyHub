import { CALENDAR_SOURCE, HOME_LATITUDE, HOME_LONGITUDE } from '$app/env/private';
import { sunTimesOn } from '#lib/sun.ts';
import { sampleSun, type SunTimes } from '#lib/theme.ts';
import { dayKey } from '#lib/time.ts';
import type { Weather } from '#lib/weather.ts';
import { orElse } from '../fallback.ts';
import { createSync, type Sync } from '../sync.ts';
import { fetchForecast } from './open-meteo.ts';

export const sampleWeather: Weather = {
	temperature: 11,
	summary: 'Light rain',
	icon: 'rain',
	high: 13,
	low: 8,
	rainChance: 70
};

// Open-Meteo updates every 15 minutes, so there's no point asking more often than this.
const REFRESH_MS = 10 * 60_000;
// Past this, an old forecast is more misleading than none.
const GIVE_UP_MS = 3 * 60 * 60_000;

let forecast: Sync<Weather> | undefined;

/**
 * The weather at home from Open-Meteo once HOME_LATITUDE and HOME_LONGITUDE are set, otherwise sample weather.
 * CALENDAR_SOURCE=sample forces sample weather too. Null when there's been no forecast for a while.
 */
export function loadWeather(): Promise<Weather | null> {
	return orElse('Weather', loadForecast, null);
}

async function loadForecast(): Promise<Weather | null> {
	if (CALENDAR_SOURCE === 'sample' || !HOME_LATITUDE || !HOME_LONGITUDE) return sampleWeather;
	forecast ??= createSync({
		name: 'Weather',
		fetch: () => fetchForecast(HOME_LATITUDE!, HOME_LONGITUDE!),
		everyMs: REFRESH_MS
	});
	const { value, at } = await forecast.read();
	if (!value || !at) return null;
	return Date.now() - Date.parse(at) < GIVE_UP_MS ? value : null;
}

/**
 * Sunrise and sunset at home on the day of `at`, worked out from where home is, so the theme is right even after a
 * restart with no internet. Sample times when home isn't set, or with CALENDAR_SOURCE=sample.
 */
export function sunTimes(at: Date): SunTimes {
	if (CALENDAR_SOURCE === 'sample' || !HOME_LATITUDE || !HOME_LONGITUDE) return sampleSun;
	return sunTimesOn(dayKey(at), Number(HOME_LATITUDE), Number(HOME_LONGITUDE));
}
