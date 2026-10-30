import { RAIN_HOURS, type Weather, type WeatherIcon } from '#lib/weather.ts';
import type { SunTimes } from '#lib/theme.ts';
import { TIME_ZONE } from '#lib/time.ts';

const API = 'https://api.open-meteo.com/v1/forecast';

export interface ForecastResponse {
	current: { temperature_2m: number; weather_code: number; is_day: number };
	hourly: { precipitation_probability: (number | null)[] };
	/** Sunrise and sunset are local times, such as `2026-10-28T07:05`. */
	daily: { temperature_2m_max: number[]; temperature_2m_min: number[]; sunrise: string[]; sunset: string[] };
}

export interface Forecast {
	weather: Weather;
	sun: SunTimes;
}

export async function fetchForecast(latitude: string, longitude: string): Promise<Forecast> {
	const params = new URLSearchParams({
		latitude,
		longitude,
		current: 'temperature_2m,weather_code,is_day',
		hourly: 'precipitation_probability',
		forecast_hours: String(RAIN_HOURS),
		daily: 'temperature_2m_max,temperature_2m_min,sunrise,sunset',
		forecast_days: '1',
		timezone: TIME_ZONE
	});
	const response = await fetch(`${API}?${params}`, { signal: AbortSignal.timeout(10_000) });
	if (!response.ok) throw new Error(`Open-Meteo answered ${response.status}`);
	const forecast = (await response.json()) as ForecastResponse;
	return { weather: toWeather(forecast), sun: toSun(forecast) };
}

export function toWeather(forecast: ForecastResponse): Weather {
	const { current, hourly, daily } = forecast;
	const [summary, icon] = describe(current.weather_code, current.is_day === 1);
	return {
		temperature: Math.round(current.temperature_2m),
		summary,
		icon,
		high: Math.round(daily.temperature_2m_max[0]),
		low: Math.round(daily.temperature_2m_min[0]),
		rainChance: Math.max(0, ...hourly.precipitation_probability.map((p) => p ?? 0))
	};
}

export function toSun(forecast: ForecastResponse): SunTimes {
	return { sunrise: forecast.daily.sunrise[0]!.slice(11, 16), sunset: forecast.daily.sunset[0]!.slice(11, 16) };
}

// WMO weather codes, as Open-Meteo documents them.
function describe(code: number, isDay: boolean): [string, WeatherIcon] {
	const clear: WeatherIcon = isDay ? 'sun' : 'moon';
	switch (code) {
		case 0: return ['Clear', clear];
		case 1: return ['Mostly clear', clear];
		case 2: return ['Partly cloudy', isDay ? 'partly' : 'cloud'];
		case 3: return ['Cloudy', 'cloud'];
		case 45: case 48: return ['Fog', 'fog'];
		case 51: return ['Light drizzle', 'rain'];
		case 53: return ['Drizzle', 'rain'];
		case 55: return ['Heavy drizzle', 'rain'];
		case 56: case 57: return ['Freezing drizzle', 'rain'];
		case 61: return ['Light rain', 'rain'];
		case 63: return ['Rain', 'rain'];
		case 65: return ['Heavy rain', 'rain'];
		case 66: case 67: return ['Freezing rain', 'rain'];
		case 71: return ['Light snow', 'snow'];
		case 73: return ['Snow', 'snow'];
		case 75: return ['Heavy snow', 'snow'];
		case 77: return ['Snow grains', 'snow'];
		case 80: return ['Light showers', 'rain'];
		case 81: return ['Showers', 'rain'];
		case 82: return ['Heavy showers', 'rain'];
		case 85: return ['Light snow showers', 'snow'];
		case 86: return ['Snow showers', 'snow'];
		case 95: return ['Thunderstorm', 'storm'];
		case 96: case 99: return ['Thunderstorm with hail', 'storm'];
		default: return ['Unknown', 'cloud'];
	}
}
