import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},

			// A Node server, which is what runs on the Pi: `node build`.
			adapter: adapter(),
			// The release's version, set by CI (see scripts/release.mjs). Without it, the time of the build.
			version: process.env.HUB_VERSION ? { name: process.env.HUB_VERSION } : undefined
		})
	],
	test: {
		// Playwright's tests live in e2e/.
		include: ['src/**/*.test.ts']
	}
});
