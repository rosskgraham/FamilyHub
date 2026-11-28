import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BackendRequest } from './auth.ts';
import {
	connectLive,
	duration,
	FIRST_RETRY_MS,
	liveConnected,
	MAX_RETRY_MS,
	startLiveUpdates,
	STAYED_UP_MS,
	type Live,
	type LiveSocket
} from './live.ts';

// Without the backend's settings, as the e2e tests are.
vi.mock('$app/env/private', () => ({
	BACKEND_URL: undefined,
	ENTRA_TENANT_ID: undefined,
	ENTRA_SUBDOMAIN: undefined,
	BACKEND_API_CLIENT_ID: undefined,
	HUB_CLIENT_ID: undefined,
	HUB_CERTIFICATE: undefined
}));

const TOKEN = 'secret-token';

/** A socket the test opens, sends to and closes, as Web PubSub would. */
class FakeSocket implements LiveSocket {
	onopen: LiveSocket['onopen'] = null;
	onmessage: LiveSocket['onmessage'] = null;
	onclose: LiveSocket['onclose'] = null;
	onerror: LiveSocket['onerror'] = null;
	closed = false;
	constructor(readonly url: string) {}
	open() {
		this.onopen?.();
	}
	send(message: unknown) {
		this.onmessage?.({ data: JSON.stringify(message) });
	}
	/** Closed from the other end, as when Web PubSub or the network drops it. */
	drop(code = 1006, reason = '') {
		this.closed = true;
		this.onclose?.({ code, reason });
	}
	close() {
		this.closed = true;
		this.onclose?.({ code: 1000, reason: '' });
	}
}

let sockets: FakeSocket[];
let urls: number;
let failGetLive: boolean;
let messages: [string, number][];
let connects: number;
let live: Live;
let logs: string[];

const request: BackendRequest = async <T>(method: string, path: string) => {
	expect([method, path]).toEqual(['GET', '/live']);
	if (failGetLive) throw new Error('Backend request failed, GET /live: 503');
	urls += 1;
	return { url: `wss://familyhub.webpubsub.azure.com/client/hubs/familyhub?access_token=${TOKEN}-${urls}` } as T;
};

function start() {
	live = connectLive({
		request,
		onMessage: (list, seq) => messages.push([list, seq]),
		onConnected: () => connects++,
		connect: (url) => {
			const socket = new FakeSocket(url);
			sockets.push(socket);
			return socket;
		}
	});
}

/** Lets GET /live answer and the socket be made. */
const settle = () => vi.advanceTimersByTimeAsync(0);
const latest = () => sockets.at(-1)!;
const openSockets = () => sockets.filter((s) => !s.closed).length;

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(new Date('2026-11-26T09:00:00Z'));
	[sockets, urls, failGetLive, messages, connects, logs] = [[], 0, false, [], 0, []];
	const log = (...args: unknown[]) => void logs.push(args.join(' '));
	vi.spyOn(console, 'log').mockImplementation(log);
	vi.spyOn(console, 'error').mockImplementation(log);
});
afterEach(() => {
	live?.stop();
	vi.useRealTimers();
	vi.restoreAllMocks();
});

describe('connectLive', () => {
	it('opens one WebSocket to the URL from GET /live', async () => {
		start();
		await settle();
		expect(sockets.map((s) => s.url)).toEqual([expect.stringContaining(`access_token=${TOKEN}-1`)]);
		expect(live.connected()).toBe(false);
		latest().open();
		expect(live.connected()).toBe(true);
	});

	it('gets a new URL and reconnects when the connection closes, with only one open however often', async () => {
		start();
		await settle();
		for (let i = 0; i < 5; i++) {
			latest().open();
			await vi.advanceTimersByTimeAsync(STAYED_UP_MS);
			latest().drop();
			expect(live.connected()).toBe(false);
			await vi.advanceTimersByTimeAsync(FIRST_RETRY_MS);
			expect(openSockets()).toBe(1);
		}
		expect(sockets).toHaveLength(6);
		expect(new Set(sockets.map((s) => s.url)).size).toBe(6);
	});

	it('waits longer after each failure, up to a cap', async () => {
		start();
		await settle();
		const waits: number[] = [];
		for (let i = 0; i < 12; i++) {
			const before = sockets.length;
			latest().drop();
			let waited = 0;
			while (sockets.length === before) {
				await vi.advanceTimersByTimeAsync(FIRST_RETRY_MS);
				waited += FIRST_RETRY_MS;
			}
			waits.push(waited);
		}
		expect(waits.slice(0, 5)).toEqual([1, 2, 4, 8, 16].map((n) => n * FIRST_RETRY_MS));
		expect(Math.max(...waits)).toBe(MAX_RETRY_MS);
	});

	it('reconnects quickly again once a connection has stayed up', async () => {
		start();
		await settle();
		for (let i = 0; i < 4; i++) {
			latest().drop();
			await vi.advanceTimersByTimeAsync(MAX_RETRY_MS);
		}
		latest().open();
		await vi.advanceTimersByTimeAsync(STAYED_UP_MS);
		const before = sockets.length;
		latest().drop();
		await vi.advanceTimersByTimeAsync(FIRST_RETRY_MS);
		expect(sockets).toHaveLength(before + 1);
	});

	it('tries GET /live again, waiting longer each time, while the backend can’t give a URL', async () => {
		failGetLive = true;
		start();
		await settle();
		await vi.advanceTimersByTimeAsync(FIRST_RETRY_MS + 2 * FIRST_RETRY_MS);
		expect(sockets).toEqual([]);
		failGetLive = false;
		await vi.advanceTimersByTimeAsync(4 * FIRST_RETRY_MS);
		expect(sockets).toHaveLength(1);
		expect(logs.filter((l) => l.includes('no URL from GET /live'))).toHaveLength(3);
	});

	it('says each time it connects, after every reconnect too, so changes queued meanwhile can go (AB#108)', async () => {
		start();
		await settle();
		expect(connects).toBe(0);
		latest().open();
		expect(connects).toBe(1);
		latest().drop();
		await vi.advanceTimersByTimeAsync(FIRST_RETRY_MS);
		expect(connects).toBe(1);
		latest().open();
		expect(connects).toBe(2);
	});

	it('passes on each list’s messages, and ignores anything else', async () => {
		start();
		await settle();
		latest().open();
		latest().send({ list: 'shopping', seq: 12 });
		latest().send({ list: 'todos', seq: 13 });
		latest().send({ hello: 'there' });
		latest().onmessage?.({ data: 'not json' });
		expect(messages).toEqual([
			['shopping', 12],
			['todos', 13]
		]);
	});

	it('logs each open and close with the code, reason and how long it was open, and never the URL or token', async () => {
		start();
		await settle();
		latest().drop(1006, '');
		await vi.advanceTimersByTimeAsync(FIRST_RETRY_MS);
		latest().open();
		await vi.advanceTimersByTimeAsync(61 * 60_000 + 5_000);
		latest().drop(1008, 'Token expired');
		expect(logs).toEqual([
			`Live updates couldn't connect: code 1006, reason ""`,
			'Live updates connected',
			'Live updates closed after 1h 01m 05s: code 1008, reason "Token expired"'
		]);
		expect(logs.join('\n')).not.toMatch(/token=|secret|wss:/);
	});

	it('stops reconnecting once stopped', async () => {
		start();
		await settle();
		latest().open();
		live.stop();
		await vi.advanceTimersByTimeAsync(MAX_RETRY_MS);
		expect(sockets).toHaveLength(1);
		expect(openSockets()).toBe(0);
	});
});

describe('startLiveUpdates', () => {
	it('doesn’t connect without the backend’s settings, and says it isn’t connected', () => {
		expect(startLiveUpdates({ onMessage: () => {} })).toBeNull();
		expect(liveConnected()).toBe(false);
	});

	it('stops when the Hub shuts down, so nothing keeps Node running (AB#41)', async () => {
		let asked = 0;
		const request = (async () => {
			asked++;
			throw new Error('fetch failed');
		}) as unknown as BackendRequest;
		startLiveUpdates({ onMessage: () => {} }, { request });
		await vi.advanceTimersByTimeAsync(0);
		expect(asked).toBe(1);

		process.emit('sveltekit:shutdown' as 'SIGTERM');
		await vi.advanceTimersByTimeAsync(MAX_RETRY_MS * 2);
		expect(asked).toBe(1);
		expect(vi.getTimerCount()).toBe(0);
	});
});

describe('duration', () => {
	it('says how long, in hours, minutes and seconds', () => {
		expect(duration(42_000)).toBe('42s');
		expect(duration(45 * 60_000 + 3_000)).toBe('45m 03s');
		expect(duration(26 * 3_600_000 + 60_000)).toBe('26h 01m 00s');
	});
});
