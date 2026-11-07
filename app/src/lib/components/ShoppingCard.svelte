<script lang="ts">
	import { sendChange } from '#lib/quick-action.ts';
	import type { ShoppingItem, ShoppingStatus } from '#lib/shopping.ts';
	import ListChip from './ListChip.svelte';

	let { items, status }: { items: ShoppingItem[]; status: ShoppingStatus } = $props();

	let adding = $state(false);
	let draft = $state('');
	let problem: string | null = $state(null);
	const toGet = $derived(items.filter((i) => !i.tickedOff).length);

	async function add(event: SubmitEvent) {
		event.preventDefault();
		const text = draft.trim();
		if (!text) return;
		draft = '';
		adding = false;
		problem = await sendChange('/api/shopping', { action: 'add', text });
		if (problem) draft = text;
	}

	function focus(node: HTMLInputElement) {
		node.focus();
	}
</script>

<!-- The Today view's Shopping list, small: how many things to get, and a quick add. The list is in the Shopping Section. -->
<section class="shopping">
	{#if adding}
		<form class="add" onsubmit={add}>
			<input bind:value={draft} placeholder="What do we need?" maxlength="200" aria-label="New item" use:focus />
			<button class="primary" type="submit" disabled={!draft.trim()}>Add</button>
			<button class="quiet" type="button" onclick={() => ((adding = false), (draft = ''))}>Cancel</button>
		</form>
	{:else}
		<div class="row">
			<a class="open" href="/shopping">
				<h2>Shopping</h2>
				<ListChip {status} label="{toGet} to get" />
			</a>
			<button class="quiet" onclick={() => (adding = true)}>
				<svg
					width="26"
					height="26"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2.6"
					stroke-linecap="round"
					aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg
				>
				Add
			</button>
		</div>
	{/if}
	{#if problem}<p class="message" role="alert">{problem}</p>{/if}
</section>

<style>
	.shopping {
		flex: none;
		box-sizing: border-box;
		display: flex;
		flex-direction: column;
		gap: 12px;
		padding: 24px 28px;
		border-radius: 28px;
		background: var(--card);
	}
	.row,
	.add {
		height: 72px;
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.open {
		flex: 1;
		min-width: 0;
		height: 100%;
		display: flex;
		align-items: center;
		gap: 16px;
	}
	h2 {
		margin: 0;
		font-size: 36px;
		font-weight: 700;
	}
	input {
		flex: 1;
		min-width: 0;
		height: 72px;
		box-sizing: border-box;
		padding: 0 20px;
		border-radius: 22px;
		border: 2px solid var(--line);
		font: inherit;
		font-size: 26px;
	}
	.primary,
	.quiet {
		flex: none;
		height: 72px;
		padding: 0 24px;
		box-sizing: border-box;
		border-radius: 22px;
		font-size: 26px;
		font-weight: 700;
		display: inline-flex;
		align-items: center;
		gap: 10px;
	}
	.primary {
		border: 0;
		background: var(--ink);
		color: var(--on-ink);
	}
	.primary:disabled {
		opacity: 0.4;
	}
	.quiet {
		border: 2px solid var(--line);
		background: var(--card);
	}
	.message {
		margin: 0;
		padding: 10px 16px;
		border-radius: 14px;
		background: var(--warn-bg);
		color: var(--warn-fg);
		font-size: 22px;
		font-weight: 600;
	}
</style>
