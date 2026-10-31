import { defineConfig, devices } from '@playwright/test';

// Screenshots differ slightly between operating systems, so they're only ever taken in the
// Playwright Linux image: in CI, and locally through `npm run test:screenshots`.
const PORT = 4173;

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
			OCTOPUS_AGILE_PRODUCT: '',
			OCTOPUS_REGION: '',
			HUB_NOW: NOW
		}
	}
});
