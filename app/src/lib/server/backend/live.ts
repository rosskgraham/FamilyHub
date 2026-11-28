// The Hub's live connection to the backend (backend/README.md, Live updates): one WebSocket to Web PubSub, from a URL
// GET /live gives, whose token lasts 60 minutes. After each change the backend sends {"list": "shopping", "seq": N}.
// When the connection closes, the Hub gets a new URL and connects again. Each open and close is logged with how long it
// was open, to find out whether an open connection outlives its token (AB#82).
import type { BackendRequest } from './auth.ts';
import { backend } from './index.ts';

/** What the Hub needs of a WebSocket: Node's own, or a fake in tests. */
export interface LiveSocket {
	onopen: (() => void) | null;
	onmessage: ((event: { data: unknown }) => void) | null;
	onclose: ((event: { code: number; reason: string }) => void) | null;
	onerror: ((event: unknown) => void) | null;
	close(): void;
}

/** The first reconnect after a failure comes this soon, then twice as long each time, up to the cap. */
export const FIRST_RETRY_MS = 1_000;
export const MAX_RETRY_MS = 5 * 60_000;
/** A connection open this long counted as staying up, so the next reconnect is quick again. */
export const STAYED_UP_MS = 60_000;

export interface LiveOptions {
	request: BackendRequest;
	/** Told the list each message names, and its sequence number. */
	onMessage: (list: string, seq: number) => void;
	/** Told each time the connection opens: the first time, and after every reconnect. */
	onConnected?: () => void;
	connect?: (url: string) => LiveSocket;
}

export interface Live {
	/** Whether the connection is open now. */
	connected(): boolean;
	stop(): void;
}

const why = (e: unknown) => (e instanceof Error ? e.message : e);

/** How long a connection was open, such as "1h 02m 05s". */
export function duration(ms: number): string {
	const s = Math.round(ms / 1000);
	const [h, m] = [Math.floor(s / 3600), Math.floor((s % 3600) / 60)];
	const two = (n: number) => String(n).padStart(2, '0');
	return h > 0 ? `${h}h ${two(m)}m ${two(s % 60)}s` : m > 0 ? `${m}m ${two(s % 60)}s` : `${s}s`;
}

function parse(data: unknown): { list: string; seq: number } | null {
	try {
		const message = JSON.parse(String(data)) as { list?: unknown; seq?: unknown };
		return typeof message.list === 'string' && typeof message.seq === 'number'
			? { list: message.list, seq: message.seq }
			: null;
	} catch {
		return null;
	}
}

/** Holds one live connection, reconnecting until stopped. Neither the URL nor its token is ever logged. */
export function connectLive(options: LiveOptions): Live {
	const connect = options.connect ?? ((url: string) => new WebSocket(url) as unknown as LiveSocket);
	let socket: LiveSocket | null = null;
	let open = false;
	let timer: ReturnType<typeof setTimeout> | null = null;
	let failures = 0;
	let stopped = false;

	function retry() {
		const wait = Math.min(FIRST_RETRY_MS * 2 ** failures, MAX_RETRY_MS);
		failures += 1;
		timer = setTimeout(() => {
			timer = null;
			void start();
		}, wait);
	}

	async function start() {
		if (stopped) return;
		let url: string;
		try {
			({ url } = await options.request<{ url: string }>('GET', '/live'));
		} catch (e) {
			console.error('Live updates: no URL from GET /live:', why(e));
			return retry();
		}
		if (stopped) return;
		const ws = connect(url);
		socket = ws;
		let openedAt: number | null = null;
		ws.onopen = () => {
			openedAt = Date.now();
			open = true;
			console.log('Live updates connected');
			options.onConnected?.();
		};
		ws.onmessage = ({ data }) => {
			const message = parse(data);
			if (message) options.onMessage(message.list, message.seq);
		};
		// A close always follows an error, and says why.
		ws.onerror = () => {};
		ws.onclose = ({ code, reason }) => {
			if (socket !== ws) return;
			socket = null;
			open = false;
			const how = `code ${code}, reason "${reason}"`;
			if (openedAt === null) console.error(`Live updates couldn't connect: ${how}`);
			else {
				const lasted = Date.now() - openedAt;
				console.log(`Live updates closed after ${duration(lasted)}: ${how}`);
				if (lasted >= STAYED_UP_MS) failures = 0;
			}
			if (!stopped) retry();
		};
	}

	void start();
	return {
		connected: () => open,
		stop() {
			stopped = true;
			if (timer) clearTimeout(timer);
			const ws = socket;
			socket = null;
			open = false;
			ws?.close();
		}
	};
}

let current: Live | null = null;

/** Starts the Hub's live connection once it has the backend's settings. Without them, it doesn't connect. */
export function startLiveUpdates(
	handlers: Pick<LiveOptions, 'onMessage' | 'onConnected'>,
	api: { request: BackendRequest } | null = backend()
): Live | null {
	if (!api) return null;
	if (!current) {
		current = connectLive({ request: api.request, ...handlers });
		// Its socket and reconnect timer would keep Node running after the server has closed (AB#41).
		const live = current;
		process.once('sveltekit:shutdown', () => live.stop());
	}
	return current;
}

/** Whether the live connection is open now, so lists it keeps fresh can catch up less often. */
export const liveConnected = (): boolean => current?.connected() ?? false;
