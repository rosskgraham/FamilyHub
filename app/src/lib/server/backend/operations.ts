// Changes made at the Hub for the backend's operation endpoints, such as the Shopping list's and the meals', sent in
// order and kept in a file while the backend can't be reached (AB#103, AB#98).
import { readJson, writeJson } from '../store.ts';
import { BackendRequestFailed, type BackendRequest } from './auth.ts';

/** An operation as the backend takes it: an id made on the Hub, so sending it again changes nothing. */
export interface BackendOperation {
	id: string;
	type: string;
}

// The most the backend takes in one request.
const BATCH = 100;

/** The backend won't take a change, such as ticking off an item with no text. None of its batch was applied. */
const turnedDown = (e: unknown) => e instanceof BackendRequestFailed && e.status === 422;
const why = (e: unknown) => (e instanceof Error ? e.message : e);

export interface OperationsOptions<O extends BackendOperation> {
	/** The backend's endpoint, such as /lists/shopping/operations. */
	path: string;
	/** For the log, such as "Shopping list". */
	name: string;
	/** What a dropped operation was about, for the log, without its text. */
	describe?: (op: O) => string;
}

/**
 * Sends the operations in order, in batches, and resolves to what's left: nothing, or everything from the first one the
 * backend couldn't be reached for. One it turns down is logged and dropped rather than retried forever. Operations
 * already applied before a lost answer are sent again with the same ids, which changes nothing.
 */
export async function sendOperations<O extends BackendOperation>(
	operations: O[],
	request: BackendRequest,
	{ path, name, describe = (op) => op.id }: OperationsOptions<O>
): Promise<O[]> {
	const post = (batch: O[]) => request('POST', path, { operations: batch });
	for (let i = 0; i < operations.length; i += BATCH) {
		const batch = operations.slice(i, i + BATCH);
		try {
			await post(batch);
			continue;
		} catch (e) {
			if (!turnedDown(e)) {
				console.error(`${name} still offline:`, why(e));
				return operations.slice(i);
			}
		}
		// One of the batch was turned down, so none of it was applied: send them one at a time, to drop only that one.
		for (const [j, op] of batch.entries()) {
			try {
				await post([op]);
			} catch (e) {
				if (turnedDown(e)) {
					console.error(`${name} change dropped: ${op.type} ${describe(op)}:`, why(e));
					continue;
				}
				console.error(`${name} still offline:`, why(e));
				return operations.slice(i + j);
			}
		}
	}
	return [];
}

export interface OperationQueue<O extends BackendOperation> {
	read(): Promise<O[]>;
	/** Sends what's waiting, then `more`, and resolves to what's still waiting. */
	send(request: BackendRequest, more?: O[]): Promise<O[]>;
}

/** Operations waiting to be sent, in a file in the Hub's data folder, or in `dir` for tests. */
export function createOperationQueue<O extends BackendOperation>(
	file: string,
	options: OperationsOptions<O>,
	dir?: string
): OperationQueue<O> {
	// One send at a time, so a change made while the queue is being sent isn't lost or sent out of order.
	let busy: Promise<unknown> = Promise.resolve();
	function serially<T>(task: () => Promise<T>): Promise<T> {
		const result = busy.then(task);
		busy = result.catch(() => undefined);
		return result;
	}
	const load = async () => (await readJson<O[]>(file, dir)) ?? [];

	return {
		read: () => serially(load),
		send: (request, more = []) =>
			serially(async () => {
				const waiting = await load();
				const operations = [...waiting, ...more];
				if (operations.length === 0) return operations;
				const left = await sendOperations(operations, request, options);
				// Only written when something waits, or waited, to spare the Pi's SD card.
				if (waiting.length > 0 || left.length > 0) await writeJson(file, left, dir);
				return left;
			})
	};
}
