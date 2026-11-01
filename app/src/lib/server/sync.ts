// Keeping a data source's last good answer, and fetching a new one in the background.
//
// Every source the Hub shows (the Calendars, the Shopping list, the weather, Octopus and the Zappi) works the same way:
// a page asks for the latest answer and gets it at once, without waiting on the internet. If it's time for a fresh one,
// one request goes out behind the scenes, and the page after next shows it. Failures are tried again sooner at first,
// then less often, and after an hour of them the Hub says it needs Alex.

/** An answer, and when it arrived. */
export interface Kept<T> {
	value: T;
	at: string;
}

export interface Snapshot<T> {
	/** The last good answer. Null until there's been one, here or on disk. */
	value: T | null;
	/** When it arrived, as an ISO instant. */
	at: string | null;
	/** Why the latest try failed, or null if it worked. */
	error: unknown;
	/** When the run of failures started, once it's lasted an hour; otherwise null. */
	needsAlex: string | null;
}

export interface SyncOptions<T> {
	/** For the logs, such as "Calendar". */
	name: string;
	fetch: () => Promise<T>;
	/** How long an answer is good for before asking again. A function when it depends on something, such as the car. */
	everyMs: number | (() => number);
	/** The last answer kept on disk, read on the first ask, so a restart without internet still has something to show. */
	load?: () => Promise<Kept<T> | null>;
	/** Keeps an answer on disk. Called when it changes, and otherwise hourly, to spare the Pi's SD card. */
	save?: (kept: Kept<T>) => Promise<void>;
	/** Milliseconds since 1970: Date.now, or a fake one in tests. */
	clock?: () => number;
}

export interface Sync<T> {
	/** The latest answer at once, starting a fetch if one is due. Waits only when there's nothing to show yet. */
	read(): Promise<Snapshot<T>>;
	/** Fetches now, such as after a change, sharing a fetch already under way. */
	refresh(): Promise<void>;
}

/** The first retry comes this soon after a failure, then twice as long each time, up to the source's own interval. */
export const FIRST_RETRY_MS = 15_000;
export const NEEDS_ALEX_MS = 60 * 60_000;
const REWRITE_MS = 60 * 60_000;

export function createSync<T>(options: SyncOptions<T>): Sync<T> {
	const clock = options.clock ?? Date.now;
	const everyMs = () => (typeof options.everyMs === 'number' ? options.everyMs : options.everyMs());
	let kept: Kept<T> | null = null;
	let loaded: Promise<void> | null = null;
	let inFlight: Promise<void> | null = null;
	let lastTry = -Infinity;
	let error: unknown = null;
	let failures = 0;
	let failingSince: number | null = null;
	let logged = false;
	let written = -Infinity;
	let writtenJson: string | null = null;

	function load(): Promise<void> {
		loaded ??= (async () => {
			try {
				kept = (await options.load?.()) ?? null;
				writtenJson = kept ? JSON.stringify(kept.value) : null;
			} catch (e) {
				console.error(`${options.name}: couldn't read the last answer from disk:`, e);
			}
		})();
		return loaded;
	}

	function due(): boolean {
		const wait = failures === 0 ? everyMs() : Math.min(everyMs(), FIRST_RETRY_MS * 2 ** (failures - 1));
		// Something kept from disk is shown, but checked again straight away.
		return lastTry === -Infinity || clock() - lastTry >= wait;
	}

	async function fetchOnce(): Promise<void> {
		lastTry = clock();
		try {
			const value = await options.fetch();
			kept = { value, at: new Date(clock()).toISOString() };
			error = null;
			failures = 0;
			failingSince = null;
			logged = false;
			await save(kept);
		} catch (e) {
			error = e;
			failures += 1;
			failingSince ??= lastTry;
			console.error(`${options.name} sync failed:`, e instanceof Error ? e.message : e);
			if (!logged && clock() - failingSince >= NEEDS_ALEX_MS) {
				// The line telemetry will turn into an alert for Alex (ADR 0005).
				console.error(`${options.name} sync failing for over an hour, since ${new Date(failingSince).toISOString()}`);
				logged = true;
			}
		}
	}

	async function save(k: Kept<T>): Promise<void> {
		if (!options.save) return;
		const json = JSON.stringify(k.value);
		if (json === writtenJson && clock() - written < REWRITE_MS) return;
		try {
			await options.save(k);
			written = clock();
			writtenJson = json;
		} catch (e) {
			console.error(`${options.name}: couldn't keep the answer on disk:`, e);
		}
	}

	function refresh(): Promise<void> {
		inFlight ??= fetchOnce().finally(() => (inFlight = null));
		return inFlight;
	}

	return {
		async read() {
			await load();
			if (due()) {
				const fetching = refresh();
				if (kept === null) await fetching;
			}
			const needsAlex =
				failingSince !== null && clock() - failingSince >= NEEDS_ALEX_MS ? new Date(failingSince).toISOString() : null;
			return { value: kept?.value ?? null, at: kept?.at ?? null, error, needsAlex };
		},
		async refresh() {
			await load();
			await refresh();
		}
	};
}
