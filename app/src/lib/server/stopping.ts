// When the Hub is told to stop (SIGTERM from systemd as a release restarts it, or Ctrl+C), adapter-node stops taking
// connections and waits for the open ones to end, up to 30 s. The screen's /api/changes stream never ends by itself, so
// without this the Hub waited until systemd killed it, and the wall showed an error page meanwhile (AB#41).

const tasks = new Set<() => void>();
let listening = false;

function stopping() {
	for (const task of [...tasks]) task();
}

/**
 * Runs task as soon as the Hub is told to stop, and returns a function that forgets it. It only listens when something
 * else already handles the signal (adapter-node, or Vite on the PC), as a listener of its own would stop Node exiting.
 */
export function whenStopping(task: () => void): () => void {
	if (!listening) {
		for (const signal of ['SIGTERM', 'SIGINT'] as const)
			if (process.listenerCount(signal) > 0) {
				process.on(signal, stopping);
				listening = true;
			}
	}
	tasks.add(task);
	return () => tasks.delete(task);
}
