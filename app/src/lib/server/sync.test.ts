import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSync, type Kept } from './sync.ts';

const MINUTE = 60_000;
/** Lets promises that are already settled run their callbacks. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

/** A fetch that answers when told to, so a test can see what happens while it's waiting. */
function controlled<T>() {
	const calls: { resolve: (v: T) => void; reject: (e: unknown) => void }[] = [];
	const fetch = vi.fn(() => new Promise<T>((resolve, reject) => calls.push({ resolve, reject })));
	return { fetch, calls };
}

describe('createSync', () => {
	let now = Date.parse('2026-10-28T08:00:00Z');
	const clock = () => now;

	beforeEach(() => {
		now = Date.parse('2026-10-28T08:00:00Z');
		vi.spyOn(console, 'error').mockImplementation(() => {});
	});
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('waits for the first answer when there’s nothing to show', async () => {
		const sync = createSync({ name: 'Test', fetch: async () => 'first', everyMs: 10 * MINUTE, clock });
		expect(await sync.read()).toEqual({ value: 'first', at: '2026-10-28T08:00:00.000Z', error: null, needsAlex: null });
	});

	it('answers at once after that, and fetches in the background when the answer is due', async () => {
		const { fetch, calls } = controlled<string>();
		const sync = createSync({ name: 'Test', fetch, everyMs: 10 * MINUTE, clock });
		const first = sync.read();
		await settle();
		calls[0]!.resolve('first');
		await first;

		now += 5 * MINUTE;
		expect((await sync.read()).value).toBe('first');
		expect(fetch).toHaveBeenCalledTimes(1);

		now += 5 * MINUTE;
		expect((await sync.read()).value).toBe('first');
		expect(fetch).toHaveBeenCalledTimes(2);
		calls[1]!.resolve('second');
		await settle();
		expect((await sync.read()).value).toBe('second');
	});

	it('sends one request at a time, however many pages ask', async () => {
		const { fetch, calls } = controlled<string>();
		const sync = createSync({ name: 'Test', fetch, everyMs: 10 * MINUTE, clock });
		const reads = [sync.read(), sync.read(), sync.refresh()];
		await settle();
		expect(fetch).toHaveBeenCalledTimes(1);
		calls[0]!.resolve('only');
		await Promise.all(reads);
		expect(fetch).toHaveBeenCalledTimes(1);
	});

	it('keeps the last good answer when a fetch fails, and says why', async () => {
		let fail = false;
		const sync = createSync({
			name: 'Test',
			fetch: async () => {
				if (fail) throw new Error('offline');
				return 'good';
			},
			everyMs: 10 * MINUTE,
			clock
		});
		await sync.read();
		fail = true;
		now += 10 * MINUTE;
		await sync.refresh();
		const snapshot = await sync.read();
		expect(snapshot.value).toBe('good');
		expect(snapshot.at).toBe('2026-10-28T08:00:00.000Z');
		expect(snapshot.error).toEqual(new Error('offline'));
	});

	it('tries again sooner after a failure, then less often, up to its own interval', async () => {
		const fetch = vi.fn(async () => {
			throw new Error('offline');
		});
		const sync = createSync({ name: 'Test', fetch, everyMs: 2 * MINUTE, clock });
		await sync.read();
		const triesAfter = async (ms: number) => {
			now += ms;
			await sync.read();
			await settle();
			return fetch.mock.calls.length;
		};
		expect(await triesAfter(14_000)).toBe(1);
		expect(await triesAfter(1_000)).toBe(2); // 15 s
		expect(await triesAfter(29_000)).toBe(2);
		expect(await triesAfter(1_000)).toBe(3); // 30 s
		expect(await triesAfter(60_000)).toBe(4); // 1 min
		expect(await triesAfter(119_000)).toBe(4);
		expect(await triesAfter(1_000)).toBe(5); // 2 min, its own interval, not 4
	});

	it('needs Alex once failures have run for an hour, and logs it once', async () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		let fail = true;
		const sync = createSync({
			name: 'Octopus',
			fetch: async () => {
				if (fail) throw new Error('offline');
				return 'good';
			},
			everyMs: 10 * MINUTE,
			clock
		});
		await sync.read();
		for (let i = 0; i < 7; i++) {
			now += 10 * MINUTE;
			await sync.refresh();
		}
		expect((await sync.read()).needsAlex).toBe('2026-10-28T08:00:00.000Z');
		const hourLines = error.mock.calls.filter(([line]) => String(line).includes('over an hour'));
		expect(hourLines).toEqual([['Octopus sync failing for over an hour, since 2026-10-28T08:00:00.000Z']]);

		fail = false;
		await sync.refresh();
		expect((await sync.read()).needsAlex).toBeNull();
	});

	it('shows what was kept on disk straight away after a restart, and checks for something newer', async () => {
		const { fetch, calls } = controlled<string>();
		const sync = createSync({
			name: 'Test',
			fetch,
			everyMs: 10 * MINUTE,
			load: async () => ({ value: 'from disk', at: '2026-10-28T07:00:00.000Z' }),
			clock
		});
		expect(await sync.read()).toMatchObject({ value: 'from disk', at: '2026-10-28T07:00:00.000Z' });
		await settle();
		expect(fetch).toHaveBeenCalledTimes(1);
		calls[0]!.resolve('fresh');
	});

	it('keeps an answer on disk when it changes, and otherwise hourly', async () => {
		const saved: Kept<string>[] = [];
		let answer = 'a';
		const sync = createSync({
			name: 'Test',
			fetch: async () => answer,
			everyMs: 10 * MINUTE,
			save: async (k) => {
				saved.push(k);
			},
			clock
		});
		await sync.refresh();
		now += 10 * MINUTE;
		await sync.refresh();
		answer = 'b';
		now += 10 * MINUTE;
		await sync.refresh();
		now += 60 * MINUTE;
		await sync.refresh();
		expect(saved.map((k) => [k.value, k.at.slice(11, 16)])).toEqual([
			['a', '08:00'],
			['b', '08:20'],
			['b', '09:20']
		]);
	});

	it('carries on when the copy on disk can’t be read or written', async () => {
		const sync = createSync({
			name: 'Test',
			fetch: async () => 'fresh',
			everyMs: 10 * MINUTE,
			load: async () => {
				throw new SyntaxError('Unexpected end of JSON input');
			},
			save: async () => {
				throw new Error('disk full');
			},
			clock
		});
		expect((await sync.read()).value).toBe('fresh');
	});

	it('asks again as often as a changing interval says', async () => {
		let plugged = true;
		const fetch = vi.fn(async () => 'slots');
		const sync = createSync({ name: 'Slots', fetch, everyMs: () => (plugged ? 10 * MINUTE : 60 * MINUTE), clock });
		await sync.read();
		plugged = false;
		now += 10 * MINUTE;
		await sync.read();
		expect(fetch).toHaveBeenCalledTimes(1);
		plugged = true;
		await sync.read();
		expect(fetch).toHaveBeenCalledTimes(2);
	});
});
