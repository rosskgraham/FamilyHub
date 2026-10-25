import { fakeCalendar } from './fake.ts';
import type { CalendarSource } from './source.ts';

// Fake data until the Google Calendar step adds a real source.
export const calendar: CalendarSource = fakeCalendar;
