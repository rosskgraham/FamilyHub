<script lang="ts">
	import { clock } from '#lib/clock.svelte.ts';
	import FlameIcon from './FlameIcon.svelte';
	import WeatherIcon from './WeatherIcon.svelte';
	import { formatDegrees, heatingSummary, type Heating } from '#lib/heating.ts';
	import { RAIN_HOURS, type Weather } from '#lib/weather.ts';
	import { dayKey, formatDayMonth, formatWeekday } from '#lib/time.ts';
	import { showTime } from '#lib/show-time.svelte.ts';

	let { weather, heating }: { weather: Weather | null; heating: Heating | null } = $props();

	const today = $derived(dayKey(clock.now));
</script>

<header>
	<div class="when">
		<div class="clock tabular">{showTime(clock.now)}</div>
		<div>
			<div class="weekday">{formatWeekday(today, 'long')}</div>
			<div class="date">{formatDayMonth(today)}</div>
		</div>
	</div>

	<div class="readings">
		<!-- Inside, from the Nest (ADR 0013). Nothing until it's connected, as with no weather. -->
		{#if heating}
			<div
				class="heating"
				class:divided={weather}
				class:on={heating.reporting && heating.heating}
				class:problem={!heating.reporting}
			>
				<FlameIcon filled={heating.reporting && heating.heating} />
				{#if heating.reporting}
					<div class="temperature">{formatDegrees(heating.temperature)}°</div>
					<div>
						<div class="summary">{heatingSummary(heating)}</div>
						<div class="range">Inside{heating.humidity === null ? '' : ` · Humidity ${heating.humidity}%`}</div>
					</div>
				{:else}
					<!-- An old temperature is more misleading than none. -->
					<div class="temperature">–°</div>
					<div>
						<div class="summary">Heating</div>
						<div class="range">Not reporting{heating.since ? ` since ${showTime(heating.since)}` : ''}</div>
					</div>
				{/if}
			</div>
		{/if}

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
	.readings,
	.heating,
	.weather {
		display: flex;
		align-items: center;
	}
	.readings {
		gap: 36px;
	}
	.heating {
		gap: 16px;
		color: var(--dim);
	}
	.heating.divided {
		height: 96px;
		padding-right: 36px;
		border-right: 2px solid var(--line);
	}
	.heating.on {
		color: var(--flame);
	}
	.heating .temperature {
		color: var(--ink);
	}
	.heating.problem .temperature {
		color: var(--dim);
	}
	.heating .summary {
		color: var(--ink);
		white-space: nowrap;
	}
	.heating.on .summary {
		color: var(--flame);
	}
	.heating .range {
		white-space: nowrap;
	}
	.heating.problem .range {
		color: var(--problem);
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
