<script lang="ts">
	import { bandAt, chargeLine, halfHoursOf, type ChargeReading, type HalfHourUse, type Slot } from '#lib/energy.ts';
	import { formatTime, type DayKey } from '#lib/time.ts';
	import { showTime } from '#lib/show-time.svelte.ts';

	let {
		day,
		use,
		slots,
		priced,
		charge = []
	}: {
		day: DayKey;
		use: HalfHourUse[];
		slots: Slot[];
		/** False when the Hub doesn't know the tariff, so it can't say what's Peak. */
		priced: boolean;
		/** The car's charge while it was plugged in, drawn as a line over the bars on its own 0–100% scale. */
		charge?: ChargeReading[];
	} = $props();

	// One run of the line for each time the car was plugged in, in the SVG's 100 by 100 space.
	const runs = $derived(chargeLine(charge, day));
	const lines = $derived(
		runs.filter((r) => r.length > 1).map((r) => r.map((p) => `${p.x * 100},${100 - p.percent}`).join(' '))
	);
	const lone = $derived(runs.filter((r) => r.length === 1).map((r) => r[0]!));
	const last = $derived(runs.at(-1)?.at(-1) ?? null);

	const used = $derived(new Map(use.map((u) => [u.from, u])));
	// The tallest Half-hour fills the chart, with a little room above.
	const top = $derived(Math.max(1, ...use.map((u) => u.house + u.car)) * 1.1);
	const columns = $derived(
		halfHoursOf(day).map((from) => {
			const time = formatTime(from);
			const u = used.get(from.toISOString());
			return {
				key: from.toISOString(),
				band: priced ? bandAt(from, slots) : null,
				house: ((u?.house ?? 0) / top) * 100,
				car: ((u?.car ?? 0) / top) * 100,
				label: time.endsWith(':00') && Number(time.slice(0, 2)) % 3 === 0 ? showTime(from) : ''
			};
		})
	);
</script>

<!-- A bar for each Half-hour of the day: Car charging stacked on House use, over whether it was Peak or cheap. While
	the car's been plugged in, its charge is a line over the bars, on its own 0–100% scale on the right. -->
<div class="chart" class:charged={last}>
	<div class="plot">
		<div class="bars">
			{#each columns as c (c.key)}
				<div class="column {c.band ?? ''}">
					{#if c.car > 0}<div class="car" style:height="{c.car}%"></div>{/if}
					{#if c.house > 0}<div class="house" class:under={c.car > 0} style:height="{c.house}%"></div>{/if}
				</div>
			{/each}
			{#if last}
				<svg class="charge" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
					{#each lines as points, i (i)}
						<polyline class="halo" {points} vector-effect="non-scaling-stroke" />
						<polyline class="line" {points} vector-effect="non-scaling-stroke" />
					{/each}
				</svg>
				{#each lone as p, i (i)}
					<div class="dot" style:left="{p.x * 100}%" style:bottom="{p.percent}%"></div>
				{/each}
				<div class="end" class:left={last.x > 0.85} style:left="{last.x * 100}%" style:bottom="{last.percent}%">
					<div class="dot"></div>
					<span class="tabular">{Math.round(last.percent)}%</span>
				</div>
			{/if}
		</div>
		{#if last}
			<div class="scale tabular" aria-hidden="true"><span>100%</span><span>0%</span></div>
		{/if}
	</div>
	<div class="labels">
		{#each columns as c (c.key)}
			<div class="tabular">{c.label}</div>
		{/each}
		{#if last}<div class="gutter"></div>{/if}
	</div>
</div>

<style>
	.chart {
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	.plot {
		flex: 1;
		min-height: 0;
		display: flex;
		gap: 12px;
	}
	.bars,
	.labels {
		display: flex;
		gap: 4px;
	}
	.bars {
		flex: 1;
		min-width: 0;
		position: relative;
	}
	/* The charge's own scale, and room under it so the time labels stay under their bars. */
	.scale,
	.labels .gutter {
		flex: 0 0 64px;
	}
	.charged .labels {
		gap: 4px;
	}
	.charged .labels .gutter {
		margin-left: 8px;
	}
	.scale {
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		/* Lines up 100% with the top of the bars' border and 0% with their bottom. */
		margin-bottom: -10px;
		margin-top: -10px;
		font-size: 20px;
		font-weight: 600;
		color: var(--dim);
	}
	.charge {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		overflow: visible;
		pointer-events: none;
	}
	.charge polyline {
		fill: none;
		stroke-linejoin: round;
		stroke-linecap: round;
	}
	/* A ring of card around the line, so it reads over both colours of bar. */
	.charge .halo {
		stroke: var(--card);
		stroke-width: 7px;
	}
	.charge .line {
		stroke: var(--ink);
		stroke-width: 3px;
	}
	.dot {
		position: absolute;
		width: 14px;
		height: 14px;
		margin: 0 0 -7px -7px;
		box-sizing: border-box;
		border-radius: 50%;
		background: var(--ink);
		border: 2px solid var(--card);
	}
	.end {
		position: absolute;
		display: flex;
		align-items: center;
		gap: 6px;
		transform: translateY(50%);
		pointer-events: none;
	}
	.end .dot {
		position: static;
		margin: 0 0 0 -7px;
	}
	.end.left {
		flex-direction: row-reverse;
		transform: translate(-100%, 50%);
	}
	.end.left .dot {
		margin: 0 -7px 0 0;
	}
	.end span {
		font-size: 22px;
		font-weight: 700;
		color: var(--ink);
		background: var(--card);
		border-radius: 6px;
		padding: 0 4px;
	}
	.column {
		flex: 1 1 0;
		min-width: 0;
		box-sizing: border-box;
		display: flex;
		flex-direction: column;
		justify-content: flex-end;
		border-radius: 6px;
		border-top: 6px solid var(--line);
	}
	.column.off-peak {
		background: var(--off-peak-bg);
		border-top-color: var(--cheap);
	}
	.column.slot {
		background: var(--slot-bg);
		border-top: 6px dashed var(--cheap);
	}
	.column.peak {
		border-top-color: var(--peak);
	}
	.car,
	.house {
		border-radius: 6px 6px 0 0;
	}
	.car {
		background: var(--car);
	}
	.house {
		background: var(--house);
	}
	.house.under {
		border-radius: 0;
	}
	.labels div {
		flex: 1 1 0;
		min-width: 0;
		height: 28px;
		font-size: 20px;
		font-weight: 600;
		color: var(--dim);
		white-space: nowrap;
	}
</style>
