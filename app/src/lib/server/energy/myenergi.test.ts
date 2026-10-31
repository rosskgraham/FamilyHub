import { afterEach, describe, expect, it, vi } from 'vitest';
import { digest, Myenergi, toCar, toHalfHours, toLive, toMinutes, utcDays, type Minute } from './myenergi.ts';

// Shaped like recorded responses, with made-up figures and the serial and key removed.
const KWH = 3_600_000;

describe('digest', () => {
	it('gives the answer in RFC 2617’s worked example', () => {
		const challenge =
			'Digest realm="testrealm@host.com", qop="auth", nonce="dcd98b7102dd2f0e8b11d0f600bfb0c093", opaque="5ccc069c403ebaf9f0171e9517f40e41"';
		const header = digest(challenge, 'Mufasa', 'Circle Of Life', 'GET', '/dir/index.html', '0a4f113b');
		expect(header).toContain('response="6629fae49393a05397450978507c4ef1"');
		expect(header).toContain('opaque="5ccc069c403ebaf9f0171e9517f40e41"');
		expect(header).not.toContain('Circle Of Life');
	});
});

describe('toCar', () => {
	it.each([
		['A', 'unplugged'],
		['B1', 'plugged'],
		['B2', 'plugged'],
		['C1', 'plugged'],
		['C2', 'charging'],
		[undefined, 'unplugged']
	] as const)('reads %s as %s', (pst, car) => {
		expect(toCar(pst)).toBe(car);
	});
});

describe('toLive', () => {
	it('takes the grid clamp’s watts and the plug', () => {
		expect(toLive({ zappi: [{ sno: 1, grd: 812, pst: 'B1' }] })).toEqual({ watts: 812, car: 'plugged' });
	});

	it('shows a blip below zero as nothing', () => {
		expect(toLive({ zappi: [{ sno: 1, grd: -14, pst: 'A' }] }).watts).toBe(0);
	});

	it('needs a Zappi', () => {
		expect(() => toLive({})).toThrow('myenergi sent no Zappi');
	});
});

describe('toMinutes', () => {
	it('reads the rows as UTC, with a missing hour or minute as zero', () => {
		expect(
			toMinutes([
				{ yr: 2026, mon: 10, dom: 28, imp: 9000 },
				{ yr: 2026, mon: 10, dom: 28, min: 1, imp: 9000, h1d: 4000 },
				{ yr: 2026, mon: 10, dom: 28, hr: 23, min: 59 }
			])
		).toEqual([
			{ at: '2026-10-28T00:00:00.000Z', imported: 9000, car: 0 },
			{ at: '2026-10-28T00:01:00.000Z', imported: 9000, car: 4000 },
			{ at: '2026-10-28T23:59:00.000Z', imported: 0, car: 0 }
		]);
	});
});

describe('toHalfHours', () => {
	const minute = (at: string, imported: number, car: number): Minute => ({
		at: `2026-10-28T${at}:00.000Z`,
		imported,
		car
	});

	it('adds up minutes into Half-hours of House use and Car charging', () => {
		const minutes = [
			minute('04:00', 0.2 * KWH, 0.1 * KWH),
			minute('04:29', 0.3 * KWH, 0.1 * KWH),
			minute('04:30', 0.1 * KWH, 0)
		];
		const halves = toHalfHours(minutes);
		expect(halves.map((h) => h.from)).toEqual(['2026-10-28T04:00:00.000Z', '2026-10-28T04:30:00.000Z']);
		expect(halves[0]!.house).toBeCloseTo(0.3);
		expect(halves[0]!.car).toBeCloseTo(0.2);
		expect(halves[0]!.minutes).toBe(2);
		expect(halves[1]!.house).toBeCloseTo(0.1);
	});

	it('counts a minute that two days’ histories both have once', () => {
		const midnight = minute('00:00', 0.1 * KWH, 0);
		const halves = toHalfHours([midnight, midnight]);
		expect(halves[0]!.house).toBeCloseTo(0.1);
		expect(halves[0]!.minutes).toBe(1);
	});

	it('never has House use below zero', () => {
		expect(toHalfHours([minute('02:00', 0.1 * KWH, 0.12 * KWH)])[0]!.house).toBe(0);
	});
});

describe('utcDays', () => {
	it('lists the UTC days the UK’s yesterday and today touch, in summer time too', () => {
		// UK midnight on 21 June is 23:00 UTC on the 20th.
		expect(utcDays(new Date('2026-06-20T23:00:00Z'), new Date('2026-06-22T08:15:00Z'))).toEqual([
			'2026-06-20',
			'2026-06-21',
			'2026-06-22'
		]);
		expect(utcDays(new Date('2026-10-27T00:00:00Z'), new Date('2026-10-28T08:15:00Z'))).toEqual([
			'2026-10-27',
			'2026-10-28'
		]);
	});
});

describe('Myenergi', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	/** Answers like myenergi: a Digest challenge first, then the answer, with the director naming the server. */
	function stubMyenergi(answers: Record<string, object>) {
		const asked: string[] = [];
		vi.stubGlobal(
			'fetch',
			vi.fn(async (url: string, init?: RequestInit) => {
				const headers = (init?.headers ?? {}) as Record<string, string>;
				if (!headers.authorization) {
					return new Response('', {
						status: 401,
						headers: { 'www-authenticate': 'Digest realm="MyEnergi Telemetry", qop="auth", nonce="abc"' }
					});
				}
				asked.push(url);
				if (url.startsWith('https://director.myenergi.net')) {
					return new Response('{}', { headers: { 'x_myenergi-asn': 's18.myenergi.net' } });
				}
				const path = new URL(url).pathname;
				return answers[path] ? new Response(JSON.stringify(answers[path])) : new Response('', { status: 404 });
			})
		);
		return asked;
	}

	it('finds the account’s server once, then asks it', async () => {
		const asked = stubMyenergi({ '/cgi-jstatus-Z': { zappi: [{ sno: 1, grd: 640, pst: 'C2' }] } });
		const myenergi = new Myenergi('12345678', 'key');
		expect(await myenergi.live()).toEqual({ watts: 640, car: 'charging' });
		await myenergi.live();
		expect(asked).toEqual([
			'https://director.myenergi.net/cgi-jstatus-Z',
			'https://s18.myenergi.net/cgi-jstatus-Z',
			'https://s18.myenergi.net/cgi-jstatus-Z'
		]);
	});

	it('asks for a day’s history by the Zappi’s serial', async () => {
		stubMyenergi({ '/cgi-jday-Z12345678-2026-10-28': { U12345678: [{ yr: 2026, mon: 10, dom: 28, imp: 9000 }] } });
		const minutes = await new Myenergi('12345678', 'key').minutes('2026-10-28');
		expect(minutes).toEqual([{ at: '2026-10-28T00:00:00.000Z', imported: 9000, car: 0 }]);
	});

	it('asks the director again after the server turns it down', async () => {
		const asked = stubMyenergi({});
		const myenergi = new Myenergi('12345678', 'key');
		await expect(myenergi.live()).rejects.toThrow('myenergi answered 404');
		await expect(myenergi.live()).rejects.toThrow();
		expect(asked.filter((u) => u.includes('director'))).toHaveLength(2);
	});
});
