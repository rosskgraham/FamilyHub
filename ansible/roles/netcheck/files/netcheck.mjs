// Watches the Pi's network every few seconds, to find out why the Hub loses the internet for short spells (AB#62).
// familyhub-netcheck.service runs it all the time. Each round asks every nameserver for one name, connects to public
// IPs over IPv4 and IPv6 without DNS, pings the router, and reads which link has the default route and whether eth0 has a cable.
// It also reaches www.googleapis.com the way the Hub does, through the system's resolver and Node's fetch, because the
// Hub's timeouts didn't line up with the checks above.
// It logs a line only when one of those changes, so the journal stays small, and says how long each spell lasted.
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { lookup as systemLookup, Resolver } from 'node:dns/promises';
import { connect } from 'node:net';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);

/** Slower than this counts as slow rather than ok: the Hub's own requests give up after 10 s. */
export const SLOW_MS = 1000;
/** Each check gives up after this, well inside the round, so rounds never overlap. */
export const TIMEOUT_MS = 3000;
/** The name every nameserver is asked for: one the Hub uses for the Calendars, lists and backups. */
export const NAME = 'www.googleapis.com';
/**
 * Public IPs reached without DNS, so a DNS failure and a dead line can be told apart, over IPv4 and IPv6: the home
 * network's IPv6 doesn't always reach the internet, and the Hub's requests may go either way.
 */
export const PUBLIC_IPS = ['1.1.1.1', '8.8.8.8', '2606:4700:4700::1111', '2001:4860:4860::8888'];

/** ok, slow or fail, from whether it worked and how long it took. */
export function grade(ok, ms) {
	if (!ok) return 'fail';
	return ms >= SLOW_MS ? 'slow' : 'ok';
}

/** The nameservers in resolv.conf's text, in order. */
export function nameservers(resolvConf) {
	return resolvConf
		.split('\n')
		.map((line) => line.trim().match(/^nameserver\s+(\S+)/)?.[1])
		.filter(Boolean);
}

/** The first default route's link and gateway, from `ip -j route show default`, or null for none. */
export function defaultRoute(json) {
	const routes = JSON.parse(json || '[]');
	const route = routes.find((r) => r.dst === 'default');
	return route ? { dev: route.dev, gateway: route.gateway } : null;
}

/**
 * The lines to log when going from one round's states to the next: one per check whose state changed. A change back
 * to ok says how long the spell lasted. `since` holds when each check's current state began, and is updated.
 */
export function changes(previous, next, since, now) {
	const lines = [];
	for (const [name, state] of Object.entries(next)) {
		const before = previous?.[name];
		if (before && before.state === state.state) continue;
		const detail = state.detail ? ` (${state.detail})` : '';
		if (!before) {
			lines.push(`${name}: ${state.state}${detail}`);
		} else {
			const lasted = Math.round((now - since[name]) / 1000);
			lines.push(`${name}: ${before.state} → ${state.state} after ${lasted} s${detail}`);
		}
		since[name] = now;
	}
	for (const name of Object.keys(previous ?? {})) {
		if (!(name in next)) {
			lines.push(`${name}: gone`);
			delete since[name];
		}
	}
	return lines;
}

/**
 * A short reason for a failure. fetch wraps the socket's error code in `cause`, and an aborted fetch's DOMException has
 * a number for a code, so a timeout is named rather than numbered.
 */
export function failure(e) {
	if (e?.name === 'TimeoutError') return 'TIMEOUT';
	const code = e?.cause?.code ?? e?.code;
	return typeof code === 'string' ? code : (e?.cause?.message ?? e?.message ?? String(e));
}

/** Times a promise that resolves on success, as a state. Gives up after `timeoutMs`. Never throws. */
async function timed(attempt, describe = () => '', timeoutMs = TIMEOUT_MS) {
	const start = performance.now();
	let timer;
	const giveUp = new Promise((_, reject) => {
		timer = setTimeout(() => reject(Object.assign(new Error('timed out'), { code: 'TIMEOUT' })), timeoutMs);
	});
	try {
		const result = await Promise.race([attempt(), giveUp]);
		const ms = Math.round(performance.now() - start);
		const state = grade(true, ms);
		return { state, detail: state === 'slow' ? `${ms} ms` : describe(result) };
	} catch (e) {
		return { state: 'fail', detail: failure(e) };
	} finally {
		clearTimeout(timer);
	}
}

function lookup(server) {
	const resolver = new Resolver({ timeout: TIMEOUT_MS, tries: 1 });
	resolver.setServers([server]);
	return timed(() => resolver.resolve4(NAME));
}

function reach(ip, port = 443) {
	return timed(
		() =>
			new Promise((resolve, reject) => {
				const socket = connect({ host: ip, port, timeout: TIMEOUT_MS });
				socket.once('connect', () => {
					socket.destroy();
					resolve();
				});
				socket.once('timeout', () => {
					socket.destroy();
					reject(Object.assign(new Error('timed out'), { code: 'TIMEOUT' }));
				});
				socket.once('error', reject);
			})
	);
}

/**
 * Looks the name up as the Hub's fetches do: getaddrinfo through resolv.conf, on libuv's threads, with glibc's own
 * timeouts and retries. A lookup that hangs is given up on, though its thread carries on, as it would in the Hub.
 */
export function hubLookup(lookup = systemLookup, timeoutMs = TIMEOUT_MS) {
	return timed(
		() => lookup(NAME),
		({ family }) => `IPv${family}`,
		timeoutMs
	);
}

/**
 * Asks for a page with Node's fetch, as the Hub does: its own lookup, a connection from fetch's pool, TLS and an
 * answer. Any answer counts, since it's the way there being checked, not the page.
 */
export function hubFetch(fetcher = fetch, timeoutMs = TIMEOUT_MS) {
	return timed(
		async () => {
			const response = await fetcher(`https://${NAME}/`, { signal: AbortSignal.timeout(timeoutMs) });
			await response.arrayBuffer();
		},
		() => '',
		timeoutMs
	);
}

function ping(ip) {
	return timed(() => run('ping', ['-c', '1', '-W', String(TIMEOUT_MS / 1000), ip]));
}

async function carrier(dev) {
	try {
		return (await readFile(`/sys/class/net/${dev}/carrier`, 'utf8')).trim() === '1' ? 'up' : 'down';
	} catch {
		return 'none';
	}
}

/** One round of every check, as a map of name to state. */
export async function round() {
	const [{ stdout }, resolvConf, cable] = await Promise.all([
		run('ip', ['-j', 'route', 'show', 'default']).catch(() => ({ stdout: '[]' })),
		readFile('/etc/resolv.conf', 'utf8').catch(() => ''),
		carrier('eth0')
	]);
	const route = defaultRoute(stdout);
	const servers = nameservers(resolvConf);
	const [hubDns, hubHttps, router, ...rest] = await Promise.all([
		hubLookup(),
		hubFetch(),
		route?.gateway ? ping(route.gateway) : { state: 'fail', detail: 'no gateway' },
		...PUBLIC_IPS.map((ip) => reach(ip)),
		...servers.map((server) => lookup(server))
	]);
	const states = {
		'eth0 cable': { state: cable },
		'default route': { state: route ? route.dev : 'none' },
		router
	};
	PUBLIC_IPS.forEach((ip, i) => (states[`internet ${ip}`] = rest[i]));
	servers.forEach((server, i) => (states[`dns ${server}`] = rest[PUBLIC_IPS.length + i]));
	states[`system lookup ${NAME}`] = hubDns;
	states[`https ${NAME}`] = hubHttps;
	return states;
}

async function main() {
	const everyMs = Number(process.env.FAMILYHUB_NETCHECK_SECONDS ?? 5) * 1000;
	console.log(`Network check started: every ${everyMs / 1000} s, logging only changes`);
	let previous = null;
	const since = {};
	for (;;) {
		const started = Date.now();
		const next = await round();
		for (const line of changes(previous, next, since, Date.now())) console.log(line);
		previous = next;
		await new Promise((r) => setTimeout(r, Math.max(0, everyMs - (Date.now() - started))));
	}
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
