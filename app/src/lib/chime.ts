// A short rising chime for finishing a Routine, made in the browser so there's no sound file.
const NOTES = [523.25, 659.25, 783.99, 1046.5]; // C, E, G, C
const GAP = 0.12;
const RING = 0.6;

export function chime(): void {
	let context: AudioContext;
	try {
		context = new AudioContext();
	} catch {
		return;
	}
	NOTES.forEach((frequency, i) => {
		const start = context.currentTime + i * GAP;
		const tone = context.createOscillator();
		const volume = context.createGain();
		tone.type = 'sine';
		tone.frequency.value = frequency;
		volume.gain.setValueAtTime(0, start);
		volume.gain.linearRampToValueAtTime(0.25, start + 0.02);
		volume.gain.exponentialRampToValueAtTime(0.001, start + RING);
		tone.connect(volume).connect(context.destination);
		tone.start(start);
		tone.stop(start + RING + 0.05);
	});
	setTimeout(() => context.close(), (NOTES.length * GAP + RING + 0.5) * 1000);
}
