import { afterEach, describe, expect, it, vi } from 'vitest';

const others = () => {};

afterEach(() => {
	process.removeAllListeners('SIGTERM');
	process.removeAllListeners('SIGINT');
	vi.resetModules();
});

describe('whenStopping', () => {
	it('runs each task on SIGTERM, when adapter-node already handles it', async () => {
		process.on('SIGTERM', others);
		const { whenStopping } = await import('./stopping.ts');
		const ran: string[] = [];
		whenStopping(() => ran.push('stream'));
		whenStopping(() => ran.push('live'));
		process.emit('SIGTERM');
		expect(ran).toEqual(['stream', 'live']);
	});

	it('forgets a task once told to', async () => {
		process.on('SIGTERM', others);
		const { whenStopping } = await import('./stopping.ts');
		const ran: string[] = [];
		const forget = whenStopping(() => ran.push('stream'));
		forget();
		process.emit('SIGTERM');
		expect(ran).toEqual([]);
	});

	it('doesn’t listen when nothing else handles the signal, so Node still exits on it', async () => {
		const { whenStopping } = await import('./stopping.ts');
		whenStopping(() => {});
		expect(process.listenerCount('SIGTERM')).toBe(0);
		expect(process.listenerCount('SIGINT')).toBe(0);
	});
});
