import { describe, expect, it } from 'vitest';
import { toRates } from './octopus.ts';

describe('toRates', () => {
	it('puts Octopus’s newest-first rates in time order', () => {
		const rates = toRates({
			results: [
				{ value_inc_vat: 22.6, valid_from: '2026-10-28T08:30:00Z', valid_to: '2026-10-28T09:00:00Z', payment_method: null },
				{ value_inc_vat: 24.2, valid_from: '2026-10-28T08:00:00Z', valid_to: '2026-10-28T08:30:00Z', payment_method: null }
			]
		});
		expect(rates).toEqual([
			{ from: '2026-10-28T08:00:00.000Z', to: '2026-10-28T08:30:00.000Z', pence: 24.2 },
			{ from: '2026-10-28T08:30:00.000Z', to: '2026-10-28T09:00:00.000Z', pence: 22.6 }
		]);
	});

	it('keeps the Direct Debit rate when a Half-hour has more than one', () => {
		const rates = toRates({
			results: [
				{ value_inc_vat: 25.1, valid_from: '2026-10-28T08:00:00Z', valid_to: '2026-10-28T08:30:00Z', payment_method: 'NON_DIRECT_DEBIT' },
				{ value_inc_vat: 24.2, valid_from: '2026-10-28T08:00:00Z', valid_to: '2026-10-28T08:30:00Z', payment_method: 'DIRECT_DEBIT' }
			]
		});
		expect(rates.map((r) => r.pence)).toEqual([24.2]);
	});
});
