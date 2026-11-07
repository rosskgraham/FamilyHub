import { defineConfig, devices } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Screenshots differ slightly between operating systems, so they're only ever taken in the
// Playwright Linux image: in CI, and locally through `npm run test:screenshots`.
const PORT = 4173;

// Empty config and data folders for each run, so the Hub under test never reads or writes the Household's own
// household.json, chores.json or data/. Workers load this file too, and reuse the main process's folder.
const HOME = (process.env.FAMILYHUB_E2E_HOME ??= mkdtempSync(join(tmpdir(), 'familyhub-e2e-')));

/** Wednesday 28 October 2026, 08:15 in the UK: a school day with Events before and after. */
export const NOW = '2026-10-28T08:15:00Z';

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
	webServer: {
		command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
		port: PORT,
		reuseExistingServer: false,
		timeout: 180_000,
		// Sample data only, whatever is in app/.env.
		env: {
			CALENDAR_SOURCE: 'sample',
			GOOGLE_CLIENT_ID: '',
			GOOGLE_CLIENT_SECRET: '',
			HOME_LATITUDE: '',
			HOME_LONGITUDE: '',
			OCTOPUS_ACCOUNT: '',
			OCTOPUS_API_KEY: '',
			ZAPPI_GLO_SN: '',
			ZAPPI_GLO_API_KEY: '',
			HUB_NOW: NOW,
			HUB_CONFIG_DIR: join(HOME, 'config'),
			HUB_DATA_DIR: join(HOME, 'data')
		}
	}
});
