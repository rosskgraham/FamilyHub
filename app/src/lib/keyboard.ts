// The Hub's on-screen keyboard (ADR 0009): its keys, and how a key press changes a text box. Kept apart from the
// component so it can be unit tested.

export type Layer = 'letters' | 'symbols';

export type Key =
	| { kind: 'char'; char: string }
	| { kind: 'shift' }
	| { kind: 'backspace' }
	| { kind: 'layer'; to: Layer; label: string }
	| { kind: 'space' }
	| { kind: 'hide' }
	| { kind: 'enter' };

const chars = (row: string): Key[] => [...row].map((char) => ({ kind: 'char', char }));

/** A British keyboard, with numbers along the top so a quantity never needs the symbols. */
export const layers: Record<Layer, Key[][]> = {
	letters: [
		chars('1234567890'),
		chars('qwertyuiop'),
		chars("asdfghjkl'"),
		[{ kind: 'shift' }, ...chars('zxcvbnm,.'), { kind: 'backspace' }],
		[{ kind: 'layer', to: 'symbols', label: '?123' }, { kind: 'space' }, { kind: 'hide' }, { kind: 'enter' }]
	],
	symbols: [
		chars('1234567890'),
		chars('!@#£€%&*()'),
		chars('-+=/?:;"_\''),
		[...chars('[]<>~°,.'), { kind: 'backspace' }],
		[{ kind: 'layer', to: 'letters', label: 'ABC' }, { kind: 'space' }, { kind: 'hide' }, { kind: 'enter' }]
	]
};

/** Whether the next letter should be a capital: at the start of the box, or of a new sentence. */
export function startsSentence(before: string): boolean {
	return before.trim() === '' || /[.!?]\s+$/.test(before);
}

export interface Edit {
	value: string;
	/** Where the caret ends up. */
	caret: number;
}

/** Types `text` over the selection from `start` to `end`, keeping within `maxLength` (-1 for no limit). */
export function insert(value: string, start: number, end: number, text: string, maxLength = -1): Edit {
	const room = maxLength < 0 ? Infinity : maxLength - (value.length - (end - start));
	const typed = [...text].slice(0, Math.max(0, room)).join('');
	return { value: value.slice(0, start) + typed + value.slice(end), caret: start + typed.length };
}

/** Deletes the selection, or the character before the caret, a whole emoji at a time. */
export function backspace(value: string, start: number, end: number): Edit {
	if (start !== end) return { value: value.slice(0, start) + value.slice(end), caret: start };
	if (start === 0) return { value, caret: 0 };
	const before = [...value.slice(0, start)];
	before.pop();
	const kept = before.join('');
	return { value: kept + value.slice(start), caret: kept.length };
}

/** Text boxes the keyboard types into. Dates, numbers and the like have their own pickers. */
export function takesTyping(el: EventTarget | null): el is HTMLInputElement | HTMLTextAreaElement {
	if (typeof HTMLElement === 'undefined' || !(el instanceof HTMLElement)) return false;
	if (el instanceof HTMLTextAreaElement) return !el.readOnly && !el.disabled;
	if (!(el instanceof HTMLInputElement) || el.readOnly || el.disabled) return false;
	return ['text', 'search', ''].includes(el.getAttribute('type') ?? '');
}
