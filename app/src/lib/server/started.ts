// When this server started, for Settings. Recorded by the server's init hook, so it's the start, not the first visit.
let startedAt = new Date();

export function markStarted(): void {
	startedAt = new Date();
}

export function serverStartedAt(): Date {
	return startedAt;
}
