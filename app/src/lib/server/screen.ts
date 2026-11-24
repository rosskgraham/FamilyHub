// Touches the Pi's screen service saw while the screen was dark (AB#64). Chromium never sees those, so the service says
// so here, and the page, asleep, asks every second and wakes when there's a new one. A count, not a time, so the Pi's
// and the browser's clocks never have to agree. It starts again with the Hub, and the page starts counting from there.
let touches = 0;

export function screenTouched(): void {
	touches++;
}

export function screenTouches(): number {
	return touches;
}
