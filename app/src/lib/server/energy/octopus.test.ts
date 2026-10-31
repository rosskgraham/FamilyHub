import { afterEach, describe, expect, it, vi } from 'vitest';
import { Octopus, toSlots, toTariff, UnsupportedTariff, type AgreementsResponse } from './octopus.ts';

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
