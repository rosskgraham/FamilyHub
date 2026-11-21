import { loadCalendar } from '#lib/server/calendar/index.ts';
import { loadWeather, sunTimes } from '#lib/server/weather/index.ts';
import { now } from '#lib/server/now.ts';
import { readClockFormat, readThemeChoice } from '#lib/server/settings.ts';
import { chosenTheme, themes } from '#lib/theme.ts';
import { addDays, dayKey } from '#lib/time.ts';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ url }) => {
	const today = dayKey(now());
	// Sleep shows the next Event, which overnight is usually tomorrow's first.
	const [weather, calendar, clockFormat, themeChoice] = await Promise.all([
		loadWeather(),
		loadCalendar(today, addDays(today, 2)),
		readClockFormat(),
		readThemeChoice()
	]);
	// `?theme=evening` or `?theme=day` shows that theme whatever the time, to try it on the PC.
	const asked = url.searchParams.get('theme');
	const theme = themes.find((t) => t === asked) ?? chosenTheme(themeChoice, now(), sunTimes(now()));
	return {
		weather,
		theme,
		themeChoice,
		clockFormat,
		calendarStatus: calendar.status,
		sleep: { events: calendar.events, owners: calendar.household }
	};
};
