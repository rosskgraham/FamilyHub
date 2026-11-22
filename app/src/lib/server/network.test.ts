import { describe, expect, it } from 'vitest';
import { activeWifi, defaultInterface, readNetwork, splitTerse, type NetworkSources } from './network.ts';

// /proc/net/route on a Pi with its cable in (metric 100) and on the Wi-Fi (600), as NetworkManager sets them.
const HEADER = 'Iface\tDestination\tGateway \tFlags\tRefCnt\tUse\tMetric\tMask\t\tMTU\tWindow\tIRTT';
const CABLE_DEFAULT = 'eth0\t00000000\t0100A8C0\t0003\t0\t0\t100\t00000000\t0\t0\t0';
const CABLE_LOCAL = 'eth0\t0000A8C0\t00000000\t0001\t0\t0\t100\t00FFFFFF\t0\t0\t0';
const WIFI_DEFAULT = 'wlan0\t00000000\t0100A8C0\t0003\t0\t0\t600\t00000000\t0\t0\t0';
const WIFI_LOCAL = 'wlan0\t0000A8C0\t00000000\t0001\t0\t0\t600\t00FFFFFF\t0\t0\t0';
const routes = (...lines: string[]) => [HEADER, ...lines, ''].join('\n');

const sources = (over: Partial<NetworkSources>): NetworkSources => ({
	routes: () => routes(),
	isWireless: (iface) => iface.startsWith('wlan'),
	address: (iface) => (iface === 'eth0' ? '192.168.0.238' : '192.168.0.240'),
	wifiList: async () => 'no:Next door:40\nyes:Home Wi-Fi:72\n',
	...over
});

describe('defaultInterface', () => {
	it('prefers the cable when both are up, as its metric is lower', () => {
		expect(defaultInterface(routes(WIFI_DEFAULT, WIFI_LOCAL, CABLE_DEFAULT, CABLE_LOCAL))).toBe('eth0');
	});

	it('uses the Wi-Fi when the cable is out', () => {
		expect(defaultInterface(routes(WIFI_DEFAULT, WIFI_LOCAL))).toBe('wlan0');
	});

	it('has none without a default route', () => {
		expect(defaultInterface(routes(CABLE_LOCAL))).toBeNull();
	});

	it('ignores a default route that is down', () => {
		expect(defaultInterface(routes(CABLE_DEFAULT.replace('0003', '0002')))).toBeNull();
	});
});

describe('splitTerse', () => {
	it('keeps escaped colons and backslashes in a field', () => {
		expect(splitTerse('yes:Cafe\\: guest \\\\ 5G:64')).toEqual(['yes', 'Cafe: guest \\ 5G', '64']);
	});
});

describe('activeWifi', () => {
	it('picks the Wi-Fi it has joined', () => {
		expect(activeWifi('no:Next door:40\nyes:Home Wi-Fi:72\n')).toEqual({ name: 'Home Wi-Fi', signal: 72 });
	});

	it('has neither when none is joined', () => {
		expect(activeWifi('no:Next door:40\n')).toEqual({ name: null, signal: null });
	});

	it('has no name for a hidden network', () => {
		expect(activeWifi('yes::55')).toEqual({ name: null, signal: 55 });
	});
});

describe('readNetwork', () => {
	it('is on the cable when the default route goes out of it', async () => {
		const network = await readNetwork(sources({ routes: () => routes(CABLE_DEFAULT, WIFI_DEFAULT) }));
		expect(network).toEqual({ kind: 'cable', address: '192.168.0.238' });
	});

	it('is on the Wi-Fi, with its name and signal, when the cable is out', async () => {
		const network = await readNetwork(sources({ routes: () => routes(WIFI_DEFAULT) }));
		expect(network).toEqual({ kind: 'wifi', address: '192.168.0.240', name: 'Home Wi-Fi', signal: 72 });
	});

	it('still says it is on the Wi-Fi when NetworkManager does not answer', async () => {
		const network = await readNetwork(
			sources({ routes: () => routes(WIFI_DEFAULT), wifiList: () => Promise.reject(new Error('ENOENT')) })
		);
		expect(network).toEqual({ kind: 'wifi', address: '192.168.0.240', name: null, signal: null });
	});

	it('is not connected without a default route', async () => {
		expect(await readNetwork(sources({ routes: () => routes(CABLE_LOCAL) }))).toEqual({ kind: 'none' });
	});

	it('cannot tell where there are no routes to read, such as on Windows', async () => {
		const network = await readNetwork(
			sources({
				routes: () => {
					throw new Error('ENOENT');
				}
			})
		);
		expect(network).toBeNull();
	});
});
