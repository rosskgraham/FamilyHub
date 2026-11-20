import adapter from '@sveltejs/adapter-node';
import { execSync } from 'node:child_process';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

// The commit a build is made from, for Settings: CI's, or the PC's checkout. Empty when there's no git, as in the
// screenshot tests' container.
function commit(): string {
	if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 7);
	try {
		return execSync('git rev-parse --short=7 HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
			.toString()
			.trim();
	} catch {
		return '';
	}
}

export default defineConfig({
	// What Settings shows about the build. See src/lib/build.ts.
	define: {
		__HUB_RELEASE__: JSON.stringify(Boolean(process.env.HUB_VERSION)),
		__HUB_COMMIT__: JSON.stringify(commit()),
		__HUB_BUILT_AT__: JSON.stringify(new Date().toISOString())
	},
	plugins: [
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true)
			},

			// A Node server, which is what runs on the Pi: `node build`.
			adapter: adapter(),
			// The release's version, set by CI (see scripts/release.mjs). Without it, the time of the build. The
			// screen asks for it every minute, and reloads when it changes, once no one's using the Hub.
			version: { ...(process.env.HUB_VERSION && { name: process.env.HUB_VERSION }), pollInterval: 60_000 },
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
