import { CALENDAR_SOURCE, NEST_PROJECT_ID } from '$app/env/private';
import type { Heating, HeatingReading } from '#lib/heating.ts';
import { orElse } from '../fallback.ts';
import { clientId, googleAccount, isConfigured, SignInNeeded, type GoogleRequest } from '../google/auth.ts';
import { createSync, type Snapshot } from '../sync.ts';
import { fromSdm, type SdmDevices } from './from-sdm.ts';

// The Nest, through Google's Smart Device Management API (ADR 0013): its own sign-in with the Hub's Google client,
// kept beside the Household's so either can be ended without the other, and asked every couple of minutes.

const SDM = 'https://smartdevicemanagement.googleapis.com/v1';
const SCOPE = 'https://www.googleapis.com/auth/sdm.service';
const PARTNER_CONNECTIONS = 'https://nestservices.google.com';

/** How long an answer is good for. The Nest's own app is seldom fresher, and one thermostat needs no more. */
export const POLL_MS = 2 * 60_000;
/** Past this with no answer, an old temperature is more misleading than none. */
export const NOT_REPORTING_MS = 15 * 60_000;

/** With sample data, the Hub shows the heating heating, as in the mockup. */
export const sampleHeating: Heating = {
	reporting: true,
	temperature: 19.5,
	humidity: 67,
	heating: true,
	mode: 'heat',
	target: 21
};

const nest = googleAccount('nest-token.json');
// Made on first use, and again after the Nest is connected or disconnected.
let heating: (() => Promise<Heating>) | undefined;

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
	heating = undefined;
}

/** Forgets the Nest's sign-in. The Household's, for the Calendars, is untouched. */
export async function disconnectNest(): Promise<void> {
	await nest.signOut();
	heating = undefined;
}

/** The thermostat now, from listing the project's devices, which reports every trait at once. */
export async function readThermostat(request: GoogleRequest, project: string): Promise<HeatingReading> {
	return fromSdm(await request<SdmDevices>('GET', `${SDM}/enterprises/${encodeURIComponent(project)}/devices`));
}

/** What the header shows for the last answer: the reading, or "Not reporting" once it's too old or the sign-in ended. */
export function heatingNow(snapshot: Snapshot<HeatingReading>, now: number): Heating {
	const ended = snapshot.error instanceof SignInNeeded;
	if (snapshot.value && snapshot.at && !ended && now - Date.parse(snapshot.at) < NOT_REPORTING_MS)
		return { reporting: true, ...snapshot.value };
	return { reporting: false, since: snapshot.at, ...(ended && { signInEnded: true as const }) };
}

/** The heating as the header shows it, asking the thermostat again when the last answer is due. */
export function createHeating(read: () => Promise<HeatingReading>, clock: () => number = Date.now) {
	// Logged once for a run of failures: the Nest going offline overnight would otherwise log every couple of minutes.
	const sync = createSync({ name: 'Heating', fetch: read, everyMs: POLL_MS, clock, logOnce: true });
	return async (): Promise<Heating> => heatingNow(await sync.read(), clock());
}

/**
 * The heating for the header. Sample heating with sample data or no Google client; nothing until the Nest is connected.
 * Null if it breaks, so the rest of the page still shows.
 */
export function loadHeating(): Promise<Heating | null> {
	return orElse('Heating', load, null);
}

async function load(): Promise<Heating | null> {
	if (CALENDAR_SOURCE === 'sample' || !isConfigured()) return sampleHeating;
	if (!NEST_PROJECT_ID || !(await nest.isSignedIn())) return null;
	const project = NEST_PROJECT_ID;
	heating ??= createHeating(() => readThermostat(nest.request, project));
	return heating();
}
