// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import type { CalendarStatus } from '#lib/calendar.ts';
import type { ThemeChoice } from '#lib/theme.ts';
import type { ClockFormat } from '#lib/time.ts';

declare global {
	// Set by vite.config.ts when the Hub is built. Read through src/lib/build.ts.
	const __HUB_RELEASE__: boolean;
	const __HUB_COMMIT__: string;
	const __HUB_BUILT_AT__: string;

	namespace App {
		// interface Error {}
		// interface Locals {}
		interface PageData {
			/**
			 * How fresh the Calendar is, for the corner of the bottom bar. The layout gives it for every page; a page that
			 * loads other days, such as a later week, gives its own instead.
			 */
			calendarStatus?: CalendarStatus;
			/** How times are shown, chosen in Settings. The layout gives it for every page. */
			clockFormat?: ClockFormat;
			/** Auto, Light or Dark, chosen in Settings. The layout gives it for every page. */
			themeChoice?: ThemeChoice;
		}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
