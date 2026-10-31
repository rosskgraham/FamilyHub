import type { Rate } from '#lib/energy.ts';

const API = 'https://api.octopus.energy/v1';

export interface UnitRatesResponse {
	results: { value_inc_vat: number; valid_from: string; valid_to: string; payment_method: string | null }[];
}

/**
 * The Agile rates for a product and region between two moments, from Octopus's public API. Needs no key.
 * `product` is like `AGILE-24-10-01` and `region` a letter from A to P.
 */
export async function fetchRates(product: string, region: string, from: Date, to: Date): Promise<Rate[]> {
	const tariff = `E-1R-${product}-${region}`;
	const params = new URLSearchParams({
		period_from: from.toISOString(),
		period_to: to.toISOString(),
		// Three days of Half-hours, so it's always one page.
		page_size: '200'
	});
	const url = `${API}/products/${product}/electricity-tariffs/${tariff}/standard-unit-rates/?${params}`;
	const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
	if (!response.ok) throw new Error(`Octopus answered ${response.status}`);
	return toRates((await response.json()) as UnitRatesResponse);
}

/** Octopus lists the newest first; the Hub wants them in time order. */
export function toRates(response: UnitRatesResponse): Rate[] {
	return response.results
		.filter((r) => r.payment_method === null || r.payment_method === 'DIRECT_DEBIT')
		.map((r) => ({ from: new Date(r.valid_from).toISOString(), to: new Date(r.valid_to).toISOString(), pence: r.value_inc_vat }))
		.sort((a, b) => a.from.localeCompare(b.from));
}
