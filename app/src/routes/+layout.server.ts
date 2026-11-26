import { loadCalendar } from '#lib/server/calendar/index.ts';
import { loadHeating } from '#lib/server/nest/index.ts';
import { loadWeather, sunTimes } from '#lib/server/weather/index.ts';
import { now } from '#lib/server/now.ts';
import { shoppingIsLive } from '#lib/server/shopping/index.ts';
import { readClockFormat, readSleepHours, readThemeChoice } from '#lib/server/settings.ts';
import { chosenTheme, themes } from '#lib/theme.ts';
import { addDays, dayKey } from '#lib/time.ts';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ url }) => {
	const today = dayKey(now());
	// Sleep shows the next Event, which overnight is usually tomorrow's first.
	const [weather, heating, calendar, clockFormat, themeChoice, sleepHours] = await Promise.all([
		loadWeather(),
		// `?heating=eco`, `off` or `not-reporting` shows that state of the sample heating, to try it on the PC.
		loadHeating(url.searchParams.get('heating')),
		loadCalendar(today, addDays(today, 2)),
		readClockFormat(),
		readThemeChoice(),
		readSleepHours()
	]);
	// `?theme=evening` or `?theme=day` shows that theme whatever the time, to try it on the PC.
	const asked = url.searchParams.get('theme');
	const theme = themes.find((t) => t === asked) ?? chosenTheme(themeChoice, now(), sunTimes(now()));
	return {
		weather,
		heating,
		theme,
		themeChoice,
		clockFormat,
		sleepHours,
		calendarStatus: calendar.status,
		sleep: { events: calendar.events, owners: calendar.household },
		// Only then does the screen listen for changes made on phones.
		liveUpdates: shoppingIsLive()
	};
};
