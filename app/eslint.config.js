// Mistakes the type checker doesn't catch. Formatting is Prettier's job, so its rules are switched off here.
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import ts from 'typescript-eslint';

export default ts.config(
	{ ignores: ['.svelte-kit/', 'build/', 'release/', 'test-results/', 'playwright-report/'] },
	js.configs.recommended,
	...ts.configs.recommended,
	...svelte.configs.recommended,
	prettier,
	...svelte.configs.prettier,
	{ languageOptions: { globals: { ...globals.browser, ...globals.node } } },
	{
		files: ['**/*.svelte', '**/*.svelte.ts'],
		languageOptions: { parserOptions: { parser: ts.parser, extraFileExtensions: ['.svelte'] } }
	},
	{
		rules: {
			// A name starting with _ is unused on purpose, such as in {#each { length: 3 } as _, i}.
			'@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
			// For apps served under a base path, which the Hub never is: it always runs at the root of its own server.
			'svelte/no-navigation-without-resolve': 'off'
		}
	}
);
