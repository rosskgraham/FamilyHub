import { loadWeather } from '#lib/server/weather/index.ts';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async () => ({ weather: await loadWeather() });
