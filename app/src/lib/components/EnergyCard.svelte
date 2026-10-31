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
		today,
		needsAlex
	}: {
		rates: Rates | null;
		slots: Slot[];
		live: Live | null;
		today: HalfHourUse[];
		/** When each sync started failing, once it's been an hour. */
		needsAlex: { octopus: string | null; zappi: string | null };
	} = $props();

	const cheap = $derived(cheapNow(clock.now, slots));
	// The Off-peak window never moves, so it's only worth a line when a Smart-charging slot is on or next.
	const slot = $derived(cheap.current ? (cheap.current.slot ? cheap.current : null) : cheap.next.slot ? cheap.next : null);
	const spent = $derived(rates && totals(today, rates, slots));
	const plugged = $derived(live !== null && live.car !== 'unplugged');
	const charging = $derived(live?.car === 'charging');
	const carLabel = $derived(
		!live ? 'Car charger not reporting' : charging ? 'Car charging' : plugged ? 'Car plugged in' : 'Car not plugged in'
	);
	const time = (iso: string) => formatTime(new Date(iso));
	// A sync failing for an hour says so here, where everyone looks, instead of the slot.
	const problem = $derived.by(() => {
		const { octopus, zappi } = needsAlex;
		if (octopus && zappi) return `Energy not updating since ${time(octopus < zappi ? octopus : zappi)}`;
		if (octopus) return `Prices not updating since ${time(octopus)}`;
		if (zappi) return `Car charger quiet since ${time(zappi)}`;
		return null;
	});
</script>

<!-- The Today view's glance at Energy: what the house is using, what today has cost, whether the car's plugged in,
and a Smart-charging slot when there is one. Opens the Energy Section. -->
<a class="card" href="/energy">
	<div class="head">
		<span class="title">Energy</span>
		{#if live}
			<!-- The car: grey when it's unplugged, amber when it's plugged in, with a pulsing bolt while it charges. -->
			<span class="car" class:plugged role="img" aria-label={carLabel} title={carLabel}>
				{#if charging}
					<svg class="bolt" width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
						<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z" />
					</svg>
				{/if}
				<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
					<path d="m21 8-2 2-1.5-3.7A2 2 0 0 0 15.646 5H8.4a2 2 0 0 0-1.903 1.257L5 10 3 8" /><path d="M7 14h.01" /><path d="M17 14h.01" /><rect width="18" height="8" x="3" y="10" rx="2" /><path d="M5 18v2" /><path d="M19 18v2" />
				</svg>
			</span>
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
	{#if problem}
		<div class="problem">{problem} · ask Alex</div>
	{:else if slot}
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
	.car {
		display: flex;
		align-items: center;
		gap: 2px;
		margin-right: 6px;
	}
	.car.plugged {
		color: var(--plugged);
	}
	.bolt {
		animation: flow 1.6s ease-in-out infinite;
	}
	@keyframes flow {
		50% {
			opacity: 0.35;
			transform: translateY(2px);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.bolt {
			animation: none;
		}
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
	.problem {
		height: 64px;
		box-sizing: border-box;
		display: flex;
		align-items: center;
		padding: 0 18px;
		border-radius: 18px;
		background: var(--warn-bg);
		color: var(--warn-fg);
		font-size: 24px;
		font-weight: 700;
	}
	.cheap .tabular {
		font-size: 28px;
	}
</style>
