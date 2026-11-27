import { onListChanged } from '#lib/server/changes.ts';
import { whenStopping } from '#lib/server/stopping.ts';
import type { RequestHandler } from './$types';

// A comment now and then, so a connection that has died is noticed and closed.
const KEEP_ALIVE_MS = 30_000;

// Server-sent events: one `{"list": "shopping"}` message each time a list changes on a phone, after the Hub has it.
// The stream ends when the Hub is told to stop, so it can exit at once, and the screen's EventSource connects again to
// the next one by itself (AB#41).
export const GET: RequestHandler = () => {
	const encoder = new TextEncoder();
	let stop = () => {};
	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			const send = (text: string) => controller.enqueue(encoder.encode(text));
			const unsubscribe = onListChanged((list) => send(`data: ${JSON.stringify({ list })}\n\n`));
			const keepAlive = setInterval(() => send(': still here\n\n'), KEEP_ALIVE_MS);
			const forget = whenStopping(() => {
				stop();
				controller.close();
			});
			stop = () => {
				unsubscribe();
				clearInterval(keepAlive);
				forget();
			};
		},
		cancel: () => stop()
	});
	return new Response(stream, { headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' } });
};
