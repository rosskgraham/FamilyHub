import { sampleWeather } from '#lib/sample.ts';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = () => ({ weather: sampleWeather });
