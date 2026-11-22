import type { HeatingReading } from '#lib/heating.ts';

// The thermostat's traits, as Google's Smart Device Management (SDM) API reports them, turned into what the header
// shows. See https://developers.google.com/nest/device-access/traits.

export interface SdmDevice {
	/** enterprises/<project ID>/devices/<device ID>. Never logged (ADR 0013). */
	name: string;
	type: string;
	traits: Record<string, Record<string, unknown> | undefined>;
}

export interface SdmDevices {
	devices?: SdmDevice[];
}

const THERMOSTAT = 'sdm.devices.types.THERMOSTAT';

/** Google answered, but says the Nest is offline, so what it reports is old. */
export class NestOffline extends Error {
	constructor() {
		super('The Nest is offline');
	}
}

/** Signed in, but no thermostat was chosen on the Partner Connections page, or it's been removed since. */
export class NoThermostat extends Error {
	constructor() {
		super('No thermostat is shared with the Hub');
	}
}

const num = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);

/** The first thermostat, from the answer to listing the project's devices. */
export function findThermostat(answer: SdmDevices): SdmDevice {
	const device = answer.devices?.find((d) => d.type === THERMOSTAT);
	if (!device) throw new NoThermostat();
	return device;
}

/** The first thermostat's reading, from the answer to listing the project's devices. */
export function fromSdm(answer: SdmDevices): HeatingReading {
	const device = findThermostat(answer);
	const trait = (name: string) => device.traits[`sdm.devices.traits.${name}`] ?? {};

	if (trait('Connectivity').status === 'OFFLINE') throw new NestOffline();
	const temperature = num(trait('Temperature').ambientTemperatureCelsius);
	if (temperature === null) throw new Error('The Nest didn’t say the temperature');

	const heating = trait('ThermostatHvac').status === 'HEATING';
	const humidity = num(trait('Humidity').ambientHumidityPercent);
	if (trait('ThermostatMode').mode === 'OFF') return { temperature, humidity, heating, mode: 'off', target: null };
	const eco = trait('ThermostatEco');
	if (eco.mode === 'MANUAL_ECO') return { temperature, humidity, heating, mode: 'eco', target: num(eco.heatCelsius) };
	const target = num(trait('ThermostatTemperatureSetpoint').heatCelsius);
	return { temperature, humidity, heating, mode: 'heat', target };
}
