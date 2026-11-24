// Live updates (AB#59, backend/README.md Live updates): while the list is showing and the app is in front, a
// WebSocket to Web PubSub hears {"list": "shopping", "seq": N} whenever a list changes, from the Hub, another phone
// or this one, and the list catches up. The message never carries the change itself, so a missed one costs
// nothing: the app also catches up each time it connects. The connection closes when the app is put away and opens
// again when it's back in front (Ross, 2026-11-24), which keeps within Web PubSub's free 20 connections.
import { SignedOut } from './shopping.svelte.ts';

// Reconnecting waits 1 second, then twice as long each time, up to a minute.
const RETRY_FIRST = 1_000;
const RETRY_MOST = 60_000;

/** The part of a WebSocket the app uses. */
export interface LiveSocket {
	onopen: (() => void) | null;
	onmessage: ((event: { data: unknown }) => void) | null;
	onclose: (() => void) | null;
	close(): void;
}

export interface LiveOptions {
	/** A Web PubSub URL to connect to, from GET /live. Each is used once, as its token is checked on connecting. */
	liveUrl: () => Promise<string>;
	/** A list changed, up to seq. */
	onchanged: (list: string, seq: number) => void;
	/** Connected, or connected again: time to catch up, in case a message was missed meanwhile. */
	onconnected: () => void;
	/** GET /live says to sign in again. Nothing more is tried until start() is called again. */
	onsignedout: () => void;
	open?: (url: string) => LiveSocket;
}

export class Live {
	#options: LiveOptions;
	#open: (url: string) => LiveSocket;
	#wanted = false;
	#socket: LiveSocket | null = null;
	// Changes with every start and stop, so a connection that was on its way when the app was put away is dropped.
	#generation = 0;
	#retryIn = RETRY_FIRST;
	#retryTimer: ReturnType<typeof setTimeout> | undefined;

	constructor(options: LiveOptions) {
		this.#options = options;
		// A WebSocket's handlers take events this ignores, so it's a LiveSocket in all but its types.
		this.#open = options.open ?? ((url) => new WebSocket(url) as unknown as LiveSocket);
	}

	/** Connects, if it isn't already. */
	start(): void {
		if (this.#wanted) return;
		this.#wanted = true;
		this.#generation++;
		this.#retryIn = RETRY_FIRST;
		void this.#connect(this.#generation);
	}

	/** Closes the connection, and stops reconnecting. */
	stop(): void {
		this.#wanted = false;
		this.#generation++;
		clearTimeout(this.#retryTimer);
		const socket = this.#socket;
		this.#socket = null;
		socket?.close();
	}

	async #connect(generation: number): Promise<void> {
		let url: string;
		try {
			url = await this.#options.liveUrl();
		} catch (error) {
			if (generation !== this.#generation) return;
			if (error instanceof SignedOut) {
				this.stop();
				this.#options.onsignedout();
				return;
			}
			return this.#again(generation);
		}
		if (generation !== this.#generation) return;

		const socket = this.#open(url);
		this.#socket = socket;
		socket.onopen = () => {
			if (generation !== this.#generation) return;
			this.#retryIn = RETRY_FIRST;
			this.#options.onconnected();
		};
		socket.onmessage = (event) => {
			if (generation !== this.#generation) return;
			const message = parse(event.data);
			if (message) this.#options.onchanged(message.list, message.seq);
		};
		socket.onclose = () => {
			if (generation !== this.#generation || this.#socket !== socket) return;
			this.#socket = null;
			this.#again(generation);
		};
	}

	#again(generation: number): void {
		this.#retryTimer = setTimeout(() => {
			if (generation === this.#generation) void this.#connect(generation);
		}, this.#retryIn);
		this.#retryIn = Math.min(this.#retryIn * 2, RETRY_MOST);
	}
}

function parse(data: unknown): { list: string; seq: number } | null {
	if (typeof data !== 'string') return null;
	try {
		const message = JSON.parse(data) as { list?: unknown; seq?: unknown };
		return typeof message.list === 'string' && typeof message.seq === 'number'
			? { list: message.list, seq: message.seq }
			: null;
	} catch {
		return null;
	}
}
