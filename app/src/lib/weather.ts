export type WeatherIcon = 'sun' | 'moon' | 'partly' | 'cloud' | 'fog' | 'rain' | 'snow' | 'storm';

export interface Weather {
	/** °C, rounded. */
	temperature: number;
	summary: string;
	icon: WeatherIcon;
	high: number;
	low: number;
	/** The highest chance of rain in the next few hours, as a percentage. */
	rainChance: number;
}

/** How many hours ahead `rainChance` looks. */
export const RAIN_HOURS = 3;
