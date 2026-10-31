// How long a sync with Octopus or myenergi has been failing, so the Hub can say when it needs Alex (ADR 0007).

/** A sync failing for this long needs a grown-up, as for Google. */
export const NEEDS_ALEX_MS = 60 * 60_000;

/** One sync's run of failures: when it started, and whether the hour has been logged. */
export class Failing {
	readonly #name: string;
	#since: number | null = null;
	#logged = false;

	constructor(name: string) {
		this.#name = name;
	}

	ok(): void {
		this.#since = null;
		this.#logged = false;
	}

	/**
	 * Notes a failure. Once the run passes an hour, logs it once: the line telemetry turns into an alert for Alex when the
	 * Hub has telemetry (ADR 0005).
	 */
	failed(now = Date.now()): void {
		this.#since ??= now;
		if (!this.#logged && now - this.#since >= NEEDS_ALEX_MS) {
			console.error(`${this.#name} sync failing for over an hour, since ${new Date(this.#since).toISOString()}`);
			this.#logged = true;
		}
	}

	/** When the run of failures started, once it's lasted an hour; otherwise null. */
	needsAlex(now = Date.now()): string | null {
		return this.#since !== null && now - this.#since >= NEEDS_ALEX_MS ? new Date(this.#since).toISOString() : null;
	}
}
