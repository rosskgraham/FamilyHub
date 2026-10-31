// The Household's Intelligent Octopus Go rates and Smart-charging slots, from Octopus's GraphQL API (ADR 0007).
import type { Rates, Slot } from '#lib/energy.ts';

const GRAPHQL = 'https://api.octopus.energy/v1/graphql/';
// Octopus's tokens last an hour; ask for a new one a little before.
const TOKEN_MS = 55 * 60_000;

export interface Tariff {
	/** For example "Intelligent Octopus Go 12M Fixed". */
	name: string;
	rates: Rates;
}

/** The account's current tariff isn't one the Hub knows the times of. */
export class UnsupportedTariff extends Error {
	readonly tariff: string;

	constructor(tariff: string) {
		super(`Not Intelligent Octopus Go: ${tariff}`);
		this.tariff = tariff;
	}
}

export interface AgreementsResponse {
	account: {
		electricityAgreements: {
			tariff: {
				displayName: string;
				productCode: string;
				unitRates?: { value: number }[];
			} | null;
		}[];
	} | null;
}

export interface DispatchesResponse {
	devices: { id: string; deviceType: string }[];
	completedDispatches: { start: string; end: string }[];
}

export interface PlannedResponse {
	flexPlannedDispatches: { start: string; end: string }[];
}

/** Intelligent Octopus Go's products start `IOG-`, and the older Intelligent Octopus's `INTELLI-`. */
const INTELLIGENT = /^(IOG|INTELLI)-/;

export function toTariff(response: AgreementsResponse): Tariff {
	const tariff = response.account?.electricityAgreements.find((a) => a.tariff)?.tariff;
	if (!tariff) throw new Error('No current electricity agreement');
	if (!INTELLIGENT.test(tariff.productCode)) throw new UnsupportedTariff(tariff.displayName);
	// Octopus lists each rate more than once, without the times it applies.
	const values = [...new Set((tariff.unitRates ?? []).map((r) => r.value))].sort((a, b) => a - b);
	if (values.length !== 2) throw new Error(`Expected two rates, got ${values.length}`);
	return {
		name: tariff.displayName,
		rates: { offPeak: values[0]!, peak: values[1]! }
	};
}

/** Planned and past slots together, in time order, without repeats. */
export function toSlots(
	planned: { start: string; end: string }[],
	completed: { start: string; end: string }[]
): Slot[] {
	const slots = new Map<string, Slot>();
	for (const d of [...completed, ...planned]) {
		const slot = {
			from: new Date(d.start).toISOString(),
			to: new Date(d.end).toISOString()
		};
		slots.set(slot.from, slot);
	}
	return [...slots.values()].sort((a, b) => a.from.localeCompare(b.from));
}

/** Signs in to Octopus with the account's API key, and asks it things. */
export class Octopus {
	readonly account: string;
	readonly #apiKey: string;
	#token: { value: string; until: number } | null = null;

	constructor(account: string, apiKey: string) {
		this.account = account;
		this.#apiKey = apiKey;
	}

	async tariff(): Promise<Tariff> {
		const data = await this.#query<AgreementsResponse>(
			`query ($account: String!) {
				account(accountNumber: $account) {
					electricityAgreements(active: true) {
						tariff { ... on TariffType { displayName productCode } ... on HalfHourlyTariff { unitRates { value } } }
					}
				}
			}`,
			{ account: this.account }
		);
		return toTariff(data);
	}

	async slots(): Promise<Slot[]> {
		const data = await this.#query<DispatchesResponse>(
			`query ($account: String!) {
				devices(accountNumber: $account) { id deviceType }
				completedDispatches(accountNumber: $account) { start end }
			}`,
			{ account: this.account }
		);
		const car = data.devices.find((d) => d.deviceType === 'ELECTRIC_VEHICLES');
		const planned = car
			? await this.#query<PlannedResponse>(
					`query ($device: String!) { flexPlannedDispatches(deviceId: $device) { start end } }`,
					{ device: car.id }
				)
			: { flexPlannedDispatches: [] };
		return toSlots(planned.flexPlannedDispatches, data.completedDispatches);
	}

	async #query<T>(query: string, variables: Record<string, string>, retried = false): Promise<T> {
		const token = await this.#signIn();
		try {
			return await post<T>(query, variables, token);
		} catch (e) {
			// A token Octopus has already expired: sign in again, once.
			if (retried || !(e instanceof GraphQLError) || !e.codes.includes('KT-CT-1124')) throw e;
			this.#token = null;
			return this.#query(query, variables, true);
		}
	}

	async #signIn(): Promise<string> {
		if (this.#token && Date.now() < this.#token.until) return this.#token.value;
		const data = await post<{ obtainKrakenToken: { token: string } }>(
			`mutation ($key: String!) { obtainKrakenToken(input: { APIKey: $key }) { token } }`,
			{ key: this.#apiKey }
		);
		this.#token = {
			value: data.obtainKrakenToken.token,
			until: Date.now() + TOKEN_MS
		};
		return this.#token.value;
	}
}

/** Octopus answered, with errors instead of data. */
export class GraphQLError extends Error {
	/** Octopus's own codes, such as KT-CT-1124 for an expired token. */
	readonly codes: string[];

	constructor(message: string, codes: string[]) {
		super(message);
		this.codes = codes;
	}
}

interface GraphQLResponse<T> {
	data?: T | null;
	errors?: { message: string; extensions?: { errorCode?: string } }[];
}

async function post<T>(query: string, variables: Record<string, string>, token?: string): Promise<T> {
	const response = await fetch(GRAPHQL, {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			...(token ? { authorization: token } : {})
		},
		body: JSON.stringify({ query, variables }),
		signal: AbortSignal.timeout(10_000)
	});
	if (!response.ok) throw new Error(`Octopus answered ${response.status}`);
	const body = (await response.json()) as GraphQLResponse<T>;
	if (body.errors?.length) {
		throw new GraphQLError(
			`Octopus: ${body.errors.map((e) => e.message).join('; ')}`,
			body.errors.flatMap((e) => (e.extensions?.errorCode ? [e.extensions.errorCode] : []))
		);
	}
	if (!body.data) throw new Error('Octopus sent no data');
	return body.data;
}

/**
 * What Octopus sent now, plus slots kept from before that are over and that it no longer lists. Planned slots it has
 * dropped are gone: Octopus has moved them.
 */
export function merge(kept: Slot[], fetched: Slot[], at: Date): Slot[] {
	const overlaps = (a: Slot) => fetched.some((b) => a.from < b.to && b.from < a.to);
	const past = kept.filter((s) => new Date(s.to) <= at && !overlaps(s));
	return [...past, ...fetched].sort((a, b) => a.from.localeCompare(b.from));
}
