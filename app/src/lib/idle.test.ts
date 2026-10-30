import { describe, expect, it } from 'vitest';
import { returnsToToday } from './idle.ts';

describe('returnsToToday', () => {
	const touched = new Date('2026-10-28T08:15:00Z');
	const after = (seconds: number) => new Date(touched.getTime() + seconds * 1000);

	it('goes back two minutes after the last touch, not before', () => {
		expect(returnsToToday('/week', after(119), touched)).toBe(false);
		expect(returnsToToday('/week', after(120), touched)).toBe(true);
	});

	it('stays put on the Today view and while setting up Google', () => {
		expect(returnsToToday('/', after(600), touched)).toBe(false);
		expect(returnsToToday('/setup', after(600), touched)).toBe(false);
	});
});
