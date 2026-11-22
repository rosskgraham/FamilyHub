import { CALENDAR_SOURCE, NEST_PROJECT_ID } from '$app/env/private';
import { formatDegrees, whyNoTarget, type Heating, type TargetChange, type HeatingReading } from '#lib/heating.ts';
import { orElse } from '../fallback.ts';
import { clientId, googleAccount, isConfigured, SignInNeeded, type GoogleRequest } from '../google/auth.ts';
import { createSync, type Snapshot } from '../sync.ts';
import { findThermostat, fromSdm, type SdmDevices } from './from-sdm.ts';

// The Nest, through Google's Smart Device Management API (ADR 0013): its own sign-in with the Hub's Google client,
// kept beside the Household's so either can be ended without the other, and asked every couple of minutes.

const SDM = 'https://smartdevicemanagement.googleapis.com/v1';
const SCOPE = 'https://www.googleapis.com/auth/sdm.service';
const PARTNER_CONNECTIONS = 'https://nestservices.google.com';
/** The command that sets the target in Heat, as turning the dial does. The only change the Hub makes (ADR 0013). */
export const SET_HEAT = 'sdm.devices.commands.ThermostatTemperatureSetpoint.SetHeat';

/** How long an answer is good for. The Nest's own app is seldom fresher, and one thermostat needs no more. */
export const POLL_MS = 2 * 60_000;
/** Past this with no answer, an old temperature is more misleading than none. */
export const NOT_REPORTING_MS = 15 * 60_000;

type Reporting = Extract<Heating, { reporting: true }>;

/** With sample data, the Hub shows the heating heating, as in the mockup. */
export const sampleHeating: Reporting = {
	reporting: true,
	temperature: 19.5,
	humidity: 67,
	heating: true,
	mode: 'heat',
	target: 21
};

/**
 * The other states, with sample data only, for `?heating=eco`, `off` or `not-reporting`: to see the Heating panel in each
 * on the PC, as `?theme=` does for the themes.
 */
const samplePreviews: Record<string, Heating> = {
	eco: { reporting: true, temperature: 16.5, humidity: 67, heating: false, mode: 'eco', target: 12 },
	off: { reporting: true, temperature: 16.5, humidity: 67, heating: false, mode: 'off', target: null },
	'not-reporting': { reporting: false, since: null }
};

/** The heating now, and `refresh` to ask the thermostat again straight away, such as after a change. */
export interface HeatingSource {
	(): Promise<Heating>;
	refresh(): Promise<Heating>;
}

/** The heating as the Hub sees it, and how to change its target. */
export interface Thermostat {
	heating: HeatingSource;
	/** Sends a new target, in °C, already checked against the limits. */
	send(celsius: number): Promise<void>;
}

// With sample data, a change of target changes only this, never a real Nest. When it's as warm inside as the target,
// the sample stops heating, as the Nest would.
let sample = sampleHeating;
const sampleNow = async (): Promise<Heating> => sample;
const sampleThermostat: Thermostat = {
	heating: Object.assign(sampleNow, { refresh: sampleNow }),
	async send(celsius) {
		sample = { ...sample, target: celsius, heating: celsius > sample.temperature };
	}
};

const nest = googleAccount('nest-token.json');
// Made on first use, and again after the Nest is connected or disconnected.
let real: Thermostat | undefined;

/** The Hub has its Google client and the Device Access project, so the Nest can be connected. */
export function nestConfigured(): boolean {
	return isConfigured() && !!NEST_PROJECT_ID;
}

export const isNestConnected = nest.isSignedIn;

/**
 * Where the Nest sign-in starts: Nest's Partner Connections page, where the thermostat is chosen, which then goes on to
 * Google's own. It holds the project ID, so it's never logged.
 */
export function nestSignInUrl(redirectUri: string, state: string): string {
	const params = new URLSearchParams({
		redirect_uri: redirectUri,
		access_type: 'offline',
		prompt: 'consent',
		client_id: clientId(),
		response_type: 'code',
		scope: SCOPE,
		state
	});
	return `${PARTNER_CONNECTIONS}/partnerconnections/${encodeURIComponent(NEST_PROJECT_ID!)}/auth?${params}`;
}

export const NEST_SIGN_IN_ORIGIN = PARTNER_CONNECTIONS;

export async function connectNest(code: string, redirectUri: string): Promise<void> {
	await nest.completeSignIn(code, redirectUri);
	real = undefined;
}

/** Forgets the Nest's sign-in. The Household's, for the Calendars, is untouched. */
export async function disconnectNest(): Promise<void> {
	await nest.signOut();
	real = undefined;
}

const listDevices = (request: GoogleRequest, project: string) =>
	request<SdmDevices>('GET', `${SDM}/enterprises/${encodeURIComponent(project)}/devices`);

/** The thermostat now, from listing the project's devices, which reports every trait at once. */
export async function readThermostat(request: GoogleRequest, project: string): Promise<HeatingReading> {
	return fromSdm(await listDevices(request, project));
}

/**
 * Sets the thermostat's target in Heat. Lists the devices first for the thermostat's name, which holds its ID, so the
 * name is neither kept nor logged.
 */
export async function sendHeat(request: GoogleRequest, project: string, celsius: number): Promise<void> {
	const device = findThermostat(await listDevices(request, project));
	await request('POST', `${SDM}/${device.name}:executeCommand`, {
		command: SET_HEAT,
		params: { heatCelsius: celsius }
	});
}

/**
 * Changes the target, then asks the thermostat again, so what's shown is what it accepted. Logs one line, from and to,
 * with no token or ID.
 */
export async function changeTarget(thermostat: Thermostat, to: number): Promise<TargetChange> {
	const before = await thermostat.heating();
	if (!before.reporting || before.target === null || whyNoTarget(before))
		return { outcome: 'refused', heating: before };
	const change = `from ${formatDegrees(before.target)}° to ${formatDegrees(to)}°`;
	try {
		await thermostat.send(to);
	} catch (e) {
		console.error(`Heating target not changed ${change}:`, e instanceof Error ? e.message : e);
		return { outcome: 'failed', heating: await thermostat.heating.refresh() };
	}
	console.log(`Heating target changed ${change}`);
	return { outcome: 'changed', heating: await thermostat.heating.refresh() };
}

/** What the header shows for the last answer: the reading, or "Not reporting" once it's too old or the sign-in ended. */
export function heatingNow(snapshot: Snapshot<HeatingReading>, now: number): Heating {
	const ended = snapshot.error instanceof SignInNeeded;
	if (snapshot.value && snapshot.at && !ended && now - Date.parse(snapshot.at) < NOT_REPORTING_MS)
		return { reporting: true, ...snapshot.value };
	return { reporting: false, since: snapshot.at, ...(ended && { signInEnded: true as const }) };
}

/** The heating as the header shows it, asking the thermostat again when the last answer is due. */
export function createHeating(read: () => Promise<HeatingReading>, clock: () => number = Date.now): HeatingSource {
	// Logged once for a run of failures: the Nest going offline overnight would otherwise log every couple of minutes.
	const sync = createSync({ name: 'Heating', fetch: read, everyMs: POLL_MS, clock, logOnce: true });
	const now = async (): Promise<Heating> => heatingNow(await sync.read(), clock());
	return Object.assign(now, {
		async refresh() {
			// Not a poll that may have been answered before the change.
			await sync.refresh({ fresh: true });
			return now();
		}
	});
}

/** Sample heating with sample data or no Google client; nothing until the Nest is connected. */
async function thermostat(): Promise<Thermostat | null> {
	if (CALENDAR_SOURCE === 'sample' || !isConfigured()) return sampleThermostat;
	if (!NEST_PROJECT_ID || !(await nest.isSignedIn())) return null;
	const project = NEST_PROJECT_ID;
	real ??= {
		heating: createHeating(() => readThermostat(nest.request, project)),
		send: (celsius) => sendHeat(nest.request, project, celsius)
	};
	return real;
}

/**
 * The heating for the header: null until the Nest is connected, or if it breaks, so the rest of the page still shows.
 * `preview` shows another sample state, with sample data only.
 */
export function loadHeating(preview?: string | null): Promise<Heating | null> {
	return orElse(
		'Heating',
		async () => {
			const source = await thermostat();
			if (source === sampleThermostat && preview && Object.hasOwn(samplePreviews, preview))
				return samplePreviews[preview]!;
			return source ? source.heating() : null;
		},
		null
	);
}

/** Changes the target from the Hub. Null if the Nest isn't connected. */
export async function changeHeatingTarget(to: number): Promise<TargetChange | null> {
	const source = await thermostat();
	return source && changeTarget(source, to);
}
