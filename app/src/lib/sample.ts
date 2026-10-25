// Stand-ins for the weather and the Shopping list until their own steps.

export interface Weather {
	temperature: number;
	summary: string;
	high: number;
	low: number;
}

export interface ShoppingItem {
	id: string;
	text: string;
	tickedOff: boolean;
}

export const sampleWeather: Weather = { temperature: 11, summary: 'Light rain', high: 13, low: 8 };

export const sampleShopping: ShoppingItem[] = [
	{ id: 'milk', text: 'Milk', tickedOff: false },
	{ id: 'eggs', text: 'Eggs', tickedOff: false },
	{ id: 'bananas', text: 'Bananas', tickedOff: false },
	{ id: 'cheddar', text: 'Cheddar', tickedOff: false },
	{ id: 'washing-up-liquid', text: 'Washing-up liquid', tickedOff: false },
	{ id: 'lunchbox-snacks', text: 'Lunchbox snacks', tickedOff: false },
	{ id: 'bread', text: 'Wholemeal bread', tickedOff: true }
];
