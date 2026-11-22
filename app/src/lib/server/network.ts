// The network the Hub is on, for About this Hub in Settings: the cable or the Wi-Fi, which the Pi falls back to when
// the cable is out (see ansible/roles/hub_config). The Hub's sandbox lets it read the kernel's routes and interfaces,
// and NetworkManager answers nmcli over D-Bus without root.
import { HUB_NETWORK_FILE } from '$app/env/private';
import { execFile } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import type { Network } from '#lib/network.ts';

export interface NetworkSources {
	/** /proc/net/route's text. Throws where there isn't one, such as on Windows. */
	routes: () => string;
	/** Whether the interface is a Wi-Fi one. */
	isWireless: (iface: string) => boolean;
	/** The interface's IPv4 address, or null. */
	address: (iface: string) => string | null;
	/** nmcli's terse output for the Wi-Fi's networks: ACTIVE:SSID:SIGNAL lines. Rejects if nmcli can't answer. */
	wifiList: (iface: string) => Promise<string>;
}

const RTF_UP = 0x1;

/** The interface the default route goes out of, preferring the lowest metric as the kernel does; null if none. */
export function defaultInterface(routes: string): string | null {
	let best: { iface: string; metric: number } | null = null;
	for (const line of routes.split('\n').slice(1)) {
		const [iface, destination, , flags, , , metric] = line.trim().split(/\s+/);
		if (!iface || destination !== '00000000' || !(Number.parseInt(flags, 16) & RTF_UP)) continue;
		const m = Number.parseInt(metric, 10);
		if (!best || m < best.metric) best = { iface, metric: m };
	}
	return best?.iface ?? null;
}

/** Splits one line of nmcli's terse output, where a field's own ':' and '\' are escaped with '\'. */
export function splitTerse(line: string): string[] {
	const fields = [''];
	for (let i = 0; i < line.length; i++) {
		const c = line[i];
		if (c === '\\' && i + 1 < line.length) fields[fields.length - 1] += line[++i];
		else if (c === ':') fields.push('');
		else fields[fields.length - 1] += c;
	}
	return fields;
}

/** The Wi-Fi it's joined, from `nmcli -t -f ACTIVE,SSID,SIGNAL device wifi list`. */
export function activeWifi(list: string): { name: string | null; signal: number | null } {
	for (const line of list.split('\n')) {
		const [active, ssid, signal] = splitTerse(line.trimEnd());
		if (active !== 'yes') continue;
		const s = Number.parseInt(signal ?? '', 10);
		return { name: ssid || null, signal: Number.isFinite(s) ? s : null };
	}
	return { name: null, signal: null };
}

const realSources: NetworkSources = {
	routes: () => readFileSync('/proc/net/route', 'utf8'),
	isWireless: (iface) => existsSync(`/sys/class/net/${iface}/wireless`),
	address: (iface) => networkInterfaces()[iface]?.find((a) => a.family === 'IPv4' && !a.internal)?.address ?? null,
	wifiList: (iface) =>
		new Promise((resolve, reject) =>
			execFile(
				'nmcli',
				['-t', '-f', 'ACTIVE,SSID,SIGNAL', 'device', 'wifi', 'list', 'ifname', iface, '--rescan', 'no'],
				{ timeout: 3000 },
				(error, stdout) => (error ? reject(error) : resolve(stdout))
			)
		)
};

/** The network it's on, or null where it can't tell, such as on a PC running Windows. */
export async function readNetwork(sources: NetworkSources = realSources): Promise<Network | null> {
	let routes: string;
	try {
		routes = sources.routes();
	} catch {
		return null;
	}
	const iface = defaultInterface(routes);
	if (!iface) return { kind: 'none' };
	const address = sources.address(iface);
	if (!sources.isWireless(iface)) return { kind: 'cable', address };
	// Still worth saying it's on the Wi-Fi if NetworkManager doesn't answer.
	const wifi = await sources.wifiList(iface).then(activeWifi, () => ({ name: null, signal: null }));
	return { kind: 'wifi', address, ...wifi };
}

/** The network to show in Settings: the tests' stand-in if they've given one, so it's the same on every machine. */
export async function hubNetwork(): Promise<Network | null> {
	if (HUB_NETWORK_FILE) return JSON.parse(readFileSync(HUB_NETWORK_FILE, 'utf8')) as Network;
	return readNetwork();
}
