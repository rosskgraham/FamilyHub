import { loadWeather, sunTimes } from '#lib/server/weather/index.ts';
import { now } from '#lib/server/now.ts';
import { themeAt, themes } from '#lib/theme.ts';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ url }) => {
	const weather = await loadWeather();
	// `?theme=evening` or `?theme=day` shows that theme whatever the time, to try it on the PC.
	const asked = url.searchParams.get('theme');
	const theme = themes.find((t) => t === asked) ?? themeAt(now(), sunTimes());
	return { weather, theme };
};
