import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HeatingReading } from '#lib/heating.ts';
import { SignInNeeded } from '../google/errors.ts';
import { createHeating, NOT_REPORTING_MS, POLL_MS, readThermostat } from './index.ts';
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
