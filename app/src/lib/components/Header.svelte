<script lang="ts">
	import { clock } from '#lib/clock.svelte.ts';
	import WeatherIcon from './WeatherIcon.svelte';
	import { RAIN_HOURS, type Weather } from '#lib/weather.ts';
	import { dayKey, formatDayMonth, formatTime, formatWeekday } from '#lib/time.ts';

	let { weather }: { weather: Weather | null } = $props();

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

	{#if weather}
		<div class="weather">
			<WeatherIcon icon={weather.icon} />
			<div class="temperature">{weather.temperature}°</div>
			<div>
				<div class="summary">{weather.summary}</div>
				<div class="range">High {weather.high}° · Low {weather.low}°</div>
				<div class="range">Rain {weather.rainChance}% next {RAIN_HOURS} hours</div>
			</div>
		</div>
	{/if}
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
