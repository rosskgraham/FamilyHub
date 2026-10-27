import { CALENDAR_SOURCE, HOME_LATITUDE, HOME_LONGITUDE } from '$app/env/private';
import type { Weather } from '#lib/weather.ts';
import { fetchWeather } from './open-meteo.ts';

export const sampleWeather: Weather = { temperature: 11, summary: 'Light rain', icon: 'rain', high: 13, low: 8, rainChance: 70 };

// Open-Meteo updates every 15 minutes, so there's no point asking more often than this.
const REFRESH_MS = 10 * 60_000;
// Past this, an old forecast is more misleading than none.
const GIVE_UP_MS = 3 * 60 * 60_000;

let lastGood: { weather: Weather; at: number } | null = null;

/**
 * The weather at home from Open-Meteo once HOME_LATITUDE and HOME_LONGITUDE are set, otherwise sample weather.
 * CALENDAR_SOURCE=sample forces sample weather too. Null when there's been no forecast for a while.
 */
export async function loadWeather(): Promise<Weather | null> {
	if (CALENDAR_SOURCE === 'sample' || !HOME_LATITUDE || !HOME_LONGITUDE) return sampleWeather;
	if (lastGood && Date.now() - lastGood.at < REFRESH_MS) return lastGood.weather;
	try {
		lastGood = { weather: await fetchWeather(HOME_LATITUDE, HOME_LONGITUDE), at: Date.now() };
		return lastGood.weather;
	} catch (e) {
		console.error('Weather fetch failed:', e);
		return lastGood && Date.now() - lastGood.at < GIVE_UP_MS ? lastGood.weather : null;
	}
}
