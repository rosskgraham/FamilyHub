import { describe, expect, it } from 'vitest';
import type { CalendarEvent } from '#lib/calendar.ts';
import { fromCache, remember, type CalendarCache } from './cache.ts';

const timed = (id: string, start: string, end: string): CalendarEvent => ({ id, title: id, owner: 'alex', allDay: false, start, end });
const allDay = (id: string, start: string, end: string): CalendarEvent => ({ ...timed(id, start, end), allDay: true });

const swim = timed('swim', '2026-10-29T17:00:00.000Z', '2026-10-29T18:00:00.000Z');
const parkrun = timed('parkrun', '2026-10-31T08:00:00.000Z', '2026-10-31T09:00:00.000Z');
const bins = allDay('bins', '2026-10-29', '2026-10-30');

describe('fromCache', () => {
	const cache: CalendarCache = {
		'2026-10-28/2026-11-02': { events: [swim, parkrun, bins], at: '2026-10-28T23:50:00.000Z' }
	};

	it('answers a range it has from that range', () => {
		expect(fromCache(cache, '2026-10-28', '2026-11-02')).toEqual(cache['2026-10-28/2026-11-02']);
	});

	it('answers a new day’s range from the ranges that overlap it, leaving out what falls outside', () => {
		// After midnight the Today view asks for 29 October onwards, which was never loaded.
		expect(fromCache(cache, '2026-10-30', '2026-11-04')).toEqual({ events: [parkrun], at: '2026-10-28T23:50:00.000Z' });
		expect(fromCache(cache, '2026-10-29', '2026-10-30').events).toEqual([swim, bins]);
	});

	it('takes the newest version of an Event, and the oldest time, so it never looks fresher than it is', () => {
		const moved = { ...swim, title: 'Swimming, moved' };
		const both: CalendarCache = {
			'2026-10-28/2026-10-30': { events: [swim], at: '2026-10-28T08:00:00.000Z' },
			'2026-10-29/2026-10-31': { events: [moved], at: '2026-10-28T20:00:00.000Z' }
		};
		expect(fromCache(both, '2026-10-29', '2026-10-30')).toEqual({ events: [moved], at: '2026-10-28T08:00:00.000Z' });
	});

	it('has nothing for days it never saw', () => {
		expect(fromCache(cache, '2026-12-01', '2026-12-02')).toEqual({ events: [], at: null });
	});
});

describe('remember', () => {
	it('adds the range and forgets ranges that ended over a week ago', () => {
		const old: CalendarCache = { '2026-10-10/2026-10-15': { events: [], at: '2026-10-10T08:00:00.000Z' } };
		const result = remember(old, '2026-10-28', '2026-11-02', [swim], '2026-10-28T08:00:00.000Z', '2026-10-28');
		expect(Object.keys(result)).toEqual(['2026-10-28/2026-11-02']);
	});
});
