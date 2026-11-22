import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true)
			},
			// Static files for Azure Static Web Apps' free tier (ADR 0010). There's no server: it's a single-page app,
			// and every path that isn't a file gets index.html (see static/staticwebapp.config.json).
			adapter: adapter({ fallback: 'index.html' })
		})
	],
	test: {
		include: ['src/**/*.test.ts']
	}
});
