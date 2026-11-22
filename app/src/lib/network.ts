// The network the Hub is on, for About this Hub in Settings. Read on the server by #lib/server/network.ts.

export type Network =
	| { kind: 'cable'; address: string | null }
	| {
			kind: 'wifi';
			address: string | null;
			/** The Wi-Fi's name, or null if NetworkManager couldn't say. */
			name: string | null;
			/** 0 to 100, as NetworkManager gives it, or null if it couldn't say. */
			signal: number | null;
	  }
	| { kind: 'none' };

/** What it's on, such as "Cable" or "Wi-Fi". */
export function networkKind(network: Network): string {
	if (network.kind === 'cable') return 'Cable';
	if (network.kind === 'wifi') return 'Wi-Fi';
	return 'Not connected';
}

/** The details below it, such as "Home Wi-Fi · signal 72% · 192.168.0.240", or '' when there are none. */
export function networkDetails(network: Network): string {
	if (network.kind === 'none') return '';
	const parts: string[] = [];
	if (network.kind === 'wifi') {
		if (network.name) parts.push(network.name);
		if (network.signal !== null) parts.push(`signal ${network.signal}%`);
	}
	if (network.address) parts.push(network.address);
	return parts.join(' · ');
}
