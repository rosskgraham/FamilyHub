<script lang="ts">
	// How the list is sorted (AB#86, design/mockups/family-app screens K and N): a pill under the count, filled in
	// when a Shop is picked. Tapping it opens Newest first, each Shop, and Add a shop, which turns into a name box:
	// Add (Enter) adds the Shop for the Household and picks it here. Tapping elsewhere, Escape or Back closes it.
	//
	// Back closes it through an entry in the history (SvelteKit's shallow routing, page.state.picking), as editing an
	// item does (ItemEdit.svelte), so Back doesn't leave the app.
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { MOST_SHOP_NAME, type ShoppingList } from './shopping.svelte.ts';

	let { list, open = $bindable(false) }: { list: ShoppingList; open?: boolean } = $props();

	let adding = $state(false);
	let name = $state('');

	function show() {
		open = true;
		adding = false;
		name = '';
		if (!page.state.picking) void goto(page.url.href, { state: { picking: true }, shallow: true, reset: false });
	}

	function close() {
		if (!open) return;
		open = false;
		if (page.state.picking) history.back();
	}

	// Set once page.state has shown the history's entry for the open picker, so Back taking it away is noticed.
	let seen = false;
	$effect(() => {
		if (page.state.picking) seen = true;
		else if (seen) {
			seen = false;
			open = false;
		}
	});

	function pick(shopId: string | null) {
		list.pick(shopId);
		close();
	}

	function add(event: SubmitEvent) {
		event.preventDefault();
		if (list.addShop(name)) close();
	}
</script>

<button
	class="pill"
	class:picked={list.shop}
	aria-haspopup="menu"
	aria-expanded={open}
	onclick={() => (open ? close() : show())}
>
	{list.shop ? list.shop.name : 'Newest first'} <span aria-hidden="true">▾</span>
</button>
{#if open}
	<button class="away" aria-label="Close" tabindex="-1" onclick={close}></button>
	<div class="menu" role="menu">
		<button
			class="option"
			class:on={!list.shop}
			role="menuitemradio"
			aria-checked={!list.shop}
			onclick={() => pick(null)}
		>
			Newest first {#if !list.shop}<span aria-hidden="true">✓</span>{/if}
		</button>
		{#each list.shops as shop (shop.id)}
			{@const on = list.shop?.id === shop.id}
			<button class="option" class:on role="menuitemradio" aria-checked={on} onclick={() => pick(shop.id)}>
				{shop.name}
				{#if on}<span aria-hidden="true">✓</span>{/if}
			</button>
		{/each}
		{#if adding}
			<form onsubmit={add}>
				<input
					class="field"
					aria-label="Shop name"
					placeholder="Shop name"
					bind:value={name}
					maxlength={MOST_SHOP_NAME}
					enterkeyhint="done"
					autocomplete="off"
					onkeydown={(event) => event.key === 'Escape' && close()}
					{@attach (input) => input.focus()}
				/>
			</form>
		{:else}
			<button class="option add" role="menuitem" onclick={() => (adding = true)}>
				<span aria-hidden="true">＋</span> Add a shop
			</button>
		{/if}
	</div>
{/if}

<style>
	.pill {
		margin-top: 8px;
		height: 36px;
		padding: 0 14px;
		border-radius: 18px;
		border: 2px solid var(--line);
		background: var(--card);
		color: var(--ink);
		font-size: 16px;
		font-weight: 700;
		position: relative;
		z-index: 3;
	}

	.pill.picked {
		background: var(--ink);
		border-color: var(--ink);
		color: var(--on-ink);
	}

	.away {
		position: fixed;
		inset: 0;
		border: none;
		background: none;
		z-index: 2;
	}

	.menu {
		position: absolute;
		top: calc(100% - 4px);
		left: 16px;
		width: 250px;
		padding: 8px;
		box-sizing: border-box;
		border-radius: 18px;
		background: var(--card);
		border: 1px solid var(--line);
		box-shadow: 0 12px 32px rgb(0 0 0 / 0.25);
		display: flex;
		flex-direction: column;
		z-index: 3;
	}

	.option {
		height: 50px;
		padding: 0 12px;
		border: none;
		border-radius: 12px;
		background: none;
		color: var(--ink);
		font-size: 18px;
		font-weight: 600;
		text-align: left;
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.option.on {
		background: var(--soft);
	}

	.option.add {
		justify-content: flex-start;
		gap: 6px;
		margin-top: 4px;
		border-top: 1px solid var(--line);
		border-radius: 0;
		color: var(--dim);
	}

	form .field {
		width: 100%;
		box-sizing: border-box;
		height: 50px;
		margin-top: 6px;
	}
</style>
