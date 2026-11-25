<script lang="ts">
	// The Shopping list (design/mockups/family-app, screens C to N). Tap the box to tick or untick; tap the words to
	// change them in the row; swipe the item either way to remove it (AB#79). The add box sits at the bottom, where a
	// thumb reaches it, and stays open after adding so several items go in one after another. With a Shop picked
	// (AB#86), the items it hasn't placed come first, under "Not placed yet", then the rest in its walking order, and
	// each item to get has a handle to drag it into place, which teaches the Shop.
	import { draggable } from './drag.ts';
	import ItemEdit from './ItemEdit.svelte';
	import Me from './Me.svelte';
	import ShopPicker from './ShopPicker.svelte';
	import { MOST_TEXT, type ShoppingList } from './shopping.svelte.ts';
	import { swipeable } from './swipe.ts';

	let {
		list,
		firstName,
		initial,
		onsignout,
		onsignin,
		menuOpen = $bindable(false),
		pickerOpen = $bindable(false),
		editing = $bindable(null)
	}: {
		list: ShoppingList;
		firstName: string;
		initial: string;
		onsignout: () => void;
		/** Signs in again when sign-in has run out (screen G). */
		onsignin: () => void;
		menuOpen?: boolean;
		/** The Shop picker is open (screen K). */
		pickerOpen?: boolean;
		/** The id of the item whose text is being changed. */
		editing?: string | null;
	} = $props();

	const changes = (n: number) => (n === 1 ? '1 change' : `${n} changes`);

	// Where each item to get sits among the items to get, for a drop to say where it landed.
	const toGet = $derived(list.items.filter((item) => !item.tickedOff));
	// The divider each item starts, if any: with a Shop picked, the first item it hasn't placed, and the first it has.
	// The one into the Shop's order takes part in a drag (drag.ts, AB#87).
	const dividers = $derived.by(() => {
		const starts: Record<string, { text: string; drag: boolean }> = {};
		if (!list.shop) return starts;
		const unplaced = toGet.find((item) => !item.placed);
		const placed = toGet.find((item) => item.placed);
		if (unplaced) starts[unplaced.id] = { text: 'Not placed yet', drag: false };
		if (placed) starts[placed.id] = { text: `In ${list.shop.name} order`, drag: true };
		return starts;
	});

	const grip = [7, 12, 17].flatMap((y) => [
		[9, y],
		[15, y]
	]);

	let adding = $state('');
	// The item just added, picked out for a moment so the eye finds it.
	let fresh: string | null = $state(null);
	let freshTimer: ReturnType<typeof setTimeout> | undefined;

	function add(event: SubmitEvent) {
		event.preventDefault();
		const before = new Set(list.items.map((item) => item.id));
		if (!list.add(adding)) return;
		adding = '';
		fresh = list.items.find((item) => !before.has(item.id))?.id ?? null;
		clearTimeout(freshTimer);
		freshTimer = setTimeout(() => (fresh = null), 1500);
	}
</script>

<div class="screen">
	{#if list.reach === 'signed-out'}
		<div class="banner" role="status">
			<span aria-hidden="true">⚠</span>
			<span>
				<b>Sign in again</b>
				{list.waiting ? 'Changes are kept until you do.' : 'To keep the list up to date.'}
			</span>
			<button onclick={onsignin}>Sign in</button>
		</div>
	{:else if list.reach === 'offline'}
		<div class="banner" role="status">
			<span aria-hidden="true">⚠</span>
			<span>
				<b>No signal</b>
				{list.waiting
					? `${changes(list.waiting)} will send when you're back online.`
					: 'This is the list as it was last seen.'}
			</span>
		</div>
	{/if}
	<header>
		<div>
			<h1>Shopping</h1>
			<p class="count">{list.toGet ? `${list.toGet} to get` : 'Nothing to get'}</p>
			<ShopPicker {list} bind:open={pickerOpen} />
		</div>
		<Me {firstName} {initial} {onsignout} unsent={list.waiting} bind:open={menuOpen} />
	</header>

	{#if list.items.length}
		<ul>
			{#each list.items as item (item.id)}
				{@const divider = dividers[item.id]}
				{#if divider}
					<li class="divider" data-drag-divider={divider.drag ? '' : undefined}>{divider.text}</li>
				{/if}
				<li
					class:done={item.tickedOff}
					class:fresh={item.id === fresh}
					data-drag-row={list.shop && !item.tickedOff ? '' : undefined}
					{@attach editing !== item.id && swipeable(() => list.remove(item.id))}
				>
					<span class="band" aria-hidden="true">Remove</span>
					<div class="slide" data-slide>
						<button
							class="box"
							role="checkbox"
							aria-checked={item.tickedOff}
							aria-label={item.text}
							onclick={() => list.toggle(item.id)}
						>
							<span class="mark">{item.tickedOff ? '✓' : ''}</span>
						</button>
						{#if editing === item.id}
							<ItemEdit
								text={item.text}
								onsave={(changed) => {
									list.rename(item.id, changed);
									if (editing === item.id) editing = null;
								}}
								oncancel={() => {
									if (editing === item.id) editing = null;
								}}
							/>
						{:else}
							<button class="text" onclick={() => (editing = item.id)}>{item.text}</button>
							{#if item.waiting}<span class="waiting">◷ waiting</span>{/if}
						{/if}
						{#if list.shop && !item.tickedOff}
							<span
								class="handle"
								role="button"
								tabindex="-1"
								aria-label="Move {item.text}"
								{@attach draggable((to) => list.place(item.id, to))}
							>
								<svg viewBox="0 0 24 24" aria-hidden="true">
									{#each grip as [cx, cy] (`${cx},${cy}`)}<circle {cx} {cy} r="1.8" fill="currentColor" />{/each}
								</svg>
							</span>
						{/if}
					</div>
				</li>
			{/each}
		</ul>
	{:else}
		<div class="empty">
			<p><b>All done</b>Add something with the box below.</p>
		</div>
	{/if}

	{#if list.undoable}
		<div class="toast" role="status">
			<span>{list.undoable} removed</span>
			<button onclick={() => list.undo()}>Undo</button>
		</div>
	{/if}

	<form class="add" onsubmit={add}>
		<input
			class="field"
			aria-label="Add an item"
			placeholder="Add an item"
			bind:value={adding}
			maxlength={MOST_TEXT}
			enterkeyhint="enter"
			autocomplete="off"
		/>
		<!-- Keeps the keyboard up when Add is tapped, so the next item can go straight in. -->
		<button class="button primary" onpointerdown={(event) => event.preventDefault()}>Add</button>
	</form>
</div>

<style>
	.screen {
		height: 100dvh;
		display: flex;
		flex-direction: column;
	}

	.banner {
		margin: 8px 16px 0;
		padding: 12px 14px;
		border-radius: 14px;
		background: var(--warn-bg);
		color: var(--warn-fg);
		font-size: 15px;
		line-height: 1.4;
		display: flex;
		gap: 10px;
		align-items: flex-start;
	}

	.banner b {
		display: block;
	}

	.banner button {
		margin-left: auto;
		align-self: center;
		border: none;
		background: none;
		color: inherit;
		font-size: 15px;
		font-weight: 700;
		text-decoration: underline;
		white-space: nowrap;
		padding: 4px 0 4px 8px;
	}

	.waiting {
		flex: none;
		padding-right: 12px;
		font-size: 13px;
		font-weight: 600;
		color: var(--dim);
	}

	header {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 18px 20px 10px;
	}

	h1 {
		margin: 0;
		font-size: 30px;
	}

	.count {
		margin: 2px 0 0;
		font-size: 16px;
		font-weight: 600;
		color: var(--dim);
	}

	ul {
		list-style: none;
		margin: 0;
		padding: 0 8px 16px;
		flex: 1;
		overflow-y: auto;
	}

	li {
		position: relative;
		border-radius: 14px;
		overflow: hidden;
		/* A vertical drag stays the browser's, for scrolling; a sideways one is a swipe (swipe.ts). */
		touch-action: pan-y;
	}

	.slide {
		position: relative;
		display: flex;
		align-items: center;
		min-height: 60px;
		background: var(--bg);
		transition: background 0.4s;
	}

	li.fresh .slide {
		background: var(--soft);
	}

	/* Screen J: the red band behind an item being swiped, with Remove on the side it uncovers. */
	.band {
		position: absolute;
		inset: 0;
		display: none;
		align-items: center;
		padding: 0 22px;
		background: var(--danger);
		color: var(--card);
		font-size: 17px;
		font-weight: 700;
	}

	li:global([data-swiping]) .band {
		display: flex;
	}

	li:global([data-side='left']) .band {
		justify-content: flex-end;
	}

	/* The button is bigger than the box drawn in it, so it's easy to hit. */
	button.box {
		flex: none;
		width: 56px;
		height: 60px;
		padding: 0 0 0 12px;
		border: none;
		background: none;
		display: flex;
		align-items: center;
	}

	.mark {
		width: 30px;
		height: 30px;
		box-sizing: border-box;
		border-radius: 9px;
		border: 2.5px solid var(--box);
		display: grid;
		place-items: center;
		color: var(--on-ink);
		font-size: 18px;
		line-height: 1;
	}

	li.done .mark {
		background: var(--ink);
		border-color: var(--ink);
	}

	button.text {
		flex: 1;
		min-height: 60px;
		padding: 8px 12px 8px 2px;
		border: none;
		background: none;
		color: var(--ink);
		text-align: left;
		font-size: 19px;
		font-weight: 600;
		overflow-wrap: anywhere;
	}

	li.done button.text {
		text-decoration: line-through;
		color: var(--dim);
		font-weight: 400;
	}

	/* Screen L: the dividers with a Shop picked. */
	li.divider {
		margin: 10px 12px 4px;
		border-radius: 0;
		overflow: visible;
		font-size: 13px;
		font-weight: 700;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--dim);
		display: flex;
		align-items: center;
		gap: 10px;
	}

	li.divider::after {
		content: '';
		flex: 1;
		height: 1px;
		background: var(--line);
	}

	/* Only the handle drags; it takes the whole gesture, so the list doesn't scroll under the finger. */
	.handle {
		flex: none;
		width: 48px;
		height: 60px;
		display: grid;
		place-items: center;
		color: var(--box);
		touch-action: none;
		cursor: grab;
	}

	.handle svg {
		width: 22px;
		height: 22px;
	}

	/* Screen M: the item being dragged lifts above the rest. */
	li:global([data-dragging]) {
		z-index: 1;
		overflow: visible;
		box-shadow: 0 10px 28px rgb(0 0 0 / 0.28);
	}

	li:global([data-dragging]) .slide {
		background: var(--card);
		border-radius: 14px;
	}

	.empty {
		flex: 1;
		display: grid;
		place-items: center;
		padding: 32px;
		text-align: center;
	}

	.empty p {
		margin: 0;
		font-size: 18px;
		color: var(--dim);
	}

	.empty b {
		display: block;
		margin-bottom: 6px;
		font-size: 22px;
		color: var(--ink);
	}

	.toast {
		margin: 0 16px 12px;
		padding: 14px 16px;
		border-radius: 14px;
		background: var(--ink);
		color: var(--on-ink);
		font-size: 16px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
	}

	.toast button {
		border: none;
		background: none;
		color: inherit;
		font-size: 16px;
		font-weight: 700;
		text-decoration: underline;
		padding: 4px 0 4px 12px;
	}

	.add {
		flex: none;
		display: flex;
		gap: 10px;
		padding: 12px 16px calc(16px + env(safe-area-inset-bottom));
		border-top: 1px solid var(--line);
		background: var(--bg);
	}

	.add .field {
		flex: 1;
		min-width: 0;
	}

	.add .button {
		height: 54px;
	}
</style>
