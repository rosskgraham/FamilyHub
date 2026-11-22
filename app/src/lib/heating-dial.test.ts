import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Heating, TargetChange } from './heating.ts';
import { createDial, SEND_AFTER_MS } from './heating-dial.ts';

const heating = (target: number): Heating => ({
	reporting: true,
	temperature: 19.5,
	humidity: 67,
	heating: true,
	mode: 'heat',
	target
});

describe('the dial', () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	function dial(answer: (target: number) => TargetChange | null) {
		const send = vi.fn(async (target: number) => answer(target));
		return { send, dial: createDial({ send, onchange: () => {} }) };
	}

	it('shows each tap at once, and sends one change with the last target 2 seconds after the last tap', async () => {
		const { send, dial: d } = dial((t) => ({ outcome: 'changed', heating: heating(t) }));
		d.tap(1, 21);
		expect(d.target).toBe(21.5);
		await vi.advanceTimersByTimeAsync(1500);
		d.tap(1, 21);
		await vi.advanceTimersByTimeAsync(1500);
		d.tap(1, 21);
		expect(d.target).toBe(22);
		expect(send).not.toHaveBeenCalled();

		await vi.advanceTimersByTimeAsync(SEND_AFTER_MS - 1);
		expect(send).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(1);
		expect(SEND_AFTER_MS).toBe(2000);
		expect(send).toHaveBeenCalledTimes(1);
		expect(send).toHaveBeenCalledWith(22);
		// Answered: the panel shows the Nest's own target again, as the Hub read it afterwards.
		expect(d.target).toBeNull();
		expect(d.failed).toBe(false);
	});

	it('stops at 22° and 16°', async () => {
		const { send, dial: d } = dial((t) => ({ outcome: 'changed', heating: heating(t) }));
		for (let i = 0; i < 6; i++) d.tap(1, 21);
		expect(d.target).toBe(22);
		await vi.advanceTimersByTimeAsync(SEND_AFTER_MS);
		expect(send).toHaveBeenLastCalledWith(22);

		for (let i = 0; i < 20; i++) d.tap(-1, 22);
		expect(d.target).toBe(16);
		await vi.advanceTimersByTimeAsync(SEND_AFTER_MS);
		expect(send).toHaveBeenLastCalledWith(16);
		expect(send).toHaveBeenCalledTimes(2);
	});

	it('sends straight away when the panel closes before the 2 seconds are up', async () => {
		const { send, dial: d } = dial((t) => ({ outcome: 'changed', heating: heating(t) }));
		d.tap(-1, 21);
		d.flush();
		await vi.advanceTimersByTimeAsync(0);
		expect(send).toHaveBeenCalledWith(20.5);
		await vi.advanceTimersByTimeAsync(SEND_AFTER_MS);
		expect(send).toHaveBeenCalledTimes(1);
	});

	it('sends nothing when the panel closes with no taps', async () => {
		const { send, dial: d } = dial(() => null);
		d.flush();
		await vi.advanceTimersByTimeAsync(SEND_AFTER_MS);
		expect(send).not.toHaveBeenCalled();
	});

	it('says the change failed, and shows the Nest’s own target again, when the Nest turns it down', async () => {
		const { dial: d } = dial(() => ({ outcome: 'failed', heating: heating(21) }));
		d.tap(1, 21);
		await vi.advanceTimersByTimeAsync(SEND_AFTER_MS);
		expect(d.failed).toBe(true);
		expect(d.target).toBeNull();

		// Trying again clears it.
		d.tap(1, 21);
		expect(d.failed).toBe(false);
	});

	it('says the change failed when the Hub can’t be reached', async () => {
		const send = vi.fn(async () => {
			throw new TypeError('Failed to fetch');
		});
		const d = createDial({ send, onchange: () => {} });
		d.tap(1, 21);
		await vi.advanceTimersByTimeAsync(SEND_AFTER_MS);
		expect(d.failed).toBe(true);
	});

	it('keeps taps made while a change is on its way', async () => {
		let answer: (change: TargetChange) => void = () => {};
		const send = vi.fn(() => new Promise<TargetChange>((resolve) => (answer = resolve)));
		const d = createDial({ send, onchange: () => {} });
		d.tap(1, 21);
		await vi.advanceTimersByTimeAsync(SEND_AFTER_MS);
		d.tap(1, 21);
		answer({ outcome: 'changed', heating: heating(21.5) });
		await vi.advanceTimersByTimeAsync(0);
		expect(d.target).toBe(22);
	});
});
