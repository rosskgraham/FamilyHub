// See https://svelte.dev/docs/kit/types#app.d.ts
declare global {
	namespace App {
		interface PageState {
			/** An item's text is being changed in place: Back cancels it (ItemEdit.svelte, AB#79). */
			editing?: boolean;
		}
	}
}

export {};
