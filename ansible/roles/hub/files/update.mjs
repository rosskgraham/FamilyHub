// Installs the newest FamilyHub release beside the current one, switches to it, and switches back
// if it doesn't answer its health check (ADR 0004). familyhub-update.timer runs it as root every few
// minutes. Ansible installs this script, not a release, so a bad release can't break the updater.
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, readlink, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
const versionPattern = /^\d{4}\.\d{2}\.\d{2}\.\d+$/;

/** Orders YYYY.MM.DD.N versions: negative when a is older than b. */
export function compareVersions(a, b) {
	const pa = a.split('.').map(Number);
	const pb = b.split('.').map(Number);
	for (let i = 0; i < 4; i++) {
		if (pa[i] !== pb[i]) return pa[i] - pb[i];
	}
	return 0;
}

/** The version a GitHub release is for, from its tag, such as v2026.10.31.57. */
export function versionOf(release) {
	const version = String(release?.tag_name ?? '').replace(/^v/, '');
	if (!versionPattern.test(version)) throw new Error(`The latest release has an unexpected tag: ${release?.tag_name}`);
	return version;
}

/** Whether to install the latest release, given what's installed and what has failed before. */
export function decide({ latest, current, failed }) {
	if (current && compareVersions(latest, current) <= 0) return { install: false, reason: `${current} is up to date` };
	if (failed.includes(latest)) {
		return { install: false, reason: `${latest} failed its health check before, so waiting for a newer one` };
	}
	return { install: true };
}

/** The installed releases to delete: all but the newest few, and never the current or previous one. */
export function releasesToPrune(installed, { keep, current, previous }) {
	const newest = installed.filter((v) => versionPattern.test(v)).sort(compareVersions).reverse();
	const kept = new Set([...newest.slice(0, keep), current, previous]);
	return newest.filter((v) => !kept.has(v));
}

/**
 * Whether an installed release looks whole: its package.json parses and names its own version. Files are unpacked
 * together, so a power cut soon after unpacking leaves them all empty, package.json included (AB#60).
 */
export async function intact(releasesDir, version) {
	try {
		const pkg = JSON.parse(await readFile(join(releasesDir, version, 'package.json'), 'utf8'));
		return pkg?.version === version;
	} catch {
		return false;
	}
}

/** The newest installed release that's whole, other than the one given, or null. */
export async function newestIntact(releasesDir, except) {
	let installed;
	try {
		installed = await readdir(releasesDir);
	} catch (error) {
		if (error.code === 'ENOENT') return null;
		throw error;
	}
	const newest = installed.filter((v) => versionPattern.test(v) && v !== except).sort(compareVersions).reverse();
	for (const version of newest) {
		if (await intact(releasesDir, version)) return version;
	}
	return null;
}

/**
 * Writes everything waiting in memory to the SD card. Without it, a power cut soon after an update can leave a
 * release's names and the current link on disk with no contents, and the Hub can't start (AB#60).
 */
async function flush() {
	await run('sync');
}

/** The SHA-256 from a .sha256 file written the way `sha256sum` writes it. */
export function parseChecksum(text) {
	const hash = text.trim().split(/\s+/)[0]?.toLowerCase();
	if (!/^[0-9a-f]{64}$/.test(hash ?? '')) throw new Error('The release checksum file is malformed');
	return hash;
}

async function get(url) {
	const response = await fetch(url, {
		headers: { accept: 'application/vnd.github+json', 'user-agent': 'familyhub-updater' },
		signal: AbortSignal.timeout(120_000)
	});
	if (!response.ok) throw new Error(`${url} answered ${response.status}`);
	return response;
}

async function readJson(path, fallback) {
	try {
		return JSON.parse(await readFile(path, 'utf8'));
	} catch (error) {
		if (error.code === 'ENOENT') return fallback;
		throw error;
	}
}

async function installedVersion(link) {
	try {
		return basename(await readlink(link));
	} catch (error) {
		if (error.code === 'ENOENT') return null;
		throw error;
	}
}

async function download(release, version, releasesDir) {
	const name = `familyhub-${version}.tar.gz`;
	const asset = (file) => {
		const found = release.assets?.find((a) => a.name === file);
		if (!found) throw new Error(`Release ${version} has no ${file}`);
		return found.browser_download_url;
	};
	const tarball = Buffer.from(await (await get(asset(name))).arrayBuffer());
	const expected = parseChecksum(await (await get(asset(`${name}.sha256`))).text());
	const actual = createHash('sha256').update(tarball).digest('hex');
	if (actual !== expected) throw new Error(`Release ${version} doesn't match its checksum, so not installing it`);

	// Unpack beside the releases, then move into place, so a half-unpacked release is never used.
	const work = await mkdtemp(join(tmpdir(), 'familyhub-'));
	const staging = await mkdtemp(join(releasesDir, '.unpacking-'));
	try {
		await writeFile(join(work, name), tarball);
		await run('tar', ['-xzf', join(work, name), '-C', staging, '--no-same-owner']);
		// The files are on the card before the release is moved into place and used.
		await flush();
		const target = join(releasesDir, version);
		await rm(target, { recursive: true, force: true });
		await rename(join(staging, `familyhub-${version}`), target);
	} finally {
		await rm(work, { recursive: true, force: true });
		await rm(staging, { recursive: true, force: true });
	}
}

/** Points the current link at a release in one step, so the Hub never starts from a missing folder. */
async function switchTo(home, version) {
	const next = join(home, 'current.next');
	await rm(next, { force: true });
	await symlink(join('releases', version), next);
	await rename(next, join(home, 'current'));
	await flush();
}

/**
 * Restarts the Hub. A release that won't start makes systemd restart it over and over, past its limit, after which
 * systemd refuses to start it again until told to forget the failures, so it's told first (AB#60).
 */
async function restart(service) {
	await run('systemctl', ['reset-failed', service]);
	await run('systemctl', ['restart', service]);
}

/** Goes back to a whole release when the current one is broken and can't be installed again. */
async function fallBack(config, target) {
	if (!target) {
		console.error('There is no whole release installed to go back to');
		return false;
	}
	console.error(`Going back to ${target}`);
	await switchTo(config.home, target);
	await restart(config.service);
	if (!(await answers(config.healthUrl, target, config.healthTimeoutSeconds))) {
		console.error(`${target} isn't answering either`);
	}
	return false;
}

async function answers(url, version, timeoutSeconds) {
	const deadline = Date.now() + timeoutSeconds * 1000;
	while (Date.now() < deadline) {
		try {
			const answer = await (await fetch(url, { signal: AbortSignal.timeout(5000) })).json();
			if (answer.status === 'ok' && answer.version === version) return true;
		} catch {
			// Not answering yet.
		}
		await new Promise((resolve) => setTimeout(resolve, 1000));
	}
	return false;
}

/** Installs the latest release if it should. Resolves false when a release failed and was rolled back. */
export async function update(config) {
	const { home, stateDir, service } = config;
	const releasesDir = join(home, 'releases');
	const failedFile = join(stateDir, 'failed.json');
	const installed = await installedVersion(join(home, 'current'));
	// A current release that isn't whole can't start, and restarting it won't help, so it's installed again, and
	// anything that goes wrong falls back to the newest whole release instead.
	const broken = installed && !(await intact(releasesDir, installed)) ? installed : null;
	const current = broken ? await newestIntact(releasesDir, broken) : installed;
	if (broken) console.error(`${broken} isn't whole, as after a power cut, so installing a release again`);
	const failed = await readJson(failedFile, []);

	let latest;
	try {
		const release = await (await get(config.releasesUrl)).json();
		latest = versionOf(release);
		const decision = broken ? { install: true } : decide({ latest, current, failed });
		if (!decision.install) {
			console.log(decision.reason);
			return true;
		}
		console.log(`Installing ${latest}${installed ? `, replacing ${installed}` : ''}`);
		await download(release, latest, releasesDir);
	} catch (error) {
		if (!broken) throw error;
		console.error(`Couldn't install a release: ${error.message}`);
		return fallBack(config, current);
	}
	await switchTo(home, latest);
	await restart(service);

	if (await answers(config.healthUrl, latest, config.healthTimeoutSeconds)) {
		console.log(`Installed ${latest}`);
		const installed = await readdir(releasesDir);
		for (const old of releasesToPrune(installed, { keep: 3, current: latest, previous: current })) {
			await rm(join(releasesDir, old), { recursive: true, force: true });
		}
		return true;
	}

	await mkdir(stateDir, { recursive: true });
	await writeFile(failedFile, JSON.stringify([...failed, latest]));
	if (!current) {
		console.error(`${latest} didn't answer its health check, and there's no earlier release to go back to`);
		return false;
	}
	console.error(`${latest} didn't answer its health check, so going back to ${current}`);
	await switchTo(home, current);
	await restart(service);
	await rm(join(releasesDir, latest), { recursive: true, force: true });
	if (!(await answers(config.healthUrl, current, config.healthTimeoutSeconds))) {
		console.error(`${current} isn't answering either`);
	}
	return false;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	const env = process.env;
	const config = {
		releasesUrl: env.FAMILYHUB_RELEASES_URL,
		home: env.FAMILYHUB_HOME,
		healthUrl: env.FAMILYHUB_HEALTH_URL,
		healthTimeoutSeconds: Number(env.FAMILYHUB_HEALTH_TIMEOUT_SECONDS),
		stateDir: env.STATE_DIRECTORY,
		service: 'familyhub.service'
	};
	update(config).then(
		(ok) => (process.exitCode = ok ? 0 : 1),
		(error) => {
			console.error(error.message);
			process.exitCode = 1;
		}
	);
}
