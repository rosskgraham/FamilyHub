// A stand-in for the weather until its own step.

export interface Weather {
	temperature: number;
	summary: string;
	high: number;
	low: number;
}

export const sampleWeather: Weather = { temperature: 11, summary: 'Light rain', high: 13, low: 8 };
