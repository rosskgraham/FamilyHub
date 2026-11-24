// Darkens the Hub's screen in Lights out hours once it's been left alone for two minutes, and lights it again at a
// touch (AB#64). familyhub-screen.service runs it as the kiosk's user. The Hub says when it's Lights out; the touches
// are counted here, as Chromium can't see them while the screen is dark. cage can't power the screen down, so the
// picture is switched off with wlr-randr, and the Waveshare turns its backlight off with no picture.
import { execFile } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);

/** How long a touch keeps the screen lit, as the Hub stays awake for in Sleep. */
export const AWAKE_MS = 2 * 60_000;
/** How often to ask the Hub, so a change in Settings shows within a minute. */
export const ASK_EVERY_MS = 30_000;

/** Dark only in Lights out hours, two minutes after the last touch. */
export function shouldBeDark({ lightsOut, lastTouch, now }) {
	return lightsOut && now - lastTouch >= AWAKE_MS;
}

/** Whether the Hub says it's Lights out. Any trouble reaching it means no, so the screen is never left dark by mistake. */
export async function askHub(url, fetchImpl = fetch) {
	try {
		const response = await fetchImpl(`${url}/api/screen`, { signal: AbortSignal.timeout(5_000) });
		return response.ok && (await response.json()).lightsOut === true;
	} catch {
		return false;
	}
}

/** cage's Wayland socket, such as wayland-0, among the names in the kiosk's runtime folder. */
export function waylandSocket(names) {
	return names.filter((name) => /^wayland-\d+$/.test(name)).sort()[0] ?? null;
}

/**
 * Keeps the screen as it should be. `power(on, display)` switches it; `display()` finds cage's socket, which changes when
 * the kiosk restarts and its new cage lights the screen again, so the screen is switched again then. `wake()` tells the
 * Hub a touch lit the screen.
 */
export function createScreen({ power, display, wake = async () => {}, now = Date.now, log = console.log }) {
	let lightsOut = false;
	// Starting counts as a touch, so a restart never darkens the screen straight away.
	let lastTouch = now();
	let lit = null;
	let shown = null;
	let busy = Promise.resolve();

	async function apply() {
		const current = await display();
		if (!current) return;
		if (current.id !== shown) lit = null;
		const on = !shouldBeDark({ lightsOut, lastTouch, now: now() });
		if (lit === on) return;
		try {
			await power(on, current.name);
			lit = on;
			shown = current.id;
			log(on ? 'Screen on' : 'Screen off: Lights out, and untouched for two minutes');
		} catch (error) {
			log(`Couldn't switch the screen ${on ? 'on' : 'off'}: ${error.message}`);
		}
	}
	// One switch at a time, in order.
	const queue = () => (busy = busy.then(apply));

	return {
		// A touch sends hundreds of events: only a dark screen needs anything more than the time. Chromium doesn't see a
		// touch made in the dark, so once it's lit, the Hub is told to wake as if it had.
		touched() {
			lastTouch = now();
			if (lit !== false) return busy;
			return queue().then(() => (lit === true ? wake().catch(() => {}) : undefined));
		},
		hubSays(isLightsOut) {
			lightsOut = isLightsOut;
			return queue();
		},
		tick: queue
	};
}

/** Calls `touched` for anything the touchscreen sends, reopening it if it goes away, as when it's unplugged. */
function watchTouches(device, touched, log) {
	const open = () => {
		const stream = createReadStream(device);
		stream.on('data', touched);
		stream.on('error', (error) => {
			log(`Can't read the touchscreen, trying again in 5 seconds: ${error.message}`);
			setTimeout(open, 5_000);
		});
		stream.on('end', () => setTimeout(open, 5_000));
	};
	open();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	const env = process.env;
	const runtime = env.XDG_RUNTIME_DIR;
	const output = env.FAMILYHUB_OUTPUT;
	const screen = createScreen({
		async display() {
			const name = waylandSocket(await readdir(runtime).catch(() => []));
			if (!name) return null;
			const { ino, ctimeMs } = await stat(join(runtime, name));
			return { name, id: `${ino}:${ctimeMs}` };
		},
		async power(on, name) {
			await run('wlr-randr', ['--output', output, on ? '--on' : '--off'], {
				env: { ...env, WAYLAND_DISPLAY: name },
				timeout: 10_000
			});
		},
		async wake() {
			// JSON, as SvelteKit refuses a bare POST from anywhere but its own pages.
			const response = await fetch(`${env.FAMILYHUB_URL}/api/screen`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: '{}',
				signal: AbortSignal.timeout(5_000)
			});
			if (!response.ok) console.log(`The Hub didn't take the touch: ${response.status}`);
		}
	});
	watchTouches(env.FAMILYHUB_TOUCHSCREEN, () => screen.touched(), console.log);
	const ask = async () => screen.hubSays(await askHub(env.FAMILYHUB_URL));
	ask();
	setInterval(ask, ASK_EVERY_MS);
	// Notices when two minutes untouched are up, between asks.
	setInterval(() => screen.tick(), 5_000);
}
