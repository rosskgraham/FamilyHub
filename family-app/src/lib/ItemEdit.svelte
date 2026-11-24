<script lang="ts">
	// Screen E (design/mockups/family-app, AB#79): an item's text, changed in its row. Done, or tapping anywhere else,
	// saves; Back or Escape cancels. Text that's cleared, unchanged or too long changes nothing: the list's rename
	// refuses it, and the old text shows again.
	//
	// Back cancels through an entry in the history (SvelteKit's shallow routing, page.state.editing), added when an
	// edit starts unless one's already there. Done and Escape take it away again. Tapping elsewhere leaves it, as that
	// tap may be starting the next edit, which then uses the same entry: taking it away there could land after the
	// next edit had started, and cancel it. So after an edit saved that way, Back does nothing once.
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { MOST_TEXT } from './shopping.svelte.ts';

	let { text, onsave, oncancel }: { text: string; onsave: (text: string) => void; oncancel: () => void } = $props();

	// Starts from the item's text, then is the person's to change.
	// svelte-ignore state_referenced_locally
	let value = $state(text);
	let finished = false;
	// Set once page.state has shown the history's entry for editing, so Back taking it away is noticed.
	let seen = false;

	function finish(save: boolean, fromKeyboard = false) {
		if (finished) return;
		finished = true;
		if (save) onsave(value);
		else oncancel();
		if (fromKeyboard && page.state.editing) history.back();
	}

	$effect(() => {
		if (page.state.editing) seen = true;
		else if (seen) finish(false);
	});

	function start(input: HTMLInputElement) {
		input.focus();
		input.setSelectionRange(value.length, value.length);
		if (!page.state.editing) void goto(page.url, { state: { editing: true }, shallow: true, reset: false });
	}
</script>

<input
	class="field edit"
	aria-label="Change {text}"
	bind:value
	maxlength={MOST_TEXT}
	enterkeyhint="done"
	autocomplete="off"
	onkeydown={(event) => {
		if (event.key === 'Enter') {
			event.preventDefault();
			finish(true, true);
		} else if (event.key === 'Escape') {
			finish(false, true);
		}
	}}
	onblur={() => finish(true)}
	{@attach start}
/>

<style>
	.edit {
		flex: 1;
		min-width: 0;
		height: 48px;
		margin: 6px 12px 6px 0;
		font-weight: 600;
		font-size: 19px;
		border-color: var(--ink);
	}
</style>
