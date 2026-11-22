import { describe, expect, it } from 'vitest';
import { networkDetails, networkKind } from './network.ts';

describe('networkKind and networkDetails', () => {
	it('say the cable and its address', () => {
		const n = { kind: 'cable', address: '192.168.0.238' } as const;
		expect([networkKind(n), networkDetails(n)]).toEqual(['Cable', '192.168.0.238']);
	});

	it('say the Wi-Fi, its name, signal and address', () => {
		const n = { kind: 'wifi', address: '192.168.0.240', name: 'Home Wi-Fi', signal: 72 } as const;
		expect([networkKind(n), networkDetails(n)]).toEqual(['Wi-Fi', 'Home Wi-Fi · signal 72% · 192.168.0.240']);
	});

	it('leave out what NetworkManager could not say', () => {
		const n = { kind: 'wifi', address: '192.168.0.240', name: null, signal: null } as const;
		expect(networkDetails(n)).toBe('192.168.0.240');
	});

	it('say when it is not connected', () => {
		const n = { kind: 'none' } as const;
		expect([networkKind(n), networkDetails(n)]).toEqual(['Not connected', '']);
	});
});
