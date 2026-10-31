// Packages the built app as a release the Pi can install (ADR 0004), then checks the package
// itself starts and answers with its version. Run after `npm run build` with HUB_VERSION set:
//
//   node scripts/release.mjs 2026.10.31.57
//
// It writes release/familyhub-<version>.tar.gz and a .sha256 beside it. The package holds the
// build and a package.json, and nothing else: the app has no runtime dependencies, and no native
// code, so the same package runs on the PC and the Pi.
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const app = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const version = process.argv[2];
if (!version || !/^\d{4}\.\d{2}\.\d{2}\.\d+$/.test(version)) {
	throw new Error('Give the version as YYYY.MM.DD.N, for example 2026.10.31.57');
}

const name = `familyhub-${version}`;
const out = join(app, 'release');
const stage = join(out, name);
rmSync(out, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });

// The build, and enough package.json for Node to treat it as ES modules.
cpSync(join(app, 'build'), join(stage, 'build'), { recursive: true });
const pkg = JSON.parse(readFileSync(join(app, 'package.json'), 'utf8'));
writeFileSync(
	join(stage, 'package.json'),
	JSON.stringify({ name: 'familyhub', version, private: true, type: 'module', engines: { node: '>=24' } }, null, '\t')
);
if (Object.keys(pkg.dependencies ?? {}).length > 0) {
	throw new Error('The app has runtime dependencies now, so the release needs its node_modules too.');
}

const tarball = join(out, `${name}.tar.gz`);
const tar = spawnSync('tar', ['-czf', `${name}.tar.gz`, name], { cwd: out, stdio: 'inherit' });
if (tar.status !== 0) throw new Error('tar failed');
const sha = createHash('sha256').update(readFileSync(tarball)).digest('hex');
writeFileSync(`${tarball}.sha256`, `${sha}  ${name}.tar.gz\n`);
console.log(`Packaged ${tarball}`);

// Unpack it somewhere new and run it, with sample data, as the Pi would.
// Relative paths only: on Windows, some tars read the C: of a path as a remote host.
const trial = join(out, 'trial');
mkdirSync(trial);
const untar = spawnSync('tar', ['-xzf', `../${name}.tar.gz`], { cwd: trial, stdio: 'inherit' });
if (untar.status !== 0) throw new Error('Unpacking the release failed');
const port = 4300 + Math.floor(Math.random() * 500);
const server = spawn(process.execPath, ['build'], {
	cwd: join(trial, name),
	env: { PATH: process.env.PATH, PORT: String(port), CALENDAR_SOURCE: 'sample' },
	stdio: 'inherit'
});

async function get(path) {
	const response = await fetch(`http://localhost:${port}${path}`);
	return { status: response.status, body: await response.text() };
}

try {
	let health = null;
	for (let i = 0; i < 40 && !health; i++) {
		await new Promise((r) => setTimeout(r, 250));
		health = await get('/api/health').catch(() => null);
	}
	if (!health) throw new Error('The release never started');
	const answer = JSON.parse(health.body);
	if (answer.status !== 'ok' || answer.version !== version) {
		throw new Error(`The release answered ${health.body}, not version ${version}`);
	}
	const today = await get('/');
	if (today.status !== 200 || !today.body.includes('Coming up')) throw new Error(`The Today view answered ${today.status}`);
	console.log(`Checked: the release starts and answers as ${version}`);
} finally {
	server.kill();
	rmSync(trial, { recursive: true, force: true, maxRetries: 5 });
}
