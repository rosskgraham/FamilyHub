// Bin days: Events named like "Blue bin collection day", shown all day as the Household's, with a bin in its colour.
import { allDayOn, type CalendarEvent } from './calendar.ts';
import { EVERYONE } from './household.ts';

/** The council's bins. A colour not listed here isn't treated as a bin day. */
export const binColours = ['blue', 'grey', 'brown', 'purple'] as const;
export type BinColour = (typeof binColours)[number];

const BIN_DAY = /^\s*(blue|grey|gray|brown|purple)\s+bin\s+collection\s+day\s*$/i;

/**
 * A bin day as the Household's, titled "Blue bin", with its colour; any other Event as it is. Bins are everyone's job,
 * whoever's Calendar the recurring event is on. The council's calendar gives each one a time, such as 07:00, but it's
 * the day that matters, so it shows all day.
 */
export function asBinDay(event: CalendarEvent): CalendarEvent {
	const match = BIN_DAY.exec(event.title);
	if (!match) return event;
	const colour = match[1]!.toLowerCase().replace('gray', 'grey') as BinColour;
	return { ...allDayOn(event), title: `${colour[0]!.toUpperCase()}${colour.slice(1)} bin`, owner: EVERYONE, bin: colour };
}
