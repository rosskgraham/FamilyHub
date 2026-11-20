import { describe, expect, it } from 'vitest';
import { reloadsForRelease, returnsToToday } from './idle.ts';

describe('returnsToToday', () => {
	const touched = new Date('2026-10-28T08:15:00Z');
	const after = (seconds: number) => new Date(touched.getTime() + seconds * 1000);

	it('goes back two minutes after the last touch, not before', () => {
		expect(returnsToToday('/week', after(119), touched)).toBe(false);
		expect(returnsToToday('/week', after(120), touched)).toBe(true);
	});

	it('stays put on the Today view and while signing in to Google', () => {
		expect(returnsToToday('/', after(600), touched)).toBe(false);
		expect(returnsToToday('/auth/google/callback', after(600), touched)).toBe(false);
	});
});

describe('reloadsForRelease', () => {
	const touched = new Date('2026-10-28T08:15:00Z');
	const after = (seconds: number) => new Date(touched.getTime() + seconds * 1000);

	it('reloads for a new release once the Hub has been left alone for two minutes', () => {
		expect(reloadsForRelease(true, '/', after(119), touched)).toBe(false);
		expect(reloadsForRelease(true, '/', after(120), touched)).toBe(true);
		expect(reloadsForRelease(true, '/energy', after(120), touched)).toBe(true);
	});

	it("doesn't reload without a new release, or while signing in to Google", () => {
		expect(reloadsForRelease(false, '/', after(600), touched)).toBe(false);
		expect(reloadsForRelease(true, '/auth/google/callback', after(600), touched)).toBe(false);
	});
});
