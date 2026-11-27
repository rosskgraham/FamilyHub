import { describe, expect, it } from 'vitest';
import { describeUpdate, NO_ANSWER_MS, type UpdateStatus } from './update-status.ts';

const ASKED = '2026-11-27T10:00:00.000Z';
const at = (seconds: number) => new Date(Date.parse(ASKED) + seconds * 1000);
const status = (over: Partial<UpdateStatus>): UpdateStatus => ({
	state: 'checking',
	version: '2026.11.27.3',
	message: '',
	at: at(1).toISOString(),
	...over
});

describe('describeUpdate', () => {
	it('says nothing before anyone has asked, when the updater has never said anything', () => {
		expect(describeUpdate(null, null, at(0))).toBeNull();
	});

	it('shows what the updater last said, even when it ran on its timer', () => {
		expect(describeUpdate(status({ state: 'up-to-date', at: at(-600).toISOString() }), null, at(0))?.text).toBe(
			'Up to date: 2026.11.27.3'
		);
	});

	it('waits for the updater after asking, and ignores what it said before', () => {
		const before = status({ state: 'up-to-date', at: at(-600).toISOString() });
		expect(describeUpdate(before, ASKED, at(2))).toEqual({
			text: 'Asking the Pi to check…',
			busy: true,
			failed: false
		});
	});

	it('says the updater never started if it says nothing for a while after asking', () => {
		const line = describeUpdate(null, ASKED, at(NO_ANSWER_MS / 1000));
		expect(line?.failed).toBe(true);
		expect(line?.busy).toBe(false);
		expect(line?.text).toMatch(/hasn’t started/);
	});

	it('words each step the updater goes through', () => {
		const words = (over: Partial<UpdateStatus>) => describeUpdate(status(over), ASKED, at(5));
		expect(words({ state: 'checking' })).toEqual({ text: 'Checking for a new version…', busy: true, failed: false });
		expect(words({ state: 'installing', version: '2026.11.27.4' })).toEqual({
			text: 'Installing 2026.11.27.4… The Hub restarts while it does.',
			busy: true,
			failed: false
		});
		expect(words({ state: 'up-to-date' })).toEqual({ text: 'Up to date: 2026.11.27.3', busy: false, failed: false });
		expect(words({ state: 'installed', version: '2026.11.27.4' })).toEqual({
			text: 'Installed 2026.11.27.4',
			busy: false,
			failed: false
		});
		expect(words({ state: 'failed', message: 'GitHub answered 503' })).toEqual({
			text: 'Couldn’t update. GitHub answered 503',
			busy: false,
			failed: true
		});
	});
});
