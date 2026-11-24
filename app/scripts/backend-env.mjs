// Puts what the Hub signs in to the backend with into app/.env on the PC, from the Key Vault, as the playbook does
// for the Pi (the sign-in runbook, step 9). Run it in the main checkout's app/, signed in with `az login`:
//
//   node scripts/backend-env.mjs
//
// It never prints the values: the certificate holds the Hub's private key.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BACKEND_SECRETS, withSettings } from './backend-env-lib.ts';

const envFile = join(resolve(dirname(fileURLToPath(import.meta.url)), '..'), '.env');
const subscription = process.env.FAMILYHUB_AZURE_SUBSCRIPTION || 'FamilyHub';

function az(...args) {
	// On Windows az is az.cmd, which only runs through a shell. Nothing here needs quoting.
	const run = spawnSync('az', [...args, '--subscription', subscription, '--output', 'json'], {
		encoding: 'utf8',
		shell: process.platform === 'win32'
	});
	if (run.status !== 0) {
		const problem = run.stderr.trim().split('\n').at(-1) || 'no message';
		fail(/az login/.test(run.stderr) ? 'The Azure CLI isn’t signed in. Run `az login`, then try again.' : problem);
	}
	return JSON.parse(run.stdout || 'null');
}

function fail(message) {
	console.error(message);
	process.exit(1);
}

const vault =
	process.env.FAMILYHUB_KEY_VAULT || az('keyvault', 'list', '--resource-group', 'rg-familyhub', '--query', '[0].name');
if (!vault) fail('There’s no Key Vault in rg-familyhub. See docs/runbooks/azure-setup.md.');
const existing = new Set(
	az('keyvault', 'secret', 'list', '--vault-name', vault, '--include-managed', 'true', '--query', '[].name')
);
const missing = Object.values(BACKEND_SECRETS).filter((name) => !existing.has(name));
if (missing.length) fail(`${vault} hasn’t got ${missing.join(', ')}. See docs/runbooks/sign-in-setup.md, step 9.`);

const values = Object.fromEntries(
	Object.entries(BACKEND_SECRETS).map(([variable, name]) => [
		variable,
		az('keyvault', 'secret', 'show', '--vault-name', vault, '--name', name, '--query', 'value')
	])
);
writeFileSync(envFile, withSettings(existsSync(envFile) ? readFileSync(envFile, 'utf8') : '', values));
console.log(`Put ${Object.keys(values).join(', ')} from ${vault} into ${envFile}.`);
console.log('Restart the dev server to use them: node scripts/card-dev.mjs --main, or stop and start npm run dev.');
