<script lang="ts">
	// Screen E: change an item's text, or remove it, in a sheet from the bottom. Removing doesn't ask first; the list
	// shows Undo instead.
	import { MOST_TEXT, validText } from './shopping.svelte.ts';

	let {
		text,
		onsave,
		onremove,
		onclose
	}: { text: string; onsave: (text: string) => void; onremove: () => void; onclose: () => void } = $props();

	// Starts from the item's text, then is the person's to change.
	// svelte-ignore state_referenced_locally
	let value = $state(text);
	const focus = (input: HTMLInputElement) => input.focus();
</script>

<button class="shade" aria-label="Close" tabindex="-1" onclick={onclose}></button>
<form
	class="sheet"
	aria-label="Change item"
	onsubmit={(event) => {
		event.preventDefault();
		if (validText(value)) onsave(value);
	}}
>
	<div class="grip"></div>
	<h2>Change item</h2>
	<input
		class="field"
		aria-label="Item"
		bind:value
		maxlength={MOST_TEXT}
		enterkeyhint="done"
		autocomplete="off"
		{@attach focus}
	/>
	<div class="row">
		<button type="button" class="button danger" onclick={onremove}>Remove</button>
		<button type="submit" class="button primary" disabled={!validText(value)}>Save</button>
	</div>
</form>

<style>
	.shade {
		position: fixed;
		inset: 0;
		border: none;
		background: rgb(0 0 0 / 0.45);
		z-index: 4;
	}

	.sheet {
		position: fixed;
		left: 0;
		right: 0;
		bottom: 0;
		z-index: 5;
		background: var(--card);
		border-radius: 26px 26px 0 0;
		padding: 12px 20px 24px;
		display: flex;
		flex-direction: column;
		gap: 14px;
	}

	.grip {
		width: 44px;
		height: 5px;
		border-radius: 3px;
		background: var(--line);
		align-self: center;
	}

	h2 {
		margin: 4px 0 0;
		font-size: 20px;
	}

	.row {
		display: flex;
		gap: 10px;
	}

	.row .button {
		flex: 1;
	}

	.button.danger {
		border-color: var(--danger);
		color: var(--danger);
	}

	.button:disabled {
		opacity: 0.4;
	}
</style>
