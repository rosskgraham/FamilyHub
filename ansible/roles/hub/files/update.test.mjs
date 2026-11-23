import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
	compareVersions,
	decide,
	intact,
	newestIntact,
	parseChecksum,
	releasesToPrune,
	versionOf
} from './update.mjs';

/** A releases folder with each release's package.json as given: an object, raw text, or null for none. */
async function releases(packages) {
	const dir = await mkdtemp(join(tmpdir(), 'releases-'));
	for (const [version, pkg] of Object.entries(packages)) {
		await mkdir(join(dir, version));
		if (pkg === null) continue;
		await writeFile(join(dir, version, 'package.json'), typeof pkg === 'string' ? pkg : JSON.stringify(pkg));
	}
	return dir;
}

test('versions order by date, then run number', () => {
	assert.ok(compareVersions('2026.11.13.60', '2026.11.12.99') > 0);
	assert.ok(compareVersions('2026.11.13.9', '2026.11.13.10') < 0);
	assert.equal(compareVersions('2026.11.13.60', '2026.11.13.60'), 0);
});

test('the version comes from the release tag', () => {
	assert.equal(versionOf({ tag_name: 'v2026.11.13.60' }), '2026.11.13.60');
	assert.throws(() => versionOf({ tag_name: 'v1.2.3' }), /unexpected tag/);
	assert.throws(() => versionOf({}), /unexpected tag/);
});

test('installs a newer release, or the first one', () => {
	assert.deepEqual(decide({ latest: '2026.11.13.60', current: '2026.11.12.59', failed: [] }), { install: true });
	assert.deepEqual(decide({ latest: '2026.11.13.60', current: null, failed: [] }), { install: true });
});

test("doesn't install the same or an older release", () => {
	assert.equal(decide({ latest: '2026.11.13.60', current: '2026.11.13.60', failed: [] }).install, false);
	assert.equal(decide({ latest: '2026.11.12.59', current: '2026.11.13.60', failed: [] }).install, false);
});

test("doesn't try a release again once it has failed", () => {
	const decision = decide({ latest: '2026.11.13.61', current: '2026.11.13.60', failed: ['2026.11.13.61'] });
	assert.equal(decision.install, false);
	assert.match(decision.reason, /failed its health check before/);
});

test('keeps the newest three releases, and always the current and previous ones', () => {
	const installed = ['2026.11.10.1', '2026.11.11.2', '2026.11.12.3', '2026.11.13.4', '2026.11.13.5', '.unpacking-x'];
	assert.deepEqual(releasesToPrune(installed, { keep: 3, current: '2026.11.13.5', previous: '2026.11.13.4' }), [
		'2026.11.11.2',
		'2026.11.10.1'
	]);
	// After a rollback, the current release can be older than the newest three.
	assert.deepEqual(releasesToPrune(installed, { keep: 3, current: '2026.11.10.1', previous: null }), ['2026.11.11.2']);
});

test('reads the checksum the way sha256sum writes it', () => {
	const hash = 'a'.repeat(64);
	assert.equal(parseChecksum(`${hash}  familyhub-2026.11.13.60.tar.gz\n`), hash);
	assert.throws(() => parseChecksum('not a hash'), /malformed/);
});

test('a release is whole when its package.json names its own version', async () => {
	const dir = await releases({ '2026.11.22.210': { name: 'familyhub', version: '2026.11.22.210' } });
	try {
		assert.equal(await intact(dir, '2026.11.22.210'), true);
	} finally {
		await rm(dir, { recursive: true });
	}
});

test("a release emptied by a power cut, or missing its package.json, isn't whole", async () => {
	const dir = await releases({
		'2026.11.22.220': '',
		'2026.11.22.221': '{"name": "famil',
		'2026.11.22.222': { name: 'familyhub', version: '2026.11.22.1' },
		'2026.11.22.223': null
	});
	try {
		for (const version of ['2026.11.22.220', '2026.11.22.221', '2026.11.22.222', '2026.11.22.223', 'nope']) {
			assert.equal(await intact(dir, version), false, version);
		}
	} finally {
		await rm(dir, { recursive: true });
	}
});

test('falls back to the newest whole release, never the broken one', async () => {
	const dir = await releases({
		'2026.11.22.206': { version: '2026.11.22.206' },
		'2026.11.22.210': { version: '2026.11.22.210' },
		'2026.11.22.215': '',
		'2026.11.22.220': ''
	});
	try {
		assert.equal(await newestIntact(dir, '2026.11.22.220'), '2026.11.22.210');
		assert.equal(await newestIntact(dir, '2026.11.22.210'), '2026.11.22.206');
	} finally {
		await rm(dir, { recursive: true });
	}
});

test('with no whole release, or no releases folder, there is nothing to fall back to', async () => {
	const dir = await releases({ '2026.11.22.220': '', '.unpacking-x': null });
	try {
		assert.equal(await newestIntact(dir, '2026.11.22.220'), null);
		assert.equal(await newestIntact(join(dir, 'missing'), null), null);
	} finally {
		await rm(dir, { recursive: true });
	}
});
