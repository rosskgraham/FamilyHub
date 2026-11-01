// Birthdays: Events from the Birthdays calendar, shown all day as the Household's, with a cake.
import { allDayOn, type CalendarEvent } from './calendar.ts';
import { EVERYONE } from './household.ts';

/** An Event from the Birthdays calendar as everyone's, all day, with a cake. Its title stays as it is. */
export function asBirthday(event: CalendarEvent): CalendarEvent {
	return { ...allDayOn(event), owner: EVERYONE, birthday: true };
}
