import { stepTarget, type TargetChange } from './heating.ts';

// The Heating panel's − and +, like turning the Nest's dial: each tap shows the new target at once, and once the taps
// have stopped the last one is sent, so a run of taps is one change.

/** How long after the last tap the target is sent. */
export const SEND_AFTER_MS = 2000;

export interface DialOptions {
	/** Sends the target. Resolves to what came of it, or null if the Hub couldn't be reached. */
	send(target: number): Promise<TargetChange | null>;
	/** Called whenever what the dial shows changes. */
	onchange(): void;
	setTimeout?: (run: () => void, ms: number) => unknown;
	clearTimeout?: (timer: unknown) => void;
}

export interface Dial {
	/** The target tapped to and not yet sent or answered, or null to show the Nest's own. */
	readonly target: number | null;
	/** The last change didn't happen, so the Nest still has its own target. */
	readonly failed: boolean;
	/** One step up or down from what's shown: the tapped target, or `nest`, the Nest's own. */
	tap(direction: 1 | -1, nest: number): void;
	/** Sends a tapped target now, such as when the panel closes, so it isn't lost. */
	flush(): void;
	/** Forgets the last failure, for a panel opened afresh. */
	reset(): void;
}

export function createDial(options: DialOptions): Dial {
	const later = options.setTimeout ?? ((run, ms) => setTimeout(run, ms));
	const cancel = options.clearTimeout ?? ((timer) => clearTimeout(timer as ReturnType<typeof setTimeout>));
	let target: number | null = null;
	let failed = false;
	let timer: unknown = null;
	// Counts the taps, so an answer that arrives after more taps leaves them showing.
	let taps = 0;

	async function send(): Promise<void> {
		timer = null;
		const to = target!;
		const sent = taps;
		const change = await options.send(to).catch(() => null);
		if (taps !== sent) return;
		failed = change?.outcome !== 'changed';
		target = null;
		options.onchange();
	}

	return {
		get target() {
			return target;
		},
		get failed() {
			return failed;
		},
		tap(direction, nest) {
			target = stepTarget(target ?? nest, direction);
			failed = false;
			taps += 1;
			if (timer !== null) cancel(timer);
			timer = later(() => void send(), SEND_AFTER_MS);
			options.onchange();
		},
		flush() {
			if (timer === null) return;
			cancel(timer);
			void send();
		},
		reset() {
			failed = false;
			options.onchange();
		}
	};
}
