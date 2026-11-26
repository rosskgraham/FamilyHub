// Tells the screen a list has changed on a phone, through /api/changes, so it loads it again at once rather than at
// the next minute.
type Listener = (list: string) => void;

const listeners = new Set<Listener>();

/** Returns a function that stops listening. */
export function onListChanged(listener: Listener): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

export function announceListChanged(list: string): void {
	for (const listener of listeners) listener(list);
}
