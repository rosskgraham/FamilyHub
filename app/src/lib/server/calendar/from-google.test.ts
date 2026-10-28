import { describe, expect, it } from 'vitest';
import { toEvents, withoutDuplicates, type GoogleEvent } from './from-google.ts';

const meeting: GoogleEvent = {
	id: 'abc',
	iCalUID: 'abc@google.com',
	summary: 'Parents evening',
	start: { dateTime: '2026-10-28T18:00:00+00:00' },
	end: { dateTime: '2026-10-28T19:00:00+00:00' }
};

describe('toEvents', () => {
	it('turns a timed Google event into an Event for the owner', () => {
		expect(toEvents([meeting], 'sam')).toEqual([
			{
				id: 'abc@google.com',
				title: 'Parents evening',
				owner: 'sam',
				allDay: false,
				start: '2026-10-28T18:00:00.000Z',
				end: '2026-10-28T19:00:00.000Z'
			}
		]);
	});

	it('normalises offsets to UTC instants', () => {
		const summer = { ...meeting, start: { dateTime: '2026-07-01T09:00:00+01:00' }, end: { dateTime: '2026-07-01T10:00:00+01:00' } };
		expect(toEvents([summer], 'sam')[0]!.start).toBe('2026-07-01T08:00:00.000Z');
	});

	it('keeps all-day events as days', () => {
		const bins = { id: 'bins', summary: 'Bin day', start: { date: '2026-10-29' }, end: { date: '2026-10-30' } };
		expect(toEvents([bins], 'everyone')[0]).toMatchObject({ allDay: true, start: '2026-10-29', end: '2026-10-30' });
	});

	it('falls back to the event id and a placeholder title', () => {
		const bare = { id: 'x1', start: meeting.start, end: meeting.end };
		expect(toEvents([bare], 'sam')[0]).toMatchObject({ id: 'x1', title: '(No title)' });
	});

	it('leaves out cancelled events and ones the owner declined', () => {
		const cancelled = { ...meeting, status: 'cancelled' };
		const declined = { ...meeting, attendees: [{ self: true, responseStatus: 'declined' }] };
		const someoneElseDeclined = { ...meeting, attendees: [{ responseStatus: 'declined' }, { self: true, responseStatus: 'accepted' }] };
		expect(toEvents([cancelled, declined], 'sam')).toEqual([]);
		expect(toEvents([someoneElseDeclined], 'sam')).toHaveLength(1);
	});
});

describe('withoutDuplicates', () => {
	it('shows an Event on two Calendars once, under the first owner', () => {
		const events = [...toEvents([meeting], 'alex'), ...toEvents([meeting], 'everyone')];
		expect(withoutDuplicates(events).map((e) => e.owner)).toEqual(['alex']);
	});

	it('keeps each occurrence of a repeating Event', () => {
		const nextWeek = { ...meeting, start: { dateTime: '2026-11-04T18:00:00Z' }, end: { dateTime: '2026-11-04T19:00:00Z' } };
		expect(withoutDuplicates(toEvents([meeting, nextWeek], 'alex'))).toHaveLength(2);
	});
});
