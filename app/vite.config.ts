import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true)
			},

			// A Node server, which is what runs on the Pi: `node build`.
			adapter: adapter(),
			// The release's version, set by CI (see scripts/release.mjs). Without it, the time of the build.
			version: process.env.HUB_VERSION ? { name: process.env.HUB_VERSION } : undefined,
			// Where a release is reached: http://localhost:3000 on the Pi, set by CI. adapter-node 6 doesn't read
			// ORIGIN at runtime, and without this it assumes https, so Google's sign-in address is wrong and
			// SvelteKit refuses the Hub's own forms as cross-site. Unset in development and the e2e tests,
			// which take the origin from the request.
			paths: { origin: process.env.HUB_ORIGIN }
		})
	],
	test: {
		// Playwright's tests live in e2e/.
		include: ['src/**/*.test.ts']
	}
});
