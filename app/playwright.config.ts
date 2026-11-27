import { defineConfig, devices } from '@playwright/test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Screenshots differ slightly between operating systems, so they're only ever taken in the
// Playwright Linux image: in CI, and locally through `npm run test:screenshots`.
const PORT = 4173;
/** A second Hub, with Google's client and the Nest's project but no Nest sign-in. */
export const NO_NEST_URL = 'http://localhost:4174';
/**
 * A third Hub with sample data, whose heating the tests change, so the other tests always see the sample's own. It
 * also offers Check for updates as a release would, and the tests play the Pi's updater (AB#105).
 */
export const HEATING_URL = 'http://localhost:4175';

// Empty config and data folders for each run, so the Hub under test never reads or writes the Household's own
// household.json, chores.json or data/. Workers load this file too, and reuse the main process's folder.
const HOME = (process.env.FAMILYHUB_E2E_HOME ??= mkdtempSync(join(tmpdir(), 'familyhub-e2e-')));

/** Wednesday 28 October 2026, 08:15 in the UK: a school day with Events before and after. */
export const NOW = '2026-10-28T08:15:00Z';

// A Pi at 52.5 °C, so Settings shows the same temperature on every machine, with or without one of its own.
const THERMAL_ZONE = join(HOME, 'thermal_zone0_temp');
writeFileSync(THERMAL_ZONE, '52500\n');

// ...on the home Wi-Fi, so Settings shows the same network on every machine too.
const NETWORK = join(HOME, 'network.json');
writeFileSync(NETWORK, JSON.stringify({ kind: 'wifi', name: 'Home Wi-Fi', signal: 72, address: '192.168.0.240' }));

// Where the third Hub reads what the pretend updater says, and writes its request to check for updates. The others
// read a status file that's never written, so they never see a real Pi's.
export const UPDATE_STATUS = join(HOME, 'heating', 'update-status.json');
export const UPDATE_REQUESTED = join(HOME, 'heating', 'data', 'update-requested');
const NO_UPDATE_STATUS = join(HOME, 'no-update-status.json');

export default defineConfig({
	testDir: 'e2e',
	snapshotPathTemplate: '{testDir}/__screenshots__/{arg}{ext}',
	forbidOnly: !!process.env.CI,
	reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
	use: {
		...devices['Desktop Chrome'],
		baseURL: `http://localhost:${PORT}`,
		viewport: { width: 1920, height: 1080 },
		locale: 'en-GB',
		timezoneId: 'Europe/London'
	},
	expect: { toHaveScreenshot: { maxDiffPixels: 0 } },
	webServer: [
		{
			command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
			port: PORT,
			reuseExistingServer: false,
			timeout: 180_000,
			// Sample data only, whatever is in app/.env.
			env: {
				CALENDAR_SOURCE: 'sample',
				GOOGLE_CLIENT_ID: '',
				GOOGLE_CLIENT_SECRET: '',
				NEST_PROJECT_ID: '',
				HOME_LATITUDE: '',
				HOME_LONGITUDE: '',
				OCTOPUS_ACCOUNT: '',
				OCTOPUS_API_KEY: '',
				ZAPPI_GLO_SN: '',
				ZAPPI_GLO_API_KEY: '',
				// Without its certificate, the Hub never signs in to the backend.
				HUB_CERTIFICATE: '',
				HUB_NOW: NOW,
				HUB_THERMAL_ZONE: THERMAL_ZONE,
				HUB_NETWORK_FILE: NETWORK,
				HUB_CONFIG_DIR: join(HOME, 'config'),
				HUB_DATA_DIR: join(HOME, 'data'),
				HUB_UPDATE_STATUS: NO_UPDATE_STATUS
			}
		},
		{
			// The same build, started once the first server is up. Set up for Google and the Nest, but signed in to
			// neither, so it never calls them: everything else is sample data, as on a Pi before signing in.
			command: 'npm run preview -- --port 4174 --strictPort',
			url: NO_NEST_URL,
			reuseExistingServer: false,
			timeout: 180_000,
			env: {
				CALENDAR_SOURCE: '',
				GOOGLE_CLIENT_ID: 'e2e-client.apps.googleusercontent.com',
				GOOGLE_CLIENT_SECRET: 'e2e-secret',
				NEST_PROJECT_ID: 'e2e-project',
				HOME_LATITUDE: '',
				HOME_LONGITUDE: '',
				OCTOPUS_ACCOUNT: '',
				OCTOPUS_API_KEY: '',
				ZAPPI_GLO_SN: '',
				ZAPPI_GLO_API_KEY: '',
				// Without its certificate, the Hub never signs in to the backend.
				HUB_CERTIFICATE: '',
				HUB_NOW: NOW,
				HUB_THERMAL_ZONE: THERMAL_ZONE,
				HUB_NETWORK_FILE: NETWORK,
				HUB_CONFIG_DIR: join(HOME, 'no-nest', 'config'),
				HUB_DATA_DIR: join(HOME, 'no-nest', 'data'),
				HUB_UPDATE_STATUS: NO_UPDATE_STATUS
			}
		},
		{
			// The same build again, with sample data and no Google client, so a change of target can only reach the
			// sample, never a Nest.
			command: 'npm run preview -- --port 4175 --strictPort',
			url: HEATING_URL,
			reuseExistingServer: false,
			timeout: 180_000,
			env: {
				CALENDAR_SOURCE: 'sample',
				GOOGLE_CLIENT_ID: '',
				GOOGLE_CLIENT_SECRET: '',
				NEST_PROJECT_ID: '',
				HOME_LATITUDE: '',
				HOME_LONGITUDE: '',
				OCTOPUS_ACCOUNT: '',
				OCTOPUS_API_KEY: '',
				ZAPPI_GLO_SN: '',
				ZAPPI_GLO_API_KEY: '',
				// Without its certificate, the Hub never signs in to the backend.
				HUB_CERTIFICATE: '',
				HUB_NOW: NOW,
				HUB_THERMAL_ZONE: THERMAL_ZONE,
				HUB_NETWORK_FILE: NETWORK,
				HUB_CONFIG_DIR: join(HOME, 'heating', 'config'),
				HUB_DATA_DIR: join(HOME, 'heating', 'data'),
				HUB_UPDATE_STATUS: UPDATE_STATUS,
				HUB_UPDATES_AS_RELEASE: 'true'
			}
		}
	]
});
