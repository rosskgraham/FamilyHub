<script lang="ts">
	import { clock } from '#lib/clock.svelte.ts';
	import UsageChart from '#lib/components/UsageChart.svelte';
	import {
		appliances,
		bandAt,
		bestStart,
		carText,
		cheapNow,
		formatKw,
		formatKwh,
		formatLength,
		formatPence,
		formatPounds,
		formatStarts,
		totals
	} from '#lib/energy.ts';
	import { dayKey, formatTime } from '#lib/time.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const energy = $derived(data.energy);
	const rates = $derived(energy.tariff?.rates ?? null);
	const status = $derived(energy.status);
	const band = $derived(bandAt(clock.now, energy.slots));
	const cheap = $derived(cheapNow(clock.now, energy.slots));
	const best = $derived(
		appliances.map((appliance) => ({ appliance, best: bestStart(clock.now, appliance.halfHours, energy.slots) }))
	);
	const today = $derived(rates && totals(energy.today, rates, energy.slots));
	const yesterday = $derived(rates && totals(energy.yesterday, rates, energy.slots));
	const yesterdayKwh = $derived(yesterday ? yesterday.house + yesterday.car : 0);

	const bandName = { 'off-peak': 'Off-peak', slot: 'Smart-charging slot', peak: 'Peak' };
	const time = (iso: string) => formatTime(new Date(iso));

	// Says when the Section isn't showing the real thing, or isn't up to date.
	const note = $derived.by(() => {
		if (status.kind === 'unsupported') return { text: `Not Intelligent Octopus Go: ${status.tariff}`, problem: true };
		if (status.kind === 'stale') {
			const when = status.updatedAt ? `last updated ${time(status.updatedAt)}` : 'no prices yet';
			return { text: `Octopus unreachable · ${when}`, problem: true };
		}
		const usage = energy.usageStatus;
		if (usage.kind === 'stale') {
			const since = usage.updatedAt ? ` since ${time(usage.updatedAt)}` : '';
			return { text: `Car charger not reporting${since}`, problem: true };
		}
		if (status.kind === 'sample' && usage.kind === 'sample') return { text: 'Sample data', problem: false };
		if (status.kind === 'sample') return { text: 'Sample prices', problem: false };
		return usage.kind === 'sample' ? { text: 'Sample usage', problem: false } : null;
	});
</script>

<!-- The Energy Section: whether it's cheap now, when it next is, what the house is using, and what today has cost. -->
<div class="energy">
	<div class="tiles">
		<section class="tile now">
			<div class="eyebrow">Price now{rates ? ` · ${bandName[band]}` : ''}</div>
			{#if rates}
				<div class="value">
					<span class="big tabular">{formatPence(band === 'peak' ? rates.peak : rates.offPeak)}</span>
					<span class="unit">per kWh</span>
				</div>
			{:else}
				<div class="none">Not known</div>
			{/if}
		</section>

		<section class="tile using">
			<div class="eyebrow">Using now</div>
			{#if energy.live}
				<div class="big tabular">{formatKw(energy.live.watts)}</div>
				<div class="sub">{carText[energy.live.car]}</div>
			{:else}
				<div class="none">Not reporting</div>
				{#if energy.usageStatus.kind === 'stale' && energy.usageStatus.updatedAt}
					<div class="sub">Car charger quiet since {time(energy.usageStatus.updatedAt)}</div>
				{/if}
			{/if}
		</section>

		<section class="tile cheap">
			{#if !rates}
				<div class="eyebrow">Next cheap</div>
				<div class="none">Not known</div>
			{:else if cheap.current}
				<div class="eyebrow">Cheap now · <span class="pence">{formatPence(rates.offPeak)}</span></div>
				<div class="when tabular">Until {time(cheap.current.to)}</div>
				<div class="sub">
					{cheap.current.slot ? `Smart-charging slot, then ${time(cheap.next.from)}` : 'Off-peak window'}
				</div>
			{:else}
				<div class="eyebrow">Next cheap · <span class="pence">{formatPence(rates.offPeak)}</span></div>
				<div class="when tabular">{time(cheap.next.from)}–{time(cheap.next.to)}</div>
				<div class="sub">
					{cheap.next.slot ? `Smart-charging slot, then ${time(cheap.then.from)}` : 'Off-peak window'}
				</div>
			{/if}
		</section>
	</div>

	<section class="card day">
		<div class="head">
			<h2>Today</h2>
			{#if note}<span class="note" class:problem={note.problem}>{note.text}</span>{/if}
			{#if today}
				<span class="so-far"><span class="dim">So far</span><span class="cost tabular">{formatPounds(today.houseCost + today.carCost)}</span></span>
			{/if}
		</div>
		<UsageChart day={dayKey(clock.now)} use={energy.today} slots={energy.slots} priced={rates !== null} />
		<div class="legend">
			<span><i class="house"></i>House</span>
			<span><i class="car"></i>Car</span>
			{#if rates}
				<span><i class="off-peak"></i>Off-peak, {formatPence(rates.offPeak)}</span>
				<span><i class="peak"></i>Peak, {formatPence(rates.peak)}</span>
				<span><i class="slot"></i>Smart-charging slot</span>
			{/if}
		</div>
	</section>
</div>

<aside>
	<section class="card best">
		<h2>Best time to run</h2>
		{#each best as { appliance, best: start } (appliance.name)}
			<div class="appliance">
				<div class="what">
					<div class="name">{appliance.name}</div>
					<div class="sub dim">{formatLength(appliance.halfHours)}</div>
				</div>
				<div class="start">
					{#if rates}
						<div class="time tabular">{formatStarts(start, clock.now)}</div>
						<div class="sub dim">
							{start.slot ? 'smart-charging slot' : start.earliest === start.latest ? 'start then, off-peak' : 'start between, off-peak'}
						</div>
					{:else}
						<div class="sub dim">Not known</div>
					{/if}
				</div>
			</div>
		{/each}
	</section>

	<section class="card yesterday">
		<div class="head">
			<h2>Yesterday</h2>
			{#if yesterday}<span class="cost tabular">{formatPounds(yesterday.houseCost + yesterday.carCost)}</span>{/if}
		</div>
		{#if yesterday && yesterdayKwh > 0}
			<div class="split">
				<div class="house" style:width="{(yesterday.house / yesterdayKwh) * 100}%"></div>
				<div class="car" style:width="{(yesterday.car / yesterdayKwh) * 100}%"></div>
			</div>
			<div class="row">
				<i class="house"></i>
				<span class="who">House</span>
				<span class="kwh dim tabular">{formatKwh(yesterday.house)}</span>
				<span class="pounds tabular">{formatPounds(yesterday.houseCost)}</span>
			</div>
			<div class="row">
				<i class="car"></i>
				<span class="who">Car</span>
				<span class="kwh dim tabular">{formatKwh(yesterday.car)}</span>
				<span class="pounds tabular">{formatPounds(yesterday.carCost)}</span>
			</div>
			<div class="sub dim">
				House {Math.round(yesterday.houseOffPeak * 100)}% off-peak. Usage only, without the standing charge.
			</div>
		{:else}
			<div class="sub dim">Nothing to show yet.</div>
		{/if}
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
	.dim {
		color: var(--dim);
	}
	.sub {
		font-size: 22px;
		font-weight: 600;
	}

	.tiles {
		height: 168px;
		flex: none;
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
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
		background: var(--card);
	}
	.tile.now {
		background: var(--hero);
		color: var(--on-hero);
	}
	.tile.cheap {
		background: var(--off-peak-bg);
		color: var(--cheap-fg);
	}
	.tile .sub {
		font-size: 24px;
	}
	.using .sub {
		color: var(--dim);
	}
	.eyebrow {
		font-size: 22px;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}
	/* "7.5p", not "7.5P". */
	.pence {
		text-transform: none;
	}
	.now .eyebrow {
		color: var(--hero-dim);
	}
	.using .eyebrow {
		color: var(--dim);
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

	.day {
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	.head {
		display: flex;
		align-items: baseline;
		gap: 20px;
	}
	.head h2 {
		flex: 1;
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
	.so-far {
		display: flex;
		align-items: baseline;
		gap: 12px;
		font-size: 24px;
		font-weight: 600;
	}
	.cost {
		font-size: 36px;
		font-weight: 700;
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
	i {
		width: 22px;
		height: 22px;
		flex: none;
		box-sizing: border-box;
		border-radius: 5px;
	}
	i.house {
		background: var(--house);
	}
	i.car {
		background: var(--car);
	}
	i.off-peak {
		background: var(--off-peak-bg);
		border-top: 6px solid var(--cheap);
	}
	i.peak {
		background: var(--card);
		border: 2px solid var(--line);
		border-top: 6px solid var(--peak);
	}
	i.slot {
		background: var(--slot-bg);
		border-top: 6px dashed var(--cheap);
	}

	aside {
		width: 560px;
		flex: none;
		margin-left: 24px;
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	.best {
		flex: none;
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
	.start {
		text-align: right;
	}
	.time {
		font-size: 34px;
		font-weight: 700;
	}

	.yesterday {
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.yesterday .head {
		justify-content: space-between;
	}
	.split {
		height: 28px;
		flex: none;
		display: flex;
		border-radius: 14px;
		overflow: hidden;
		margin: 4px 0;
	}
	.split .house {
		background: var(--house);
	}
	.split .car {
		background: var(--car);
	}
	.row {
		height: 56px;
		display: flex;
		align-items: center;
		gap: 14px;
	}
	.who {
		flex: 1;
		font-size: 28px;
		font-weight: 600;
	}
	.kwh {
		font-size: 26px;
		font-weight: 600;
	}
	.pounds {
		width: 96px;
		text-align: right;
		font-size: 28px;
		font-weight: 700;
	}
</style>
