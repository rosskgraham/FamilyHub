// Runs a card's work on the PC with Ross's real setup, so a change is seen and tried while it's built, not only after
// it's merged (AB#54). In a card's worktree, on its branch ab<id>-…:
//
//   node scripts/card-dev.mjs               starts the card's dev server at http://localhost:<6000 + id>
//   node scripts/card-dev.mjs --fresh-data  the same, copying Ross's data again first
//   node scripts/card-dev.mjs --stop        stops it
//
// It uses the main checkout's app/.env, read at each start, and a copy of its app/data made at the first start, so
// the sign-ins work but the card's changes to the Hub's own databases stay in the copy. Everything else it reaches,
// such as the Nest and the calendars, is real. The server runs on its own, logging to app/data/dev-server.log, so it
// outlives the terminal that started it.
//
//   node scripts/card-dev.mjs --main        after a merge: moves the main checkout to origin/main, if nothing in it
//                                           is changed, and restarts Ross's dev server on 5173
import { spawn, spawnSync } from 'node:child_process';
import { closeSync, existsSync, openSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
	cardFromBranch,
	copyData,
	LOG_FILE,
	MAIN_PORT,
	mainCheckout,
	parseEnv,
	pidOnPort,
	portFor,
	samePath,
	whyNotUpdate
} from './card-dev-lib.ts';

const app = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = new Set(process.argv.slice(2));

const known = ['--fresh-data', '--stop', '--main'];
const unknown = [...args].filter((a) => !known.includes(a));
if (unknown.length) fail(`Unknown: ${unknown.join(' ')}. It takes ${known.join(', ')} or nothing.`);

function git(cwd, ...gitArgs) {
	const run = spawnSync('git', gitArgs, { cwd, encoding: 'utf8' });
	return { ok: run.status === 0, out: (run.stdout ?? '').trim(), err: (run.stderr ?? '').trim() };
}

function fail(message) {
	console.error(message);
	process.exit(1);
}

const main = mainCheckout(git(app, 'worktree', 'list', '--porcelain').out);
const mainApp = join(main, 'app');

if (args.has('--main')) await updateMain();
else await card();

async function card() {
	const top = git(app, 'rev-parse', '--show-toplevel').out;
	if (samePath(top, main))
		fail(`This is the main checkout, ${main}. Run it in a card's worktree, or use --main to update this one.`);
	const branch = git(app, 'branch', '--show-current').out || null;
	const id = cardFromBranch(branch);
	if (id === null) fail(`The branch ${branch ?? '(none)'} isn't a card's: card branches are ab<id>-<short-name>.`);
	const port = portFor(id);
	const data = join(app, 'data');

	if (args.has('--stop')) return stop(port);
	if (await answers(port)) {
		if (!args.has('--fresh-data'))
			return console.log(`AB#${id}'s dev server is already running: http://localhost:${port}`);
		stop(port);
	}

	const envFile = join(mainApp, '.env');
	if (!existsSync(envFile)) fail(`There's no ${envFile} to take the real setup from.`);
	const result = await copyData(join(mainApp, 'data'), data, args.has('--fresh-data'));
	console.log(result === 'copied' ? `Copied the data from ${mainApp}.` : `Kept the copy of the data in ${data}.`);

	await start(app, port, data, {
		...parseEnv(readFileSync(envFile, 'utf8')),
		HUB_DATA_DIR: data,
		HUB_CONFIG_DIR: mainApp
	});
	console.log(`AB#${id}'s dev server: http://localhost:${port}  (log: ${join(data, LOG_FILE)})`);
}

async function updateMain() {
	const status = git(main, 'status', '--porcelain').out;
	const branch = git(main, 'branch', '--show-current').out || null;
	const why = whyNotUpdate(status, branch);
	if (why) fail(why);

	const fetched = git(main, 'fetch', 'origin');
	if (!fetched.ok) fail(`git fetch failed:\n${fetched.err}`);
	const before = git(main, 'rev-parse', 'HEAD').out;
	const moved = git(main, 'checkout', '--detach', 'origin/main');
	if (!moved.ok) fail(`git checkout failed:\n${moved.err}`);
	console.log(`The main checkout is at ${git(main, 'log', '--oneline', '-1').out}.`);

	const data = join(mainApp, 'data');
	stop(MAIN_PORT);
	const lockChanged = git(main, 'diff', '--name-only', before, 'HEAD', '--', 'app/package-lock.json').out;
	await start(mainApp, MAIN_PORT, data, {}, Boolean(lockChanged));
	console.log(
		`The dev server is running the latest main: http://localhost:${MAIN_PORT}  (log: ${join(data, LOG_FILE)})`
	);
}

/** Starts vite on its own, installing the packages first if they're missing or changed, and waits until it answers. */
async function start(dir, port, data, env, install = false) {
	if (install || !existsSync(join(dir, 'node_modules', 'vite'))) {
		console.log('Installing the packages…');
		const npm = spawnSync('npm', ['ci', '--no-audit', '--no-fund'], { cwd: dir, stdio: 'inherit', shell: true });
		if (npm.status !== 0) fail('npm ci failed.');
	}
	const log = openSync(join(data, LOG_FILE), 'a');
	const vite = spawn(
		process.execPath,
		[join(dir, 'node_modules', 'vite', 'bin', 'vite.js'), 'dev', '--port', String(port), '--strictPort'],
		{ cwd: dir, env: { ...process.env, ...env }, detached: true, stdio: ['ignore', log, log], windowsHide: true }
	);
	closeSync(log);
	vite.unref();

	const deadline = Date.now() + 60_000;
	while (!(await answers(port))) {
		if (vite.exitCode !== null || Date.now() > deadline) {
			const tail = readFileSync(join(data, LOG_FILE), 'utf8').split('\n').slice(-15).join('\n');
			fail(`The dev server didn't start on localhost:${port}. The end of its log:\n${tail}`);
		}
		await new Promise((r) => setTimeout(r, 500));
	}
}

/** Stops whatever is listening on the port: the card's dev server, or on 5173 Ross's. */
function stop(port) {
	const pid = listener(port);
	if (pid) kill(pid);
	console.log(pid ? `Stopped the dev server on localhost:${port}.` : `Nothing was running on localhost:${port}.`);
}

function listener(port) {
	if (process.platform === 'win32')
		return pidOnPort(spawnSync('netstat', ['-ano'], { encoding: 'utf8' }).stdout ?? '', port);
	const pid = spawnSync('lsof', ['-ti', `tcp:${port}`, '-sTCP:LISTEN'], { encoding: 'utf8' }).stdout?.trim();
	return pid ? Number(pid.split('\n')[0]) : null;
}

function kill(pid) {
	if (!pid) return;
	if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(pid), '/t', '/f'], { stdio: 'ignore' });
	else
		try {
			process.kill(-pid);
		} catch {
			try {
				process.kill(pid);
			} catch {
				// Already gone.
			}
		}
}

async function answers(port) {
	try {
		return (await fetch(`http://localhost:${port}/api/health`)).ok;
	} catch {
		return false;
	}
}
