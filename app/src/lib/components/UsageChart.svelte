<script lang="ts">
	import { bandAt, halfHoursOf, type HalfHourUse, type Slot } from '#lib/energy.ts';
	import { formatTime, type DayKey } from '#lib/time.ts';

	let {
		day,
		use,
		slots,
		priced
	}: {
		day: DayKey;
		use: HalfHourUse[];
		slots: Slot[];
		/** False when the Hub doesn't know the tariff, so it can't say what's Peak. */
		priced: boolean;
	} = $props();

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
				label: time.endsWith(':00') && Number(time.slice(0, 2)) % 3 === 0 ? time : ''
			};
		})
	);
</script>

<!-- A bar for each Half-hour of the day: Car charging stacked on House use, over whether it was Peak or cheap. -->
<div class="chart">
	<div class="bars">
		{#each columns as c (c.key)}
			<div class="column {c.band ?? ''}">
				{#if c.car > 0}<div class="car" style:height="{c.car}%"></div>{/if}
				{#if c.house > 0}<div class="house" class:under={c.car > 0} style:height="{c.house}%"></div>{/if}
			</div>
		{/each}
	</div>
	<div class="labels">
		{#each columns as c (c.key)}
			<div class="tabular">{c.label}</div>
		{/each}
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
	.bars,
	.labels {
		display: flex;
		gap: 4px;
	}
	.bars {
		flex: 1;
		min-height: 0;
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
