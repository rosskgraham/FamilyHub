<script lang="ts">
	import { clock } from '#lib/clock.svelte.ts';
	import { cheapestWindow, CHEAP_WINDOW_HALF_HOURS, formatLength, formatPence, formatStart, rateAt, type Rate } from '#lib/energy.ts';
	import { formatTime } from '#lib/time.ts';

	let { rates }: { rates: Rate[] } = $props();

	const current = $derived(rateAt(rates, clock.now));
	const cheapest = $derived(cheapestWindow(rates, clock.now, CHEAP_WINDOW_HALF_HOURS));
</script>

<!-- The Today view's glance at Energy: the price now and the next Cheap window. Opens the Energy section. -->
<a class="card" href="/energy">
	<div class="head">
		<span class="title">Energy</span>
		{#if current}
			<span class="now" title="Until {formatTime(new Date(current.to))}">
				<span class="price tabular">{formatPence(current.pence)}</span>
				<span class="dim">now</span>
			</span>
		{/if}
		<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6" /></svg>
	</div>
	{#if cheapest}
		<div class="window">
			<span>Cheapest {formatLength(CHEAP_WINDOW_HALF_HOURS)}</span>
			<span class="tabular">{formatStart(cheapest, clock.now)} · {formatPence(cheapest.pence)}</span>
		</div>
	{/if}
</a>

<style>
	.card {
		flex: none;
		box-sizing: border-box;
		display: flex;
		flex-direction: column;
		gap: 12px;
		padding: 20px 28px;
		border-radius: 28px;
		background: var(--card);
	}
	.head {
		height: 52px;
		display: flex;
		align-items: center;
		gap: 12px;
		color: var(--dim);
	}
	.title {
		flex: 1;
		font-size: 36px;
		font-weight: 700;
		color: var(--ink);
	}
	.now {
		display: flex;
		align-items: baseline;
		gap: 10px;
	}
	.price {
		font-size: 48px;
		font-weight: 600;
		line-height: 1;
		color: var(--ink);
	}
	.dim {
		font-size: 24px;
		font-weight: 600;
	}
	.window {
		height: 60px;
		box-sizing: border-box;
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0 18px;
		border-radius: 18px;
		background: var(--window-bg);
		color: var(--window-fg);
		font-size: 24px;
		font-weight: 700;
	}
	.window .tabular {
		font-size: 28px;
	}
</style>
