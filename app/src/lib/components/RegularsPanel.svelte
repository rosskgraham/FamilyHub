<script lang="ts">
	import { onMount } from 'svelte';
	import { sendChange } from '#lib/quick-action.ts';
	import type { Regulars } from '#lib/shopping.ts';

	let {
		onclose
	}: {
		/** Called with how many were added, or 0 for Cancel. */
		onclose: (added: number) => void;
	} = $props();

	const LONG_PRESS_MS = 600;

	let regulars: Regulars | null = $state(null);
	let ticked: string[] = $state([]);
	let stopping: string | null = $state(null);
	let problem: string | null = $state(null);
	let sending = $state(false);

	onMount(async () => {
		try {
			const response = await fetch('/api/shopping/regulars');
			if (!response.ok) throw new Error(`${response.status}`);
			regulars = await response.json();
		} catch {
			regulars = { names: [], offline: true };
			problem = 'Couldn’t reach the Hub. Try again.';
		}
	});

	function toggle(name: string) {
		if (pressedLong) {
			pressedLong = false;
			return;
		}
		ticked = ticked.includes(name) ? ticked.filter((n) => n !== name) : [...ticked, name];
	}

	async function add() {
		const names = regulars?.names.filter((n) => ticked.includes(n)) ?? [];
		if (names.length === 0) return;
		sending = true;
		problem = await sendChange('/api/shopping/regulars', { action: 'add', names });
		sending = false;
		if (!problem) onclose(names.length);
	}

	async function stopSuggesting(name: string) {
		stopping = null;
		problem = await sendChange('/api/shopping/regulars', { action: 'dont_suggest', name });
		if (problem || !regulars) return;
		regulars = { ...regulars, names: regulars.names.filter((n) => n !== name) };
		ticked = ticked.filter((n) => n !== name);
	}

	// A long press offers to stop suggesting a regular instead of ticking it.
	let timer: ReturnType<typeof setTimeout> | undefined;
	let pressedLong = false;
	function pressStart(name: string) {
		clearTimeout(timer);
		pressedLong = false;
		timer = setTimeout(() => {
			pressedLong = true;
			stopping = name;
		}, LONG_PRESS_MS);
	}
	function pressEnd() {
		clearTimeout(timer);
	}
</script>

<div class="backdrop" role="presentation">
	<div class="panel" role="dialog" aria-modal="true" aria-labelledby="regulars-title">
		<div class="head">
			<h2 id="regulars-title">Regulars</h2>
			{#if regulars?.offline && regulars.names.length > 0}
				<span class="chip problem">Offline · the last ones fetched</span>
			{:else}
				<span class="hint">Tick what you need · long press to stop suggesting one</span>
			{/if}
		</div>

		{#if problem}<p class="message" role="alert">{problem}</p>{/if}

		{#if regulars === null}
			<div class="empty" aria-busy="true"></div>
		{:else if regulars.names.length === 0}
			<div class="empty">
				<p class="big">Nothing to suggest yet</p>
				<p>Regulars show here once things on the list have been bought and ticked off.</p>
			</div>
		{:else}
			<ul class="grid">
				{#each regulars.names as name (name)}
					{@const on = ticked.includes(name)}
					<li>
						<button
							class="tile"
							class:on
							aria-pressed={on}
							onclick={() => toggle(name)}
							onpointerdown={() => pressStart(name)}
							onpointerup={pressEnd}
							onpointerleave={pressEnd}
							onpointercancel={pressEnd}
							oncontextmenu={(e) => e.preventDefault()}
						>
							<span class="mark">
								{#if on}
									<svg
										width="26"
										height="26"
										viewBox="0 0 24 24"
										fill="none"
										style="stroke: var(--on-ink)"
										stroke-width="3"
										stroke-linecap="round"
										stroke-linejoin="round"
										aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg
									>
								{/if}
							</span>
							<span class="name">{name}</span>
						</button>
					</li>
				{/each}
			</ul>
		{/if}

		<div class="foot">
			<button class="quiet" onclick={() => onclose(0)}>Cancel</button>
			<button class="primary" disabled={ticked.length === 0 || sending} onclick={add}>
				{ticked.length > 0 ? `Add ${ticked.length} to Shopping` : 'Add to Shopping'}
			</button>
		</div>

		{#if stopping}
			<div class="confirm" role="alertdialog" aria-labelledby="stop-title" aria-describedby="stop-why">
				<div class="ask">
					<p id="stop-title" class="big">Stop suggesting {stopping}?</p>
					<p id="stop-why">It comes back if anyone adds it to the list again.</p>
					<div class="buttons">
						<button class="quiet" onclick={() => (stopping = null)}>Keep</button>
						<button class="danger" onclick={() => stopSuggesting(stopping!)}>Stop suggesting</button>
					</div>
				</div>
			</div>
		{/if}
	</div>
</div>

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		z-index: 5;
		background: rgb(0 0 0 / 0.45);
	}
	.panel {
		position: absolute;
		inset: 32px;
		box-sizing: border-box;
		padding: 36px;
		border-radius: 28px;
		background: var(--card);
		color: var(--ink);
		display: flex;
		flex-direction: column;
		gap: 22px;
		box-shadow: 0 24px 64px rgb(0 0 0 / 0.3);
	}
	.head {
		flex: none;
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 24px;
	}
	h2 {
		margin: 0;
		font-size: 48px;
		font-weight: 700;
		line-height: 1.1;
	}
	.hint {
		font-size: 24px;
		color: var(--dim);
	}
	.chip {
		padding: 6px 16px;
		border-radius: 20px;
		font-size: 22px;
		font-weight: 600;
	}
	.chip.problem,
	.message {
		background: var(--warn-bg);
		color: var(--warn-fg);
	}
	.message {
		flex: none;
		margin: 0;
		padding: 10px 16px;
		border-radius: 14px;
		font-size: 22px;
		font-weight: 600;
	}

	.grid {
		flex: 1;
		min-height: 0;
		margin: 0;
		padding: 0;
		list-style: none;
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		grid-template-rows: repeat(6, minmax(0, 1fr));
		gap: 12px;
	}
	li {
		min-width: 0;
		display: flex;
	}
	.tile {
		flex: 1;
		min-width: 0;
		box-sizing: border-box;
		padding: 0 20px;
		border-radius: 18px;
		border: 3px solid transparent;
		background: var(--soft);
		display: flex;
		align-items: center;
		gap: 18px;
		text-align: left;
		user-select: none;
		-webkit-user-select: none;
		touch-action: manipulation;
	}
	.tile.on {
		border-color: var(--ink);
		background: var(--card);
	}
	.mark {
		width: 40px;
		height: 40px;
		flex: none;
		box-sizing: border-box;
		border-radius: 10px;
		border: 3px solid var(--box);
		background: var(--card);
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.on .mark {
		border-color: var(--ink);
		background: var(--ink);
	}
	.name {
		flex: 1;
		min-width: 0;
		font-size: 28px;
		font-weight: 600;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.empty {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 8px;
		color: var(--dim);
		font-size: 28px;
		text-align: center;
	}
	.empty p,
	.ask p {
		margin: 0;
	}
	.big {
		font-size: 40px;
		font-weight: 700;
		color: var(--ink);
	}

	.foot {
		flex: none;
		display: flex;
		justify-content: flex-end;
		gap: 14px;
	}
	.primary,
	.quiet,
	.danger {
		height: 72px;
		padding: 0 36px;
		border-radius: 36px;
		font-size: 26px;
		font-weight: 700;
	}
	.primary {
		padding: 0 44px;
		border: 0;
		background: var(--ink);
		color: var(--on-ink);
	}
	.primary:disabled {
		opacity: 0.4;
	}
	.quiet {
		border: 0;
		background: var(--soft);
		color: var(--ink);
	}
	.danger {
		border: 0;
		background: var(--danger);
		color: var(--on-danger);
	}

	.confirm {
		position: absolute;
		inset: 0;
		border-radius: 28px;
		background: rgb(0 0 0 / 0.35);
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.ask {
		width: 900px;
		box-sizing: border-box;
		padding: 40px 48px;
		border: 4px solid var(--ink);
		border-radius: 36px;
		background: var(--card);
		display: flex;
		flex-direction: column;
		gap: 16px;
		font-size: 28px;
		color: var(--dim);
	}
	.buttons {
		margin-top: 16px;
		display: flex;
		justify-content: flex-end;
		gap: 14px;
	}
</style>
