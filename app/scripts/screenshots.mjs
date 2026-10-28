// Runs the Playwright screenshot tests in the same Linux image CI uses, so the
// screenshots match. Needs Docker. Extra arguments go to `playwright test`,
// for example `--update-snapshots`.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const workflow = readFileSync(resolve(repo, '.github/workflows/ci.yml'), 'utf8');
const image = workflow.match(/image: (mcr\.microsoft\.com\/playwright:\S+)/)?.[1];
if (!image) throw new Error('No Playwright image found in .github/workflows/ci.yml');

const args = process.argv.slice(2).map((a) => `'${a.replace(/'/g, `'\''`)}'`).join(' ');
const result = spawnSync(
	'docker',
	[
		'run', '--rm', '--ipc=host',
		'-v', `${repo}:/work`,
		// Linux's own node_modules and build output, kept apart from the PC's.
		'-v', 'familyhub-node-modules:/work/app/node_modules',
		'-v', 'familyhub-svelte-kit:/work/app/.svelte-kit',
		'-w', '/work/app',
		image,
		'bash', '-c', `npm ci --no-audit --no-fund && npx playwright test ${args}`
	],
	{ stdio: 'inherit' }
);
process.exit(result.status ?? 1);
