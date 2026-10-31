<script lang="ts">
	import { clock } from '#lib/clock.svelte.ts';
	import {
		cheapNow,
		formatKw,
		formatPounds,
		totals,
		type HalfHourUse,
		type Live,
		type Rates,
		type Slot
	} from '#lib/energy.ts';
	import { formatTime } from '#lib/time.ts';

	let {
		rates,
		slots,
		live,
		today
	}: { rates: Rates | null; slots: Slot[]; live: Live | null; today: HalfHourUse[] } = $props();

	const cheap = $derived(cheapNow(clock.now, slots));
	// The Off-peak window never moves, so it's only worth a line when a Smart-charging slot is on or next.
	const slot = $derived(cheap.current ? (cheap.current.slot ? cheap.current : null) : cheap.next.slot ? cheap.next : null);
	const spent = $derived(rates && totals(today, rates, slots));
	const plugged = $derived(live !== null && live.car !== 'unplugged');
	const carLabel = $derived(!live ? 'Car charger not reporting' : plugged ? 'Car plugged in' : 'Car not plugged in');
	const time = (iso: string) => formatTime(new Date(iso));
</script>

<!-- The Today view's glance at Energy: what the house is using, what today has cost, whether the car's plugged in,
and a Smart-charging slot when there is one. Opens the Energy Section. -->
<a class="card" href="/energy">
	<div class="head">
		<span class="title">Energy</span>
		{#if live}
			<!-- A plug: blue when the car's plugged in, struck through when it isn't. -->
			<svg class="plug" class:plugged width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label={carLabel}>
				<title>{carLabel}</title>
				<path d="M12 22v-5" /><path d="M9 8V2" /><path d="M15 8V2" /><path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z" />
				{#if !plugged}<line x1="3" y1="3" x2="21" y2="21" />{/if}
			</svg>
		{/if}
		<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6" /></svg>
	</div>
	<div class="figures">
		<span class="figure">
			<span class="big tabular">{live ? formatKw(live.watts) : '—'}</span>
			<span class="dim">now</span>
		</span>
		<span class="figure">
			<span class="big tabular">{spent ? formatPounds(spent.houseCost + spent.carCost) : '—'}</span>
			<span class="dim">{spent ? 'today' : 'prices not known'}</span>
		</span>
	</div>
	{#if slot}
		<div class="cheap">
			<span>Smart-charging slot</span>
			<span class="tabular">{slot === cheap.current ? `now until ${time(slot.to)}` : `${time(slot.from)}–${time(slot.to)}`}</span>
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
		padding: 22px 28px;
		border-radius: 28px;
		background: var(--card);
	}
	.head {
		display: flex;
		align-items: center;
		gap: 6px;
		color: var(--dim);
	}
	.title {
		flex: 1;
		font-size: 36px;
		font-weight: 700;
		color: var(--ink);
	}
	.plug {
		margin-right: 6px;
	}
	.plug.plugged {
		color: var(--car);
	}
	.figures {
		display: flex;
		justify-content: space-between;
		gap: 16px;
	}
	.figure {
		display: flex;
		align-items: baseline;
		gap: 10px;
		white-space: nowrap;
	}
	.big {
		font-size: 56px;
		font-weight: 600;
		line-height: 1;
	}
	.dim {
		font-size: 24px;
		font-weight: 600;
		color: var(--dim);
	}
	.cheap {
		height: 64px;
		box-sizing: border-box;
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0 18px;
		border-radius: 18px;
		background: var(--off-peak-bg);
		color: var(--cheap-fg);
		font-size: 24px;
		font-weight: 700;
	}
	.cheap .tabular {
		font-size: 28px;
	}
</style>
