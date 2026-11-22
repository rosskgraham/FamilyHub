// The Nest's heating, as the header shows it beside the weather (ADR 0013).

/** What the Nest last said. */
export interface HeatingReading {
	/** Inside, in °C, as the Nest measured it. */
	temperature: number;
	/** Inside, as a percentage, or null if the Nest didn't say. */
	humidity: number | null;
	/** The Nest is calling for heat now. */
	heating: boolean;
	/** Heat follows the schedule or a target set on the dial; Eco and Off are set on the Nest or in its app. */
	mode: 'heat' | 'eco' | 'off';
	/** What it heats to: the target in Heat, the Eco temperature in Eco. Null when Off, or when it didn't say. */
	target: number | null;
}

export type Heating =
	| ({ reporting: true } & HeatingReading)
	| {
			reporting: false;
			/** When the Nest last answered, as an ISO instant, or null if it hasn't since the Hub started. */
			since: string | null;
			/** Google has ended the Nest sign-in, so it needs connecting again in Settings. */
			signInEnded?: true;
	  };

/** Degrees to the nearest half, as the Nest shows them: 19.5 or 21. */
export function formatDegrees(celsius: number): string {
	return String(Math.round(celsius * 2) / 2);
}

/** "Heating to 21°", "Set to 18°", "Eco · keeps above 12°" or "Heating off". */
export function heatingSummary(reading: HeatingReading): string {
	const target = reading.target === null ? null : `${formatDegrees(reading.target)}°`;
	if (reading.mode === 'off') return 'Heating off';
	if (reading.mode === 'eco') return target ? `Eco · keeps above ${target}` : 'Eco';
	if (!target) return reading.heating ? 'Heating' : 'Heating on';
	return reading.heating ? `Heating to ${target}` : `Set to ${target}`;
}

// Changing the target from the Hub (ADR 0013): only in Heat, between these limits, in the Nest's own steps.
export const MIN_TARGET = 16;
export const MAX_TARGET = 22;
export const TARGET_STEP = 0.5;

/** The target one step up or down from `target`, kept within the limits. One outside them comes back to the nearest. */
export function stepTarget(target: number, direction: 1 | -1): number {
	const stepped = Math.round((target + direction * TARGET_STEP) / TARGET_STEP) * TARGET_STEP;
	return Math.min(MAX_TARGET, Math.max(MIN_TARGET, stepped));
}

/** A target the Hub may send: within the limits and on a step. */
export function isAllowedTarget(value: unknown): value is number {
	return (
		typeof value === 'number' && value >= MIN_TARGET && value <= MAX_TARGET && Number.isInteger(value / TARGET_STEP)
	);
}

/**
 * Why the target can't be changed from the Hub now, or null if it can. In Eco or Off the Nest won't take one, and with
 * no reading there's nothing to change from.
 */
export function whyNoTarget(heating: Heating): string | null {
	if (!heating.reporting) {
		const again = heating.signInEnded ? ' Connect it again in Settings.' : '';
		return `The Nest isn’t reporting, so the target can’t be changed here.${again}`;
	}
	if (heating.mode === 'eco')
		return 'The Nest is in Eco, so the target can’t be changed here. Turn Eco off on the Nest or in the Nest app.';
	if (heating.mode === 'off')
		return 'The heating is off, so the target can’t be changed here. Turn it on on the Nest or in the Nest app.';
	if (heating.target === null) return 'The Nest isn’t saying its target, so it can’t be changed here.';
	return null;
}

/** What came of a change of target, with the heating as the thermostat reports it afterwards. */
export interface TargetChange {
	/** Changed; failed, so the Nest kept its target; or refused, as the Nest won't take a target now. */
	outcome: 'changed' | 'failed' | 'refused';
	heating: Heating;
}
