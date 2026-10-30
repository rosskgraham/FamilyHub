import { describe, expect, it } from 'vitest';
import { toSun, toWeather, type ForecastResponse } from './open-meteo.ts';

const forecast = (code: number, isDay = 1, rain: (number | null)[] = [10, 40, 20]): ForecastResponse => ({
	current: { temperature_2m: 11.6, weather_code: code, is_day: isDay },
	hourly: { precipitation_probability: rain },
	daily: { temperature_2m_max: [13.4], temperature_2m_min: [7.5], sunrise: ['2026-10-28T07:05'], sunset: ['2026-10-28T16:41'] }
});

describe('toWeather', () => {
	it('rounds temperatures and takes the highest chance of rain', () => {
		expect(toWeather(forecast(61))).toEqual({
			temperature: 12,
			summary: 'Light rain',
			icon: 'rain',
			high: 13,
			low: 8,
			rainChance: 40
		});
	});

	it('shows a moon on clear nights', () => {
		expect(toWeather(forecast(0, 1)).icon).toBe('sun');
		expect(toWeather(forecast(0, 0)).icon).toBe('moon');
	});

	it.each([
		[3, 'Cloudy', 'cloud'],
		[45, 'Fog', 'fog'],
		[73, 'Snow', 'snow'],
		[95, 'Thunderstorm', 'storm']
	])('describes WMO code %i as %s', (code, summary, icon) => {
		expect(toWeather(forecast(code))).toMatchObject({ summary, icon });
	});

	it('copes with unknown codes and missing rain chances', () => {
		const weather = toWeather(forecast(42, 1, [null, null, null]));
		expect(weather).toMatchObject({ summary: 'Unknown', icon: 'cloud', rainChance: 0 });
	});
});

describe('toSun', () => {
	it('takes today’s sunrise and sunset as UK times', () => {
		expect(toSun(forecast(0))).toEqual({ sunrise: '07:05', sunset: '16:41' });
	});
});
