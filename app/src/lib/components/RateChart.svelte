<script lang="ts">
	import { formatPence, priceBands, type CheapWindow, type Rate } from '#lib/energy.ts';
	import { formatTime, formatWeekday, dayKey } from '#lib/time.ts';

	let { rates, now, window }: { rates: Rate[]; now: Date; window: CheapWindow | null } = $props();

	const bands = $derived(priceBands(rates));
	// Bars rise from a zero line, and a negative rate hangs below it.
	const top = $derived(Math.max(0, ...rates.map((r) => r.pence)));
	const bottom = $derived(Math.min(0, ...rates.map((r) => r.pence)));
	const range = $derived(top - bottom || 1);
	const zero = $derived((-bottom / range) * 100);
	// A label every 3 hours for one day, every 6 for two.
	const every = $derived(rates.length > 50 ? 6 : 3);

	function label(rate: Rate): string {
		const from = new Date(rate.from);
		const [hour, minute] = formatTime(from).split(':').map(Number) as [number, number];
		if (minute !== 0 || hour % every !== 0) return '';
		if (hour === 0 && dayKey(from) !== dayKey(new Date(rates[0]!.from))) return formatWeekday(dayKey(from), 'short');
		return formatTime(from);
	}

	const bars = $derived(
		rates.map((rate, i) => {
			const from = new Date(rate.from);
			const to = new Date(rate.to);
			return {
				rate,
				height: (Math.abs(rate.pence) / range) * 100,
				negative: rate.pence < 0,
				colour: to <= now ? 'var(--past-bar)' : `var(--${bands[i]})`,
				current: from <= now && now < to,
				inWindow: !!window && rate.from >= window.from && rate.to <= window.to,
				label: label(rate)
			};
		})
	);
	const summary = $derived(
		rates.length === 0
			? 'No prices yet'
			: `Prices from ${formatPence(Math.min(...rates.map((r) => r.pence)))} to ${formatPence(Math.max(...rates.map((r) => r.pence)))} per kWh`
	);
</script>

<div class="chart" role="img" aria-label={summary}>
	<div class="bars">
		{#each bars as bar (bar.rate.from)}
			<div class="column" class:window={bar.inWindow}>
				<div
					class="bar"
					class:current={bar.current}
					class:negative={bar.negative}
					style:background={bar.colour}
					style:height="{bar.height}%"
					style:bottom={bar.negative ? null : `${zero}%`}
					style:top={bar.negative ? `${100 - zero}%` : null}
				></div>
			</div>
		{/each}
		{#if bottom < 0}
			<div class="zero" style:bottom="{zero}%"></div>
		{/if}
	</div>
	<div class="labels">
		{#each bars as bar (bar.rate.from)}
			<div class="label tabular">{bar.label}</div>
		{/each}
	</div>
</div>

<style>
	.chart {
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.bars {
		position: relative;
		flex: 1;
		min-height: 0;
		display: flex;
		gap: 3px;
	}
	.column {
		position: relative;
		flex: 1 1 0;
		min-width: 0;
		border-radius: 6px;
	}
	.column.window {
		background: var(--window-bg);
	}
	.bar {
		position: absolute;
		left: 0;
		right: 0;
		box-sizing: border-box;
		border-radius: 6px 6px 2px 2px;
	}
	.bar.negative {
		border-radius: 2px 2px 6px 6px;
	}
	.bar.current {
		border: 4px solid var(--ink);
	}
	.zero {
		position: absolute;
		left: 0;
		right: 0;
		height: 2px;
		background: var(--line);
	}
	.labels {
		flex: none;
		display: flex;
		gap: 3px;
		height: 28px;
	}
	.label {
		flex: 1 1 0;
		min-width: 0;
		font-size: 20px;
		font-weight: 600;
		color: var(--dim);
		white-space: nowrap;
	}
</style>
