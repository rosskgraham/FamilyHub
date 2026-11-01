import { afterEach, describe, expect, it, vi } from 'vitest';
import { Failing } from './failing.ts';

const at = (time: string) => Date.parse(`2026-10-28T${time}:00Z`);

describe('Failing', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('needs Alex once failures have run for an hour, from the first', () => {
		const octopus = new Failing('Octopus');
		octopus.failed(at('14:02'));
		octopus.failed(at('14:30'));
		expect(octopus.needsAlex(at('15:01'))).toBeNull();
		expect(octopus.needsAlex(at('15:02'))).toBe('2026-10-28T14:02:00.000Z');
	});

	it('starts again after a success', () => {
		const octopus = new Failing('Octopus');
		octopus.failed(at('14:02'));
		octopus.ok();
		octopus.failed(at('15:00'));
		expect(octopus.needsAlex(at('15:30'))).toBeNull();
	});

	it('logs the hour once per run of failures', () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const zappi = new Failing('myenergi');
		zappi.failed(at('14:02'));
		zappi.failed(at('15:02'));
		zappi.failed(at('15:30'));
		expect(error).toHaveBeenCalledTimes(1);
		expect(error).toHaveBeenCalledWith('myenergi sync failing for over an hour, since 2026-10-28T14:02:00.000Z');
		zappi.ok();
		zappi.failed(at('16:00'));
		zappi.failed(at('17:00'));
		expect(error).toHaveBeenCalledTimes(2);
	});
});
