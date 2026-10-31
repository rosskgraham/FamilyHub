<script lang="ts">
	import { clock } from '#lib/clock.svelte.ts';
	import RateChart from '#lib/components/RateChart.svelte';
	import {
		appliances,
		cheapestWindow,
		CHEAP_WINDOW_HALF_HOURS,
		formatLength,
		formatPence,
		formatStart,
		formatWindow,
		rateAt,
		TOMORROW_FROM
	} from '#lib/energy.ts';
	import { addDays, dayKey, formatTime } from '#lib/time.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const rates = $derived(data.energy.rates);
	const status = $derived(data.energy.status);
	const current = $derived(rateAt(rates, clock.now));
	const cheapest = $derived(cheapestWindow(rates, clock.now, CHEAP_WINDOW_HALF_HOURS));
	const hasTomorrow = $derived(rates.some((r) => dayKey(new Date(r.from)) === addDays(dayKey(clock.now), 1)));
	const best = $derived(
		appliances.map((appliance) => ({ appliance, window: cheapestWindow(rates, clock.now, appliance.halfHours) }))
	);
</script>

<!-- The Energy section: what electricity costs now and later, and when to run the Hungry appliances. -->
<div class="energy">
	<div class="tiles">
		<section class="tile now">
			{#if current}
				<div class="eyebrow">Price now · until {formatTime(new Date(current.to))}</div>
				<div class="value"><span class="big tabular">{formatPence(current.pence)}</span><span class="unit">per kWh</span></div>
			{:else}
				<div class="eyebrow">Price now</div>
				<div class="value"><span class="none">Not known</span></div>
			{/if}
		</section>
		<section class="tile window">
			<div class="eyebrow">Cheapest {formatLength(CHEAP_WINDOW_HALF_HOURS)}</div>
			{#if cheapest}
				<div class="when tabular">{formatWindow(cheapest, clock.now)}</div>
				<div class="average">{formatPence(cheapest.pence)} average</div>
			{:else}
				<div class="when">Not published yet</div>
			{/if}
		</section>
	</div>

	<section class="card prices">
		<div class="head">
			<h2>{hasTomorrow ? 'Today and tomorrow' : 'Today’s prices'}</h2>
			{#if status.kind === 'stale'}
				<span class="note problem">
					Octopus unreachable · {status.updatedAt ? `last updated ${formatTime(new Date(status.updatedAt))}` : 'no prices yet'}
				</span>
			{:else if status.kind === 'sample'}
				<span class="note">Sample prices</span>
			{:else if !hasTomorrow && formatTime(clock.now) < TOMORROW_FROM}
				<span class="note">Tomorrow’s arrive about {TOMORROW_FROM}</span>
			{/if}
		</div>
		<RateChart {rates} now={clock.now} window={cheapest} />
		<div class="legend">
			<span><i style:background="var(--cheap)"></i>Cheap: the day’s cheapest quarter</span>
			<span><i style:background="var(--normal)"></i>Normal</span>
			<span><i style:background="var(--peak)"></i>Peak: its dearest quarter</span>
			<span><i class="ring"></i>Now</span>
			<span><i style:background="var(--window-bg)"></i>Cheapest {formatLength(CHEAP_WINDOW_HALF_HOURS)}</span>
		</div>
	</section>
</div>

<aside>
	<section class="card best">
		<h2>Best time to run</h2>
		{#each best as { appliance, window } (appliance.name)}
			<div class="appliance">
				<div class="what">
					<div class="name">{appliance.name}</div>
					<div class="sub">{formatLength(appliance.halfHours)}</div>
				</div>
				{#if window}
					<div class="start">
						<div class="time tabular">{formatStart(window, clock.now)}</div>
						<div class="sub tabular">{formatPence(window.pence)} average</div>
					</div>
				{:else}
					<div class="start"><div class="sub">Not published yet</div></div>
				{/if}
			</div>
		{/each}
	</section>
</aside>

<style>
	.energy {
		flex: 1 1 0;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	h2 {
		margin: 0;
		font-size: 36px;
		font-weight: 700;
	}
	.card {
		box-sizing: border-box;
		border-radius: 28px;
		background: var(--card);
		padding: 24px 28px;
	}

	.tiles {
		height: 168px;
		flex: none;
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 16px;
	}
	.tile {
		box-sizing: border-box;
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 6px;
		padding: 0 28px;
		border-radius: 28px;
	}
	.tile.now {
		background: var(--hero);
		color: var(--on-hero);
	}
	.tile.window {
		background: var(--window-bg);
		color: var(--window-fg);
	}
	.eyebrow {
		font-size: 22px;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}
	.now .eyebrow {
		color: var(--hero-dim);
	}
	.value {
		display: flex;
		align-items: baseline;
		gap: 14px;
	}
	.big {
		font-size: 80px;
		font-weight: 600;
		line-height: 1;
	}
	.unit {
		font-size: 26px;
		font-weight: 600;
		color: var(--hero-dim);
	}
	.none {
		font-size: 48px;
		font-weight: 600;
	}
	.when {
		font-size: 56px;
		font-weight: 700;
		line-height: 1.1;
	}
	.average {
		font-size: 26px;
		font-weight: 600;
	}

	.prices {
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	.head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
	}
	.note {
		font-size: 24px;
		font-weight: 600;
		color: var(--dim);
	}
	.note.problem {
		padding: 4px 16px;
		border-radius: 20px;
		background: var(--warn-bg);
		color: var(--warn-fg);
	}
	.legend {
		flex: none;
		display: flex;
		align-items: center;
		gap: 32px;
		font-size: 22px;
		font-weight: 600;
		color: var(--dim);
	}
	.legend span {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.legend i {
		width: 22px;
		height: 22px;
		box-sizing: border-box;
		border-radius: 5px;
	}
	.legend .ring {
		border: 3px solid var(--ink);
	}

	aside {
		width: 560px;
		flex: none;
		margin-left: 24px;
		display: flex;
		flex-direction: column;
	}
	.best {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.best h2 {
		margin-bottom: 6px;
	}
	.appliance {
		height: 84px;
		display: flex;
		align-items: center;
		gap: 16px;
		border-top: 2px solid var(--soft);
	}
	.what {
		flex: 1;
		min-width: 0;
	}
	.name {
		font-size: 30px;
		font-weight: 600;
	}
	.sub {
		font-size: 22px;
		font-weight: 600;
		color: var(--dim);
	}
	.start {
		text-align: right;
	}
	.time {
		font-size: 34px;
		font-weight: 700;
	}
</style>
