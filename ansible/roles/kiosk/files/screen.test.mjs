import assert from 'node:assert/strict';
import { test } from 'node:test';
import { askHub, AWAKE_MS, createScreen, shouldBeDark, waylandSocket } from './screen.mjs';

/** A screen with a pretend clock and wlr-randr, recording each switch as 'on' or 'off'. */
function pretend({ fails = false } = {}) {
	const clock = { now: 1_000_000 };
	const switches = [];
	const wakes = [];
	const socket = { name: 'wayland-0', id: 'first' };
	const screen = createScreen({
		now: () => clock.now,
		display: async () => socket,
		power: async (on) => {
			if (fails) throw new Error('no compositor');
			switches.push(on ? 'on' : 'off');
		},
		wake: async () => wakes.push(clock.now),
		log: () => {}
	});
	return { screen, clock, switches, wakes, socket };
}

test('tells the Hub to wake when a touch lights a dark screen, and only then', async () => {
	const { screen, clock, wakes } = pretend();
	await screen.hubSays(true);
	await screen.touched();
	assert.equal(wakes.length, 0, 'the screen was lit, so Chromium saw the touch itself');
	clock.now += AWAKE_MS;
	await screen.tick();
	await screen.touched();
	await screen.touched();
	assert.equal(wakes.length, 1);
	clock.now += AWAKE_MS;
	await screen.tick();
	await screen.hubSays(false);
	assert.equal(wakes.length, 1, 'lit because Lights out ended, not by a touch');
});

test("a Hub that can't be told doesn't stop the screen lighting", async () => {
	const clock = { now: 0 };
	const switches = [];
	const screen = createScreen({
		now: () => clock.now,
		display: async () => ({ name: 'wayland-0', id: 'first' }),
		power: async (on) => switches.push(on ? 'on' : 'off'),
		wake: async () => {
			throw new Error('ECONNREFUSED');
		},
		log: () => {}
	});
	await screen.hubSays(true);
	clock.now += AWAKE_MS;
	await screen.tick();
	await assert.doesNotReject(screen.touched());
	assert.deepEqual(switches, ['on', 'off', 'on']);
});

test('dark only in Lights out hours, two minutes after the last touch', () => {
	assert.equal(shouldBeDark({ lightsOut: true, lastTouch: 0, now: AWAKE_MS }), true);
	assert.equal(shouldBeDark({ lightsOut: true, lastTouch: 0, now: AWAKE_MS - 1 }), false);
	assert.equal(shouldBeDark({ lightsOut: false, lastTouch: 0, now: AWAKE_MS * 10 }), false);
});

test("lights the screen on starting, and doesn't darken it for two minutes", async () => {
	const { screen, clock, switches } = pretend();
	await screen.hubSays(true);
	assert.deepEqual(switches, ['on']);
	clock.now += AWAKE_MS;
	await screen.tick();
	assert.deepEqual(switches, ['on', 'off']);
});

test('a touch lights a dark screen straight away, and it goes dark again two minutes later', async () => {
	const { screen, clock, switches } = pretend();
	await screen.hubSays(true);
	clock.now += AWAKE_MS;
	await screen.tick();
	await screen.touched();
	assert.deepEqual(switches, ['on', 'off', 'on']);
	clock.now += AWAKE_MS - 1;
	await screen.tick();
	assert.deepEqual(switches, ['on', 'off', 'on']);
	clock.now += 1;
	await screen.tick();
	assert.deepEqual(switches, ['on', 'off', 'on', 'off']);
});

test('lights the screen when Lights out ends, without a touch', async () => {
	const { screen, clock, switches } = pretend();
	await screen.hubSays(true);
	clock.now += AWAKE_MS;
	await screen.tick();
	await screen.hubSays(false);
	assert.deepEqual(switches, ['on', 'off', 'on']);
});

test("doesn't switch a screen that's already as it should be", async () => {
	const { screen, switches } = pretend();
	await screen.hubSays(false);
	await screen.tick();
	await screen.touched();
	await screen.hubSays(false);
	assert.deepEqual(switches, ['on']);
});

test('switches again when the kiosk restarts, as its new cage lights the screen', async () => {
	const { screen, clock, switches, socket } = pretend();
	await screen.hubSays(true);
	clock.now += AWAKE_MS;
	await screen.tick();
	socket.id = 'second';
	await screen.tick();
	assert.deepEqual(switches, ['on', 'off', 'off']);
});

test('keeps trying when wlr-randr fails', async () => {
	const { screen } = pretend({ fails: true });
	await assert.doesNotReject(screen.hubSays(true));
	await assert.doesNotReject(screen.tick());
});

test("isn't Lights out when the Hub doesn't answer, or answers oddly", async () => {
	const answer = (body, ok = true) => async () => ({ ok, json: async () => body });
	assert.equal(await askHub('http://hub', answer({ lightsOut: true })), true);
	assert.equal(await askHub('http://hub', answer({ lightsOut: false })), false);
	assert.equal(await askHub('http://hub', answer({ lightsOut: 'yes' })), false);
	assert.equal(await askHub('http://hub', answer({ lightsOut: true }, false)), false);
	assert.equal(
		await askHub('http://hub', async () => {
			throw new Error('ECONNREFUSED');
		}),
		false
	);
});

test('asks the Hub at its screen address', async () => {
	let asked;
	await askHub('http://localhost:3000', async (url) => {
		asked = url;
		return { ok: true, json: async () => ({ lightsOut: false }) };
	});
	assert.equal(asked, 'http://localhost:3000/api/screen');
});

test("finds cage's Wayland socket among the runtime folder's files", () => {
	assert.equal(waylandSocket(['bus', 'wayland-0.lock', 'wayland-0', 'pulse']), 'wayland-0');
	assert.equal(waylandSocket(['bus', 'pulse']), null);
});
