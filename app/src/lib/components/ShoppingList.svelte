<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import type { ShoppingChange, ShoppingItem, ShoppingStatus } from '#lib/shopping.ts';

	let {
		items,
		status,
		rows,
		columns = 1,
		moreHref
	}: {
		items: ShoppingItem[];
		status: ShoppingStatus;
		/** Rows per column. */
		rows: number;
		columns?: number;
		/** Where "+N more" goes when the list doesn't fit. Without it, the list scrolls sideways. */
		moreHref?: string;
	} = $props();

	const ROW = 64;
	const ROW_GAP = 8;
	const LONG_PRESS_MS = 600;

	// Changes show straight away and are undone if Google turns them down.
	let ticked: Record<string, boolean> = $state({});
	let removed: Record<string, boolean> = $state({});
	let added: { id: string; text: string }[] = $state([]);
	let problem: string | null = $state(null);
	let removing: string | null = $state(null);
	let adding = $state(false);
	let draft = $state('');

	const shown = $derived([
		...added.map((a) => ({ id: a.id, text: a.text, tickedOff: false, pending: true })),
		...items
			.filter((i) => !removed[i.id])
			.map((i) => ({ ...i, tickedOff: ticked[i.id] ?? i.tickedOff, pending: false }))
	]);
	const ordered = $derived([...shown.filter((i) => !i.tickedOff), ...shown.filter((i) => i.tickedOff)]);
	const toGet = $derived(shown.filter((i) => !i.tickedOff).length);
	const capacity = $derived(rows * columns);
	const visible = $derived(
		moreHref && ordered.length > capacity ? ordered.slice(0, capacity - 1) : ordered
	);
	const more = $derived(ordered.length - visible.length);

	async function send(change: ShoppingChange): Promise<boolean> {
		problem = null;
		try {
			const response = await fetch('/api/shopping', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(change)
			});
			if (!response.ok) {
				problem =
					response.status === 401
						? 'Google needs signing in again, ask Alex.'
						: 'Couldn’t reach Google. Try again.';
				return false;
			}
			await invalidateAll();
			return true;
		} catch {
			problem = 'Couldn’t reach the Hub. Try again.';
			return false;
		}
	}

	async function toggle(item: { id: string; tickedOff: boolean; pending: boolean }) {
		if (pressedLong) {
			pressedLong = false;
			return;
		}
		if (item.pending) return;
		ticked[item.id] = !item.tickedOff;
		await send({ action: 'tick', id: item.id, tickedOff: !item.tickedOff });
		delete ticked[item.id];
	}

	async function remove(id: string) {
		removing = null;
		removed[id] = true;
		await send({ action: 'remove', id });
		delete removed[id];
	}

	async function add(event: SubmitEvent) {
		event.preventDefault();
		const text = draft.trim();
		if (!text) return;
		const id = `pending-${Date.now()}`;
		added.push({ id, text });
		draft = '';
		adding = false;
		if (!(await send({ action: 'add', text }))) draft = text;
		added = added.filter((a) => a.id !== id);
	}

	// A long press offers to remove an item instead of ticking it off.
	let timer: ReturnType<typeof setTimeout> | undefined;
	let pressedLong = false;
	function pressStart(id: string) {
		clearTimeout(timer);
		pressedLong = false;
		timer = setTimeout(() => {
			pressedLong = true;
			removing = id;
		}, LONG_PRESS_MS);
	}
	function pressEnd() {
		clearTimeout(timer);
	}

	function focus(node: HTMLInputElement) {
		node.focus();
	}
</script>

<section class="shopping">
	<div class="head">
		<h2>Shopping</h2>
		{#if status.kind === 'stale' && status.reason === 'sign-in'}
			<a class="chip problem" href="/setup">Sign in needed</a>
		{:else if status.kind === 'stale'}
			<span class="chip problem">Offline</span>
		{:else}
			<span class="chip">{toGet} to get</span>
		{/if}
	</div>

	{#if problem}<p class="message" role="alert">{problem}</p>{/if}

	<ul
		style:grid-template-rows="repeat({rows}, {ROW}px)"
		style:row-gap="{ROW_GAP}px"
		style:grid-auto-columns={columns > 1 ? `calc((100% - ${(columns - 1) * 24}px) / ${columns})` : '100%'}
	>
		{#each visible as item (item.id)}
			<li>
				{#if removing === item.id}
					<span class="text">{item.text}</span>
					<button class="danger" onclick={() => remove(item.id)}>Remove</button>
					<button class="quiet" onclick={() => (removing = null)}>Keep</button>
				{:else}
					<button
						class="tick"
						class:ticked={item.tickedOff}
						class:pending={item.pending}
						aria-pressed={item.tickedOff}
						aria-label="{item.tickedOff ? 'Untick' : 'Tick off'} {item.text}"
						onclick={() => toggle(item)}
						onpointerdown={() => pressStart(item.id)}
						onpointerup={pressEnd}
						onpointerleave={pressEnd}
						onpointercancel={pressEnd}
						oncontextmenu={(e) => e.preventDefault()}
					>
						<span class="mark">
							{#if item.tickedOff}
								<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"
									><polyline points="20 6 9 17 4 12" /></svg
								>
							{/if}
						</span>
						<span class="text">{item.text}</span>
					</button>
				{/if}
			</li>
		{/each}
		{#if more > 0}
			<li><a class="more" href={moreHref}>+{more} more</a></li>
		{/if}
	</ul>

	{#if adding}
		<form class="add" onsubmit={add}>
			<input bind:value={draft} placeholder="What do we need?" maxlength="200" aria-label="New item" use:focus />
			<button class="primary" type="submit" disabled={!draft.trim()}>Add</button>
			<button class="quiet" type="button" onclick={() => ((adding = false), (draft = ''))}>Cancel</button>
		</form>
	{:else}
		<button class="add-button" onclick={() => (adding = true)}>
			<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"
				><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg
			>
			Add item
		</button>
	{/if}
</section>

<style>
	.shopping {
		flex: 1;
		min-width: 0;
		box-sizing: border-box;
		display: flex;
		flex-direction: column;
		gap: 16px;
		padding: 28px;
		border-radius: 28px;
		background: var(--card);
	}
	.head {
		height: 44px;
		flex: none;
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	h2 {
		margin: 0;
		font-size: 36px;
		font-weight: 700;
	}
	.chip {
		padding: 6px 16px;
		border-radius: 20px;
		background: var(--soft);
		font-size: 22px;
		font-weight: 600;
	}
	.chip.problem,
	.message {
		background: #ffddb8;
		color: #6b2e00;
	}
	.message {
		flex: none;
		margin: 0;
		padding: 10px 16px;
		border-radius: 14px;
		font-size: 22px;
		font-weight: 600;
	}

	ul {
		flex: 1;
		min-height: 0;
		margin: 0;
		padding: 0;
		list-style: none;
		display: grid;
		grid-auto-flow: column;
		column-gap: 24px;
		align-content: start;
		overflow-x: auto;
	}
	li {
		min-width: 0;
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.tick {
		flex: 1;
		min-width: 0;
		height: 64px;
		padding: 0;
		border: 0;
		background: none;
		display: flex;
		align-items: center;
		gap: 16px;
		text-align: left;
		user-select: none;
		-webkit-user-select: none;
		touch-action: manipulation;
	}
	/* A 64px touch target around a 44px box. */
	.mark {
		width: 44px;
		height: 44px;
		margin: 0 10px;
		flex: none;
		box-sizing: border-box;
		border-radius: 12px;
		border: 3px solid #5b6676;
		background: var(--card);
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.ticked .mark {
		background: var(--ink);
	}
	.text {
		flex: 1;
		min-width: 0;
		font-size: 30px;
		font-weight: 600;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.ticked .text {
		color: var(--dim);
		text-decoration: line-through;
	}
	.pending {
		opacity: 0.6;
	}
	.more {
		height: 56px;
		flex: 1;
		border-radius: 16px;
		background: var(--soft);
		font-size: 24px;
		font-weight: 700;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.add,
	.add-button {
		height: 72px;
		flex: none;
	}
	.add {
		display: flex;
		gap: 12px;
	}
	input {
		flex: 1;
		min-width: 0;
		box-sizing: border-box;
		padding: 0 20px;
		border-radius: 22px;
		border: 2px solid var(--line);
		font: inherit;
		font-size: 26px;
	}
	.add-button {
		box-sizing: border-box;
		border-radius: 22px;
		border: 2px solid var(--line);
		background: var(--card);
		font-size: 26px;
		font-weight: 700;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 12px;
	}
	.primary,
	.quiet,
	.danger {
		flex: none;
		height: 64px;
		padding: 0 24px;
		border-radius: 20px;
		font-size: 24px;
		font-weight: 700;
	}
	.add .primary,
	.add .quiet {
		height: 72px;
	}
	.primary {
		border: 0;
		background: var(--ink);
		color: #ffffff;
	}
	.primary:disabled {
		opacity: 0.4;
	}
	.quiet {
		border: 2px solid var(--line);
		background: var(--card);
	}
	.danger {
		border: 0;
		background: #b42318;
		color: #ffffff;
	}
</style>
