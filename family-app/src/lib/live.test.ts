import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Live, type LiveSocket } from './live.ts';
import { SignedOut } from './shopping.svelte.ts';

class FakeSocket implements LiveSocket {
	onopen: (() => void) | null = null;
	onmessage: ((event: { data: unknown }) => void) | null = null;
	onclose: (() => void) | null = null;
	closed = false;
	constructor(readonly url: string) {}
	close() {
		this.closed = true;
		this.onclose?.();
	}
	/** Web PubSub, or the network, ends the connection. */
	drop() {
		this.onclose?.();
	}
	say(data: unknown) {
		this.onmessage?.({ data });
	}
}

function setUp() {
	let n = 0;
	const sockets: FakeSocket[] = [];
	const liveUrl = vi.fn(async () => `wss://live.example/client?access_token=t${++n}`);
	const onchanged = vi.fn();
	const onconnected = vi.fn();
	const onsignedout = vi.fn();
	const live = new Live({
		liveUrl,
		onchanged,
		onconnected,
		onsignedout,
		open: (url) => {
			const socket = new FakeSocket(url);
			sockets.push(socket);
			return socket;
		}
	});
	/** The socket opened last, opened. */
	const connected = () => {
		const socket = sockets.at(-1)!;
		socket.onopen?.();
		return socket;
	};
	return { live, sockets, liveUrl, onchanged, onconnected, onsignedout, connected };
}

const settle = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('live updates', () => {
	it('connects to the URL from GET /live, and catches up once connected', async () => {
		const { live, sockets, onconnected, connected } = setUp();

		live.start();
		await settle();
		expect(sockets.map((socket) => socket.url)).toEqual(['wss://live.example/client?access_token=t1']);
		expect(onconnected).not.toHaveBeenCalled();

		connected();
		expect(onconnected).toHaveBeenCalledOnce();
	});

	it('passes on what changed, and ignores anything that is not a list message', async () => {
		const { live, onchanged, connected } = setUp();
		live.start();
		await settle();
		const socket = connected();

		socket.say('{"list": "shopping", "seq": 12}');
		socket.say('{"list": "todos", "seq": 13}');
		socket.say('not json');
		socket.say('{"seq": 14}');
		socket.say(new ArrayBuffer(2));

		expect(onchanged.mock.calls).toEqual([
			['shopping', 12],
			['todos', 13]
		]);
	});

	it('reconnects with a new URL when the connection drops, after 1 s, then twice as long each time', async () => {
		const { live, sockets, liveUrl, connected } = setUp();
		live.start();
		await settle();
		connected();

		sockets[0]!.drop();
		await vi.advanceTimersByTimeAsync(999);
		expect(sockets).toHaveLength(1);
		await vi.advanceTimersByTimeAsync(1);
		expect(sockets).toHaveLength(2);
		expect(sockets[1]!.url).toBe('wss://live.example/client?access_token=t2');

		// It never opens this time, so the next wait is longer.
		sockets[1]!.drop();
		await vi.advanceTimersByTimeAsync(1_999);
		expect(sockets).toHaveLength(2);
		await vi.advanceTimersByTimeAsync(1);
		expect(sockets).toHaveLength(3);
		expect(liveUrl).toHaveBeenCalledTimes(3);
	});

	it('waits no more than a minute between tries, and starts again from 1 s once connected', async () => {
		const { live, sockets, connected } = setUp();
		live.start();
		await settle();
		for (let i = 0; i < 10; i++) {
			sockets.at(-1)!.drop();
			await vi.advanceTimersByTimeAsync(60_000);
		}
		expect(sockets).toHaveLength(11);

		connected().drop();
		await vi.advanceTimersByTimeAsync(1_000);
		expect(sockets).toHaveLength(12);
	});

	it('catches up again on reconnecting, in case a message was missed', async () => {
		const { live, sockets, onconnected, connected } = setUp();
		live.start();
		await settle();
		connected();
		sockets[0]!.drop();
		await vi.advanceTimersByTimeAsync(1_000);
		connected();

		expect(onconnected).toHaveBeenCalledTimes(2);
	});

	it('closes when stopped, as when the app is put away, and reconnects when started again', async () => {
		const { live, sockets, connected } = setUp();
		live.start();
		await settle();
		connected();

		live.stop();
		expect(sockets[0]!.closed).toBe(true);
		await vi.advanceTimersByTimeAsync(120_000);
		expect(sockets).toHaveLength(1);

		live.start();
		await settle();
		expect(sockets).toHaveLength(2);
		expect(sockets[1]!.url).toBe('wss://live.example/client?access_token=t2');
	});

	it("doesn't connect if stopped while GET /live is on its way", async () => {
		const { live, sockets } = setUp();

		live.start();
		live.stop();
		await settle();

		expect(sockets).toEqual([]);
	});

	it('connects once, however often it is started', async () => {
		const { live, sockets } = setUp();

		live.start();
		live.start();
		await settle();

		expect(sockets).toHaveLength(1);
	});

	it('tries GET /live again on the same backoff when it fails, as with no signal', async () => {
		const { live, sockets, liveUrl } = setUp();
		liveUrl.mockRejectedValueOnce(new TypeError('Failed to fetch'));
		liveUrl.mockRejectedValueOnce(new Error('The backend answered 503'));

		live.start();
		await settle();
		expect(sockets).toEqual([]);
		await vi.advanceTimersByTimeAsync(1_000);
		expect(sockets).toEqual([]);
		await vi.advanceTimersByTimeAsync(2_000);
		expect(sockets).toHaveLength(1);
	});

	it('asks to sign in again, and stops trying, when GET /live says 401', async () => {
		const { live, sockets, liveUrl, onsignedout } = setUp();
		liveUrl.mockRejectedValue(new SignedOut());

		live.start();
		await vi.advanceTimersByTimeAsync(120_000);

		expect(onsignedout).toHaveBeenCalledOnce();
		expect(liveUrl).toHaveBeenCalledOnce();
		expect(sockets).toEqual([]);
	});
});
