// The Zappi's Live demand, the Car's state and per-minute history, from myenergi's unofficial cloud API (ADR 0007).
// Everything myenergi-specific is in this file, so when the API changes this is the one place to fix.
import { createHash, randomBytes } from 'node:crypto';
import type { CarState, HalfHourUse, Live } from '#lib/energy.ts';

const DIRECTOR = 'https://director.myenergi.net';
const TIMEOUT_MS = 10_000;
const JOULES_PER_KWH = 3_600_000;
const HALF_HOUR_MS = 30 * 60_000;

/** One minute of the Zappi's history: energy from the grid and to the Car, in joules. */
export interface Minute {
	/** The minute's start, as an ISO instant. */
	at: string;
	imported: number;
	car: number;
}

export interface StatusResponse {
	zappi?: { sno: number; grd?: number; pst?: string }[];
}

/** myenergi leaves out any field that's zero, including the hour and minute at midnight. */
export interface HistoryRow {
	yr: number;
	mon: number;
	dom: number;
	hr?: number;
	min?: number;
	imp?: number;
	h1d?: number;
}

/** What the Zappi says about the plug: A is unplugged, C2 is charging, and B1, B2 and C1 are plugged in and waiting. */
export function toCar(pst: string | undefined): CarState {
	if (pst === 'A' || pst === undefined) return 'unplugged';
	return pst === 'C2' ? 'charging' : 'plugged';
}

export function toLive(response: StatusResponse): Live {
	const zappi = response.zappi?.[0];
	if (!zappi) throw new Error('myenergi sent no Zappi');
	// With no solar, the grid clamp never reads below zero for long; a blip shows as nothing.
	return { watts: Math.max(0, zappi.grd ?? 0), car: toCar(zappi.pst) };
}

/** A day's rows, which are in UTC. */
export function toMinutes(rows: HistoryRow[]): Minute[] {
	return rows.map((r) => ({
		at: new Date(Date.UTC(r.yr, r.mon - 1, r.dom, r.hr ?? 0, r.min ?? 0)).toISOString(),
		imported: r.imp ?? 0,
		car: r.h1d ?? 0
	}));
}

/**
 * Minutes added up into Half-hours of House use and Car charging, in kWh. House use is what came from the grid less
 * what went to the Car. A minute that appears twice counts once: each day's history ends with the next day's first
 * minute. UK Half-hours always start on a UTC half-hour, so the clocks changing makes no difference here.
 */
export function toHalfHours(minutes: Minute[]): (HalfHourUse & { minutes: number })[] {
	const unique = new Map(minutes.map((m) => [m.at, m]));
	const halves = new Map<string, HalfHourUse & { minutes: number }>();
	for (const m of unique.values()) {
		const from = new Date(Math.floor(new Date(m.at).getTime() / HALF_HOUR_MS) * HALF_HOUR_MS).toISOString();
		const h = halves.get(from) ?? { from, house: 0, car: 0, minutes: 0 };
		h.house += Math.max(0, m.imported - m.car) / JOULES_PER_KWH;
		h.car += m.car / JOULES_PER_KWH;
		h.minutes += 1;
		halves.set(from, h);
	}
	return [...halves.values()].sort((a, b) => a.from.localeCompare(b.from));
}

/** An HTTP Digest answer (RFC 2617, MD5, qop=auth), so the API key never crosses the wire. */
export function digest(
	challenge: string,
	user: string,
	password: string,
	method: string,
	uri: string,
	cnonce: string,
	nc = '00000001'
): string {
	const p = Object.fromEntries([...challenge.matchAll(/(\w+)="?([^",]*)"?/g)].map((m) => [m[1], m[2]]));
	const md5 = (s: string) => createHash('md5').update(s).digest('hex');
	const response = md5(
		`${md5(`${user}:${p.realm}:${password}`)}:${p.nonce}:${nc}:${cnonce}:${p.qop}:${md5(`${method}:${uri}`)}`
	);
	const opaque = p.opaque ? `, opaque="${p.opaque}"` : '';
	return `Digest username="${user}", realm="${p.realm}", nonce="${p.nonce}", uri="${uri}", qop=${p.qop}, nc=${nc}, cnonce="${cnonce}", response="${response}"${opaque}, algorithm=MD5`;
}

/** Signs in to myenergi with the Zappi's serial and the account's API key, and asks it things. */
export class Myenergi {
	readonly #serial: string;
	readonly #apiKey: string;
	/** The server myenergi keeps the account on, which the director names. */
	#server: string | null = null;

	constructor(serial: string, apiKey: string) {
		this.#serial = serial;
		this.#apiKey = apiKey;
	}

	async live(): Promise<Live> {
		return toLive((await this.#get('/cgi-jstatus-Z')) as StatusResponse);
	}

	/** A UTC day's minutes, `day` like 2026-10-28. */
	async minutes(day: string): Promise<Minute[]> {
		const [y, m, d] = day.split('-').map(Number) as [number, number, number];
		const body = (await this.#get(`/cgi-jday-Z${this.#serial}-${y}-${m}-${d}`)) as Record<string, HistoryRow[]>;
		return toMinutes(Object.values(body)[0] ?? []);
	}

	async #get(path: string): Promise<unknown> {
		this.#server ??= await this.#find();
		const response = await this.#fetch(this.#server, path);
		if (!response.ok) {
			// The account may have moved: ask the director again next time.
			this.#server = null;
			throw new Error(`myenergi answered ${response.status}`);
		}
		return response.json();
	}

	async #find(): Promise<string> {
		const response = await this.#fetch(DIRECTOR, '/cgi-jstatus-Z');
		const server = response.headers.get('x_myenergi-asn');
		if (!response.ok || !server) throw new Error(`myenergi's director answered ${response.status}`);
		return `https://${server}`;
	}

	async #fetch(base: string, path: string): Promise<Response> {
		const first = await fetch(base + path, { signal: AbortSignal.timeout(TIMEOUT_MS) });
		if (first.status !== 401) return first;
		const challenge = first.headers.get('www-authenticate') ?? '';
		const authorization = digest(challenge, this.#serial, this.#apiKey, 'GET', path, randomBytes(8).toString('hex'));
		return fetch(base + path, { headers: { authorization }, signal: AbortSignal.timeout(TIMEOUT_MS) });
	}
}

/** The UTC days, like 2026-10-28, from `from` to `to`. The Zappi's history comes a UTC day at a time. */
export function utcDays(from: Date, to: Date): string[] {
	const days: string[] = [];
	for (let t = Date.parse(from.toISOString().slice(0, 10)); t <= to.getTime(); t += 24 * 3600_000) {
		days.push(new Date(t).toISOString().slice(0, 10));
	}
	return days;
}
