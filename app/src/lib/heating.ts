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
