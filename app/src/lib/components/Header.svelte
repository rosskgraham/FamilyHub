<script lang="ts">
	import { clock } from '#lib/clock.svelte.ts';
	import type { Weather } from '#lib/sample.ts';
	import { dayKey, formatDayMonth, formatTime, formatWeekday } from '#lib/time.ts';

	let { weather }: { weather: Weather } = $props();

	const today = $derived(dayKey(clock.now));
</script>

<header>
	<div class="when">
		<div class="clock tabular">{formatTime(clock.now)}</div>
		<div>
			<div class="weekday">{formatWeekday(today, 'long')}</div>
			<div class="date">{formatDayMonth(today)}</div>
		</div>
	</div>

	<div class="weather">
		<svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"
			><line x1="16" y1="13" x2="16" y2="21" /><line x1="8" y1="13" x2="8" y2="21" /><line x1="12" y1="15" x2="12" y2="23" /><path
				d="M20 16.58A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15.25"
			/></svg
		>
		<div class="temperature">{weather.temperature}°</div>
		<div>
			<div class="summary">{weather.summary}</div>
			<div class="range">High {weather.high}° · Low {weather.low}°</div>
		</div>
	</div>
</header>

<style>
	header {
		height: 128px;
		flex: none;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 32px;
	}
	.when,
	.weather {
		display: flex;
		align-items: center;
	}
	.when {
		gap: 28px;
	}
	.weather {
		gap: 16px;
	}
	.clock {
		font-size: 112px;
		font-weight: 600;
		line-height: 1;
		letter-spacing: -0.02em;
	}
	.weekday {
		font-size: 44px;
		font-weight: 600;
		line-height: 1.1;
	}
	.date {
		font-size: 28px;
		color: var(--dim);
		margin-top: 4px;
	}
	.temperature {
		font-size: 56px;
		font-weight: 600;
		line-height: 1;
	}
	.summary {
		font-size: 24px;
		font-weight: 600;
	}
	.range {
		font-size: 22px;
		color: var(--dim);
	}
</style>
