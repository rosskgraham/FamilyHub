import { page } from '$app/state';
import { DEFAULT_CLOCK_FORMAT, formatTime, type ClockFormat } from './time.ts';

// Times shown to people follow the clock format chosen in Settings. Read while a component renders, as `page` is.

export function clockFormat(): ClockFormat {
	return page.data.clockFormat ?? DEFAULT_CLOCK_FORMAT;
}

/** A Date or ISO time, as the Household has chosen to see it: "15:04" or "3:04 pm". */
export function showTime(at: Date | string): string {
	// Made to be formatted then thrown away, so it doesn't need to be a SvelteDate.
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	return formatTime(typeof at === 'string' ? new Date(at) : at, clockFormat());
}
