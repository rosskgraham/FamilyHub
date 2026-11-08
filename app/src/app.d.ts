// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import type { CalendarStatus } from '#lib/calendar.ts';

declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		interface PageData {
			/**
			 * How fresh the Calendar is, for the corner of the bottom bar. The layout gives it for every page; a page that
			 * loads other days, such as a later week, gives its own instead.
			 */
			calendarStatus?: CalendarStatus;
		}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
