import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HeatingReading } from '#lib/heating.ts';
import { forLogs, googleError, SignInNeeded } from '../google/errors.ts';
import {
	changeHeatingTarget,
	changeTarget,
	createHeating,
	loadHeating,
	NOT_REPORTING_MS,
	POLL_MS,
	readThermostat,
	sendHeat,
	SET_HEAT,
	type Thermostat
} from './index.ts';
import { NestOffline } from './from-sdm.ts';

vi.mock('$app/env/private', () => ({ CALENDAR_SOURCE: undefined, NEST_PROJECT_ID: undefined }));
vi.mock('../google/auth.ts', async () => ({
	...(await vi.importActual<object>('../google/errors.ts')),
	googleAccount: () => ({}),
	isConfigured: () => false,
	clientId: () => 'client'
}));

const MINUTE = 60_000;
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

const reading: HeatingReading = { temperature: 19.5, humidity: 67, heating: true, mode: 'heat', target: 21 };

describe('the heating', () => {
	let now = Date.parse('2026-11-21T14:02:00Z');
	const clock = () => now;
	let errors: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		now = Date.parse('2026-11-21T14:02:00Z');
		errors = vi.spyOn(console, 'error').mockImplementation(() => {});
	});
	afterEach(() => vi.restoreAllMocks());

	it('asks the Nest about every 2 minutes, however often the page asks', async () => {
		const read = vi.fn(async () => reading);
		const heating = createHeating(read, clock);
		// The Hub's page checks for changes every minute; over 20 minutes it asks for the heating 21 times.
		for (let minute = 0; minute <= 20; minute++) {
			await heating();
			await settle();
			now += MINUTE;
		}
		expect(POLL_MS).toBe(2 * MINUTE);
		expect(read).toHaveBeenCalledTimes(11);
	});

	it('shows the last answer while it’s under 15 minutes old', async () => {
		let fail = false;
		const heating = createHeating(async () => {
			if (fail) throw new Error('Google unreachable');
			return reading;
		}, clock);
		expect(await heating()).toEqual({ reporting: true, ...reading });

		fail = true;
		now += NOT_REPORTING_MS - MINUTE;
		await heating();
		await settle();
		expect(await heating()).toEqual({ reporting: true, ...reading });
	});

	it('says "Not reporting since" the last answer after 15 minutes without one, logging one line for the run', async () => {
		let fail = false;
		const heating = createHeating(async () => {
			if (fail) throw new NestOffline();
			return reading;
		}, clock);
		await heating();

		fail = true;
		// An hour of failures, asked every minute.
		for (let minute = 1; minute <= 60; minute++) {
			now += MINUTE;
			await heating();
			await settle();
		}
		expect(await heating()).toEqual({ reporting: false, since: '2026-11-21T14:02:00.000Z' });
		expect(errors).toHaveBeenCalledTimes(1);
		expect(String(errors.mock.calls[0]![0])).toMatch(/^Heating sync failing, since /);
		expect(String(errors.mock.calls[0]![1])).toBe('The Nest is offline');
	});

	it('logs again for a new run of failures after the Nest answers', async () => {
		let fail = false;
		const heating = createHeating(async () => {
			if (fail) throw new NestOffline();
			return reading;
		}, clock);
		for (const failing of [false, true, true, false, true]) {
			fail = failing;
			now += POLL_MS;
			await heating();
			await settle();
		}
		expect(errors).toHaveBeenCalledTimes(2);
	});

	it('says "Not reporting" straight away once the Nest sign-in has ended', async () => {
		let ended = false;
		const heating = createHeating(async () => {
			if (ended) throw new SignInNeeded();
			return reading;
		}, clock);
		await heating();

		ended = true;
		now += POLL_MS;
		await heating();
		await settle();
		expect(await heating()).toEqual({ reporting: false, since: '2026-11-21T14:02:00.000Z', signInEnded: true });
	});

	it('says "Not reporting" with no time when the Nest hasn’t answered since the Hub started', async () => {
		const heating = createHeating(async () => {
			throw new Error('Google unreachable');
		}, clock);
		expect(await heating()).toEqual({ reporting: false, since: null });
	});
});

describe('readThermostat', () => {
	it('lists the project’s devices, outbound to Google', async () => {
		const request = vi.fn(async () => ({
			devices: [
				{
					name: 'enterprises/p/devices/d',
					type: 'sdm.devices.types.THERMOSTAT',
					traits: { 'sdm.devices.traits.Temperature': { ambientTemperatureCelsius: 19.5 } }
				}
			]
		}));
		const result = await readThermostat(request as never, 'project-id');
		expect(request).toHaveBeenCalledWith(
			'GET',
			'https://smartdevicemanagement.googleapis.com/v1/enterprises/project-id/devices'
		);
		expect(result.temperature).toBe(19.5);
	});
});

const device = {
	name: 'enterprises/project-id/devices/device-id',
	type: 'sdm.devices.types.THERMOSTAT',
	traits: { 'sdm.devices.traits.Temperature': { ambientTemperatureCelsius: 19.5 } }
};

describe('sendHeat', () => {
	it('sends SetHeat to the thermostat it lists, with the new target', async () => {
		const request = vi.fn(async (method: string) => (method === 'GET' ? { devices: [device] } : {}));
		await sendHeat(request as never, 'project-id', 21.5);
		expect(SET_HEAT).toBe('sdm.devices.commands.ThermostatTemperatureSetpoint.SetHeat');
		expect(request).toHaveBeenLastCalledWith(
			'POST',
			'https://smartdevicemanagement.googleapis.com/v1/enterprises/project-id/devices/device-id:executeCommand',
			{ command: SET_HEAT, params: { heatCelsius: 21.5 } }
		);
	});
});

describe('changing the target', () => {
	let logs: ReturnType<typeof vi.spyOn>;
	let errors: ReturnType<typeof vi.spyOn>;
	beforeEach(() => {
		logs = vi.spyOn(console, 'log').mockImplementation(() => {});
		errors = vi.spyOn(console, 'error').mockImplementation(() => {});
	});
	afterEach(() => vi.restoreAllMocks());

	/** A thermostat at `reading` whose SetHeat does `send`, read again after a change. */
	function thermostat(start: HeatingReading, send: (celsius: number) => Promise<void>) {
		let now: HeatingReading = start;
		const heating = Object.assign(async () => ({ reporting: true as const, ...now }), {
			refresh: vi.fn(async () => ({ reporting: true as const, ...now }))
		});
		const t: Thermostat = {
			heating,
			send: vi.fn(async (celsius: number) => {
				await send(celsius);
				now = { ...now, target: celsius };
			})
		};
		return t;
	}

	it('sends the new target, reads the thermostat again, and logs one line from and to', async () => {
		const t = thermostat(reading, async () => {});
		const change = await changeTarget(t, 22);
		expect(t.send).toHaveBeenCalledWith(22);
		expect(t.heating.refresh).toHaveBeenCalledTimes(1);
		expect(change).toEqual({ outcome: 'changed', heating: { reporting: true, ...reading, target: 22 } });
		expect(logs).toHaveBeenCalledTimes(1);
		expect(logs.mock.calls[0]).toEqual(['Heating target changed from 21° to 22°']);
		expect(errors).not.toHaveBeenCalled();
	});

	it('when the Nest turns it down, answers with the target it still has, and logs one line with no IDs', async () => {
		// SDM's answer to a command the thermostat won't take, in the form Google documents for Device Access errors.
		// Not captured from the Household's Nest, which took every change tried (AB#42).
		const turnedDown = {
			error: { code: 400, message: 'Command not allowed in current thermostat mode.', status: 'FAILED_PRECONDITION' }
		};
		const request = vi.fn(async (method: string, url: string) => {
			if (method === 'GET') return { devices: [device] };
			// As the Hub's Google requests make their errors, with forLogs taking the IDs out of the address.
			throw googleError(400, turnedDown, `Google API request failed, POST ${forLogs(url)}`);
		});
		const t = thermostat(reading, (celsius) => sendHeat(request as never, 'project-id', celsius));
		const change = await changeTarget(t, 22);
		expect(change).toEqual({ outcome: 'failed', heating: { reporting: true, ...reading } });
		expect(t.heating.refresh).toHaveBeenCalledTimes(1);
		expect(logs).not.toHaveBeenCalled();
		expect(errors).toHaveBeenCalledTimes(1);
		const line = errors.mock.calls[0]!.join(' ');
		expect(line).toMatch(/^Heating target not changed from 21° to 22°: /);
		expect(line).toContain('POST https://smartdevicemanagement.googleapis.com/v1/enterprises/…/devices/…: 400');
		expect(line).not.toMatch(/project-id|device-id|Bearer/);
	});

	it('reads the thermostat again after a change, not taking a poll already under way from before it', async () => {
		let answer: (r: HeatingReading) => void = () => {};
		const read = vi.fn(() => new Promise<HeatingReading>((resolve) => (answer = resolve)));
		let now = Date.parse('2026-11-21T14:02:00Z');
		const heating = createHeating(read, () => now);
		const first = heating();
		await settle();
		answer(reading);
		await first;

		// The next poll goes out, and the change is sent while it's under way.
		now += POLL_MS;
		void heating();
		await settle();
		expect(read).toHaveBeenCalledTimes(2);
		const after = heating.refresh();
		answer(reading);
		await settle();
		expect(read).toHaveBeenCalledTimes(3);
		answer({ ...reading, target: 22 });
		expect(await after).toMatchObject({ target: 22 });
	});

	it('sends nothing in Eco, Off or when the Nest isn’t reporting', async () => {
		for (const start of [
			{ ...reading, mode: 'eco' as const, target: 12 },
			{ ...reading, mode: 'off' as const, target: null }
		]) {
			const t = thermostat(start, async () => {});
			expect((await changeTarget(t, 21)).outcome).toBe('refused');
			expect(t.send).not.toHaveBeenCalled();
		}
		const silent: Thermostat = {
			heating: Object.assign(async () => ({ reporting: false as const, since: null }), {
				refresh: async () => ({ reporting: false as const, since: null })
			}),
			send: vi.fn()
		};
		expect((await changeTarget(silent, 21)).outcome).toBe('refused');
		expect(silent.send).not.toHaveBeenCalled();
	});

	it('with sample data, changes only the sample, and never calls Google', async () => {
		const fetch = vi.spyOn(globalThis, 'fetch');
		expect(await loadHeating()).toMatchObject({ target: 21, heating: true });
		expect(await changeHeatingTarget(19)).toEqual({
			outcome: 'changed',
			heating: { reporting: true, temperature: 19.5, humidity: 67, mode: 'heat', target: 19, heating: false }
		});
		expect(await loadHeating()).toMatchObject({ target: 19, heating: false });
		await changeHeatingTarget(21);
		expect(await loadHeating()).toMatchObject({ target: 21, heating: true });
		expect(fetch).not.toHaveBeenCalled();
	});

	it('with sample data, ?heating= shows the other states, and nothing else', async () => {
		expect(await loadHeating('eco')).toMatchObject({ mode: 'eco', target: 12 });
		expect(await loadHeating('off')).toMatchObject({ mode: 'off', target: null });
		expect(await loadHeating('not-reporting')).toEqual({ reporting: false, since: null });
		expect(await loadHeating('toString')).toMatchObject({ mode: 'heat' });
	});
});
