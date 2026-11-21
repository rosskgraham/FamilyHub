// The Pi's CPU temperature, for Settings, to see whether the Pi needs a fan. Read from the kernel, which the Hub's
// sandbox still allows; `vcgencmd`, which also says whether the Pi has throttled, needs devices the sandbox hides.
import { HUB_THERMAL_ZONE } from '$app/env/private';
import { readFileSync } from 'node:fs';

const THERMAL_ZONE = HUB_THERMAL_ZONE ?? '/sys/class/thermal/thermal_zone0/temp';
const SAMPLE_MS = 60_000;

export interface PiTemperature {
	/** °C, now. */
	now: number;
	/** °C, the highest seen since the Hub started, checked every minute. */
	highest: number;
}

/** The temperature in °C, or null where there isn't one to read, such as on a PC. */
export function readTemperature(read: (path: string) => string = (p) => readFileSync(p, 'utf8')): number | null {
	try {
		const milli = Number.parseInt(read(THERMAL_ZONE).trim(), 10);
		return Number.isFinite(milli) ? Math.round(milli / 100) / 10 : null;
	} catch {
		return null;
	}
}

let highest: number | null = null;

/** Remembers a reading if it's the highest yet. */
export function record(celsius: number | null): void {
	if (celsius !== null && (highest === null || celsius > highest)) highest = celsius;
}

/** Now and the highest since start, or null on a machine with no temperature to read. */
export function piTemperature(read?: (path: string) => string): PiTemperature | null {
	const now = readTemperature(read);
	if (now === null) return null;
	record(now);
	return { now, highest: highest ?? now };
}

/** For tests. */
export function resetHighest(): void {
	highest = null;
}

/** Checks every minute, so the highest includes the hot spells nobody had Settings open for. */
export function startTemperatureWatch(): void {
	const first = readTemperature();
	if (first === null) return;
	record(first);
	// Never what keeps the Hub running, so it can stop when it's told to, such as for a new release.
	const timer = setInterval(() => record(readTemperature()), SAMPLE_MS).unref();
	process.once('sveltekit:shutdown', () => clearInterval(timer));
}
