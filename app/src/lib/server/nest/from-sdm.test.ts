import { describe, expect, it } from 'vitest';
import { heatingSummary } from '#lib/heating.ts';
import { fromSdm, NestOffline, NoThermostat, type SdmDevice, type SdmDevices } from './from-sdm.ts';

// The Household's Nest, as the SDM API listed it on 21 November 2026 (AB#42), with its IDs replaced.
const recorded: SdmDevice = {
	name: 'enterprises/project-id/devices/device-id',
	type: 'sdm.devices.types.THERMOSTAT',
	traits: {
		'sdm.devices.traits.Info': { customName: '' },
		'sdm.devices.traits.Humidity': { ambientHumidityPercent: 67 },
		'sdm.devices.traits.Connectivity': { status: 'ONLINE' },
		'sdm.devices.traits.Fan': {},
		'sdm.devices.traits.ThermostatMode': { mode: 'HEAT', availableModes: ['HEAT', 'OFF'] },
		'sdm.devices.traits.ThermostatEco': {
			availableModes: ['OFF', 'MANUAL_ECO'],
			mode: 'OFF',
			heatCelsius: 12,
			coolCelsius: 24.444443
		},
		'sdm.devices.traits.ThermostatHvac': { status: 'OFF' },
		'sdm.devices.traits.Settings': { temperatureScale: 'CELSIUS' },
		'sdm.devices.traits.ThermostatTemperatureSetpoint': { heatCelsius: 11 },
		'sdm.devices.traits.Temperature': { ambientTemperatureCelsius: 14.719986 }
	}
};

/** The recorded answer with some traits changed, as the Nest reports its other states. */
function answer(changes: Record<string, Record<string, unknown>> = {}): SdmDevices {
	const traits = { ...recorded.traits };
	for (const [name, value] of Object.entries(changes)) traits[`sdm.devices.traits.${name}`] = value;
	return { devices: [{ ...recorded, traits }] };
}

const summary = (a: SdmDevices) => heatingSummary(fromSdm(a));

describe('fromSdm', () => {
	it('reads the recorded answer: Heat, not heating, set to 11°', () => {
		expect(fromSdm(answer())).toEqual({
			temperature: 14.719986,
			humidity: 67,
			heating: false,
			mode: 'heat',
			target: 11
		});
		expect(summary(answer())).toBe('Set to 11°');
	});

	it('says "Heating to N" while the Nest is calling for heat', () => {
		const heating = answer({
			ThermostatHvac: { status: 'HEATING' },
			ThermostatTemperatureSetpoint: { heatCelsius: 21 }
		});
		expect(fromSdm(heating).heating).toBe(true);
		expect(summary(heating)).toBe('Heating to 21°');
	});

	it('says "Set to N" in Heat when it isn’t heating, to the nearest half degree', () => {
		expect(summary(answer({ ThermostatTemperatureSetpoint: { heatCelsius: 18.000002 } }))).toBe('Set to 18°');
		expect(summary(answer({ ThermostatTemperatureSetpoint: { heatCelsius: 20.49 } }))).toBe('Set to 20.5°');
	});

	it('says "Eco · keeps above N" in Eco, from the Eco temperature', () => {
		const eco = answer({
			ThermostatEco: { availableModes: ['OFF', 'MANUAL_ECO'], mode: 'MANUAL_ECO', heatCelsius: 12 },
			// In Eco the Nest reports no target of its own.
			ThermostatTemperatureSetpoint: {}
		});
		expect(fromSdm(eco)).toMatchObject({ mode: 'eco', target: 12 });
		expect(summary(eco)).toBe('Eco · keeps above 12°');
	});

	it('says "Heating off" when the mode is Off, whatever else it reports', () => {
		const off = answer({
			ThermostatMode: { mode: 'OFF', availableModes: ['HEAT', 'OFF'] },
			ThermostatTemperatureSetpoint: {}
		});
		expect(fromSdm(off)).toMatchObject({ mode: 'off', target: null, heating: false });
		expect(summary(off)).toBe('Heating off');
	});

	it('keeps going without the humidity', () => {
		expect(fromSdm(answer({ Humidity: {} })).humidity).toBeNull();
	});

	it('turns down a reading Google says is from an offline Nest', () => {
		expect(() => fromSdm(answer({ Connectivity: { status: 'OFFLINE' } }))).toThrow(NestOffline);
	});

	it('says so when no thermostat is shared with the Hub', () => {
		expect(() => fromSdm({})).toThrow(NoThermostat);
		expect(() => fromSdm({ devices: [{ ...recorded, type: 'sdm.devices.types.DOORBELL' }] })).toThrow(NoThermostat);
	});

	it('turns down an answer without the temperature', () => {
		expect(() => fromSdm(answer({ Temperature: {} }))).toThrow(/temperature/);
	});
});
