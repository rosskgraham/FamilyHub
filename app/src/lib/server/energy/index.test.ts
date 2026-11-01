import type { Live, Slot } from '#lib/energy.ts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Minute } from './myenergi.ts';
import { UnsupportedTariff, type Tariff } from './octopus.ts';
import { sampleTariff } from './sample.ts';
import { openUsageStore } from './usage-store.ts';

vi.mock('$app/env/private', () => ({}));
const { createEnergy, HISTORY_MS, LIVE_STALE_MS, SLOTS_MS, SLOTS_UNPLUGGED_MS } = await import('./index.ts');

const MINUTE = 60_000;
/** Lets fetches started in the background finish. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

/** An Octopus that answers with whatever the test sets, and counts what it's asked. */
function fakeOctopus() {
	const octopus = {
		tariffAnswer: sampleTariff as Tariff | Error,
		slotsAnswer: [] as Slot[] | Error,
		asked: { tariff: 0, slots: 0 },
		async tariff() {
			octopus.asked.tariff++;
			if (octopus.tariffAnswer instanceof Error) throw octopus.tariffAnswer;
			return octopus.tariffAnswer;
		},
		async slots() {
			octopus.asked.slots++;
			if (octopus.slotsAnswer instanceof Error) throw octopus.slotsAnswer;
			return octopus.slotsAnswer;
		}
	};
	return octopus;
}

/** A Zappi that answers with whatever the test sets, and records which days' history it's asked for. */
function fakeZappi() {
	const zappi = {
		liveAnswer: { watts: 800, car: 'plugged' } as Live | Error,
		history: new Map<string, Minute[]>(),
		days: [] as string[],
		async live() {
			if (zappi.liveAnswer instanceof Error) throw zappi.liveAnswer;
			return zappi.liveAnswer;
		},
		async minutes(day: string) {
			zappi.days.push(day);
			return zappi.history.get(day) ?? [];
		}
	};
	return zappi;
}

/** The data folder, in memory. */
function memoryFiles() {
	const saved = new Map<string, string>();
	return {
		saved,
		read: async <T>(name: string) => (saved.has(name) ? (JSON.parse(saved.get(name)!) as T) : null),
		write: async (name: string, value: unknown) => void saved.set(name, JSON.stringify(value))
	};
}

/** Two minutes' use at `at`: 0.5 kWh each from the grid, 0.3 of it to the Car. */
const used = (at: string): Minute[] => [
	{ at, imported: 1_800_000, car: 1_080_000 },
	{ at: new Date(Date.parse(at) + MINUTE).toISOString(), imported: 1_800_000, car: 1_080_000 }
];

describe('createEnergy', () => {
	// Wednesday 28 October 2026, 08:15, after the clocks went back, so UK time is UTC.
	let now = Date.parse('2026-10-28T08:15:00Z');
	const clock = () => now;
	let octopus: ReturnType<typeof fakeOctopus>;
	let zappi: ReturnType<typeof fakeZappi>;
	let files: ReturnType<typeof memoryFiles>;

	function energy(sources: { octopus?: typeof octopus | null; zappi?: typeof zappi | null } = {}) {
		return createEnergy({
			octopus: sources.octopus === undefined ? octopus : sources.octopus,
			zappi: sources.zappi === undefined ? zappi : sources.zappi,
			openStore: () => openUsageStore(':memory:'),
			files,
			clock
		});
	}

	beforeEach(() => {
		now = Date.parse('2026-10-28T08:15:00Z');
		octopus = fakeOctopus();
		zappi = fakeZappi();
		files = memoryFiles();
		vi.spyOn(console, 'error').mockImplementation(() => {});
	});
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('shows samples for whatever isn’t set up', async () => {
		const result = await energy({ octopus: null, zappi: null })();
		expect(result.status).toEqual({ kind: 'sample' });
		expect(result.usageStatus).toEqual({ kind: 'sample' });
	});

	describe('Octopus', () => {
		const lastNight: Slot = { from: '2026-10-28T02:00:00.000Z', to: '2026-10-28T03:00:00.000Z' };
		const tonight: Slot = { from: '2026-10-28T23:00:00.000Z', to: '2026-10-29T01:00:00.000Z' };

		it('shows the tariff and slots, live', async () => {
			octopus.slotsAnswer = [lastNight, tonight];
			const result = await energy()();
			expect(result.tariff).toEqual(sampleTariff);
			expect(result.slots).toEqual([lastNight, tonight]);
			expect(result.status).toEqual({ kind: 'live', updatedAt: '2026-10-28T08:15:00.000Z' });
		});

		it('keeps a slot that’s over after Octopus stops listing it, so its Half-hours still cost the Off-peak rate', async () => {
			const load = energy();
			octopus.slotsAnswer = [lastNight, tonight];
			await load();
			octopus.slotsAnswer = [tonight];
			now += SLOTS_MS;
			await load();
			await settle();
			expect((await load()).slots).toEqual([lastNight, tonight]);
		});

		it('lets a planned slot go when Octopus moves it', async () => {
			const load = energy();
			const moved: Slot = { from: '2026-10-29T02:00:00.000Z', to: '2026-10-29T03:00:00.000Z' };
			octopus.slotsAnswer = [tonight];
			await load();
			octopus.slotsAnswer = [moved];
			now += SLOTS_MS;
			await load();
			await settle();
			expect((await load()).slots).toEqual([moved]);
		});

		it('drops slots from before yesterday', async () => {
			const load = energy();
			octopus.slotsAnswer = [lastNight];
			await load();
			octopus.slotsAnswer = [];
			now = Date.parse('2026-10-30T08:15:00Z');
			await load();
			await settle();
			expect((await load()).slots).toEqual([]);
		});

		it('still has yesterday’s slots after a restart with no internet', async () => {
			octopus.slotsAnswer = [lastNight];
			await energy()();
			octopus.slotsAnswer = new TypeError('fetch failed');
			octopus.tariffAnswer = new TypeError('fetch failed');
			const restarted = energy();
			// What was kept shows at once, while Octopus is asked again behind the scenes.
			await restarted();
			await settle();
			const result = await restarted();
			expect(result.slots).toEqual([lastNight]);
			expect(result.tariff).toEqual(sampleTariff);
			expect(result.status).toEqual({ kind: 'stale', updatedAt: '2026-10-28T08:15:00.000Z' });
		});

		it('says it’s stale since the older answer when only the slots fail', async () => {
			const load = energy();
			await load();
			octopus.slotsAnswer = new TypeError('fetch failed');
			now += SLOTS_MS;
			await load();
			await settle();
			expect((await load()).status).toEqual({ kind: 'stale', updatedAt: '2026-10-28T08:15:00.000Z' });
		});

		it('says so when the account isn’t on Intelligent Octopus Go, rather than guessing its times', async () => {
			octopus.tariffAnswer = new UnsupportedTariff('Flexible Octopus');
			const result = await energy()();
			expect(result.status).toEqual({ kind: 'unsupported', tariff: 'Flexible Octopus' });
			expect(result.tariff).toBeNull();
			expect(result.slots).toEqual([]);
		});

		it.each([
			['plugged in', 'plugged', SLOTS_MS],
			['unplugged', 'unplugged', SLOTS_UNPLUGGED_MS]
		] as const)('asks for slots every %s minutes while the car is %s', async (_, car, every) => {
			zappi.liveAnswer = { watts: 500, car };
			const load = energy();
			await load();
			expect(octopus.asked.slots).toBe(1);
			now += every - MINUTE;
			await load();
			expect(octopus.asked.slots).toBe(1);
			now += MINUTE;
			await load();
			expect(octopus.asked.slots).toBe(2);
		});
	});

	describe('the Zappi', () => {
		it('adds up today’s and yesterday’s Half-hours', async () => {
			zappi.history.set('2026-10-27', used('2026-10-27T19:00:00.000Z'));
			zappi.history.set('2026-10-28', used('2026-10-28T07:30:00.000Z'));
			const result = await energy()();
			expect(result.yesterday).toEqual([{ from: '2026-10-27T19:00:00.000Z', house: expect.closeTo(0.4), car: expect.closeTo(0.6) }]);
			expect(result.today).toEqual([{ from: '2026-10-28T07:30:00.000Z', house: expect.closeTo(0.4), car: expect.closeTo(0.6) }]);
			expect(result.live).toEqual({ watts: 800, car: 'plugged' });
			expect(result.usageStatus).toEqual({ kind: 'live', updatedAt: '2026-10-28T08:15:00.000Z' });
		});

		it('stops asking for a day’s history once the day is over and myenergi has finished it', async () => {
			const load = energy();
			await load();
			expect(zappi.days).toEqual(['2026-10-27', '2026-10-28']);
			now += HISTORY_MS;
			await load();
			await settle();
			// Yesterday finished more than an hour before, so only today is asked for again.
			expect(zappi.days).toEqual(['2026-10-27', '2026-10-28', '2026-10-28']);
		});

		it('hides Live demand when the Zappi’s been quiet for a while, rather than showing it out of date', async () => {
			const load = energy();
			await load();
			zappi.liveAnswer = new TypeError('fetch failed');
			now += LIVE_STALE_MS;
			await load();
			await settle();
			const result = await load();
			expect(result.live).toBeNull();
			expect(result.usageStatus).toEqual({ kind: 'stale', updatedAt: '2026-10-28T08:15:00.000Z' });
		});
	});

	it('still shows Octopus when the Zappi breaks', async () => {
		const result = await createEnergy({
			octopus,
			zappi,
			openStore: () => {
				throw new Error('database is locked');
			},
			files,
			clock
		})();
		expect(result.status.kind).toBe('live');
		expect(result.usageStatus).toEqual({ kind: 'stale', updatedAt: null });
	});
});
