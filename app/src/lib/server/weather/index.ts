import { CALENDAR_SOURCE, HOME_LATITUDE, HOME_LONGITUDE } from '$app/env/private';
import { sampleSun, type SunTimes } from '#lib/theme.ts';
import type { Weather } from '#lib/weather.ts';
import { orElse } from '../fallback.ts';
import { createSync, type Sync } from '../sync.ts';
import { fetchForecast, type Forecast } from './open-meteo.ts';

export const sampleWeather: Weather = { temperature: 11, summary: 'Light rain', icon: 'rain', high: 13, low: 8, rainChance: 70 };

// Open-Meteo updates every 15 minutes, so there's no point asking more often than this.
const REFRESH_MS = 10 * 60_000;
// Past this, an old forecast is more misleading than none.
const GIVE_UP_MS = 3 * 60 * 60_000;

let forecast: Sync<Forecast> | undefined;
// Sunrise and sunset move by a few minutes a day, so old ones are still good enough for the theme.
let lastSun: SunTimes | null = null;

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
	lastSun = value.sun;
	return Date.now() - Date.parse(at) < GIVE_UP_MS ? value.weather : null;
}

/** Today's sunrise and sunset at home, from the last forecast. Sample times until there is one. */
export function sunTimes(): SunTimes {
	return lastSun ?? sampleSun;
}
