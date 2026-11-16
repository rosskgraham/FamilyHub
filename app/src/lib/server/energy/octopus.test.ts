import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	Octopus,
	toCharge,
	toSlots,
	toTariff,
	UnsupportedTariff,
	type AgreementsResponse,
	type VehicleResponse
} from './octopus.ts';

// Recorded from the GraphQL API, with made-up rates and the account removed.
const agreement = (productCode: string, values: number[]): AgreementsResponse => ({
	account: {
		electricityAgreements: [
			{
				tariff: {
					displayName: productCode.startsWith('IOG') ? 'Intelligent Octopus Go 12M Fixed' : 'Octopus 12M Fixed',
					productCode,
					unitRates: values.map((value) => ({ value }))
				}
			}
		]
	}
});

describe('toTariff', () => {
	it('takes the lower of the two rates as Off-peak', () => {
		expect(toTariff(agreement('IOG-FIX-12M-26-10-01', [7.5, 27.4, 7.5, 27.4]))).toEqual({
			name: 'Intelligent Octopus Go 12M Fixed',
			rates: { offPeak: 7.5, peak: 27.4 }
		});
	});

	it('turns down a tariff that isn’t Intelligent Octopus Go', () => {
		expect(() => toTariff(agreement('OE-FIX-12M-26-10-01', [24.5]))).toThrow(UnsupportedTariff);
	});

	it('won’t guess with other than two rates', () => {
		expect(() => toTariff(agreement('IOG-FIX-12M-26-10-01', [7.5, 20, 27.4]))).toThrow('Expected two rates, got 3');
	});

	it('needs a current agreement', () => {
		expect(() => toTariff({ account: { electricityAgreements: [] } })).toThrow('No current electricity agreement');
	});
});

describe('toCharge', () => {
	// The shape Octopus answered for the Household's car on 15 November 2026, with the IDs left out.
	const vehicle = (status: VehicleResponse['devices'][number]['status']): VehicleResponse => ({
		devices: [{ deviceType: 'ELECTRIC_VEHICLES', status }]
	});

	it("reads the car's charge and where charging stops, turning Octopus's strings into numbers", () => {
		expect(
			toCharge(
				vehicle({
					stateOfCharge: { value: '78.00', timestamp: '2026-11-15T23:01:54+00:00' },
					stateOfChargeLimit: { upperSocLimit: 80 }
				})
			)
		).toEqual({ percent: 78, at: '2026-11-15T23:01:54.000Z', limit: 80 });
	});

	it("has no limit when Octopus doesn't say one", () => {
		expect(toCharge(vehicle({ stateOfCharge: { value: 64, timestamp: '2026-11-15T20:00:00Z' } }))?.limit).toBeNull();
	});

	it("is null when there's no car, or Octopus hasn't heard its charge", () => {
		expect(toCharge({ devices: [{ deviceType: 'BATTERIES', status: null }] })).toBeNull();
		expect(toCharge(vehicle(null))).toBeNull();
		expect(toCharge(vehicle({ stateOfCharge: null }))).toBeNull();
		expect(toCharge(vehicle({ stateOfCharge: { value: null, timestamp: '2026-11-15T20:00:00Z' } }))).toBeNull();
		expect(toCharge(vehicle({ stateOfCharge: { value: '78.00', timestamp: null } }))).toBeNull();
	});
});

describe('toSlots', () => {
	it('puts planned and past slots together in time order, once each', () => {
		const past = {
			start: '2026-10-28T05:30:00+00:00',
			end: '2026-10-28T06:00:00+00:00'
		};
		const planned = {
			start: '2026-10-28T13:00:00+00:00',
			end: '2026-10-28T14:30:00+00:00'
		};
		expect(toSlots([planned, past], [past])).toEqual([
			{ from: '2026-10-28T05:30:00.000Z', to: '2026-10-28T06:00:00.000Z' },
			{ from: '2026-10-28T13:00:00.000Z', to: '2026-10-28T14:30:00.000Z' }
		]);
	});
});

describe('Octopus', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	/** Answers each request with the next of `answers`, and records what was asked. */
	function stubFetch(...answers: object[]) {
		const asked: { query: string; authorization?: string }[] = [];
		vi.stubGlobal(
			'fetch',
			vi.fn(async (_url: string, init: RequestInit) => {
				const headers = init.headers as Record<string, string>;
				asked.push({
					query: JSON.parse(init.body as string).query,
					authorization: headers.authorization
				});
				return new Response(JSON.stringify(answers.shift()));
			})
		);
		return asked;
	}
	const token = (value: string) => ({
		data: { obtainKrakenToken: { token: value } }
	});

	it('signs in once and reuses the token', async () => {
		const asked = stubFetch(
			token('t1'),
			{ data: agreement('IOG-FIX-12M-26-10-01', [7.5, 27.4]) },
			{ data: agreement('IOG-FIX-12M-26-10-01', [7.5, 27.4]) }
		);
		const octopus = new Octopus('A-TEST0000', 'sk_test');
		await octopus.tariff();
		await octopus.tariff();
		expect(asked.map((a) => a.authorization)).toEqual([undefined, 't1', 't1']);
	});

	it('signs in again when Octopus says the token has expired', async () => {
		const expired = {
			errors: [
				{
					message: 'Signature of the JWT has expired.',
					extensions: { errorCode: 'KT-CT-1124' }
				}
			]
		};
		const asked = stubFetch(token('t1'), expired, token('t2'), {
			data: agreement('IOG-FIX-12M-26-10-01', [7.5, 27.4])
		});
		await new Octopus('A-TEST0000', 'sk_test').tariff();
		expect(asked.map((a) => a.authorization)).toEqual([undefined, 't1', undefined, 't2']);
	});

	it('reports Octopus’s errors', async () => {
		stubFetch({
			errors: [{ message: 'Invalid data.', extensions: { errorCode: 'KT-CT-1139' } }]
		});
		await expect(new Octopus('A-TEST0000', 'sk_wrong').tariff()).rejects.toThrow('Octopus: Invalid data.');
	});

	it('asks for the car’s planned slots as well as past ones', async () => {
		const asked = stubFetch(
			token('t1'),
			{
				data: {
					devices: [{ id: 'car-1', deviceType: 'ELECTRIC_VEHICLES' }],
					completedDispatches: [
						{
							start: '2026-10-28T05:30:00+00:00',
							end: '2026-10-28T06:00:00+00:00'
						}
					]
				}
			},
			{
				data: {
					flexPlannedDispatches: [
						{
							start: '2026-10-28T13:00:00+00:00',
							end: '2026-10-28T14:30:00+00:00'
						}
					]
				}
			}
		);
		const slots = await new Octopus('A-TEST0000', 'sk_test').slots();
		expect(slots.map((s) => s.from)).toEqual(['2026-10-28T05:30:00.000Z', '2026-10-28T13:00:00.000Z']);
		expect(asked[2]!.query).toContain('flexPlannedDispatches');
	});

	it('has no planned slots without a car on the account', async () => {
		stubFetch(token('t1'), { data: { devices: [], completedDispatches: [] } });
		expect(await new Octopus('A-TEST0000', 'sk_test').slots()).toEqual([]);
	});
});
