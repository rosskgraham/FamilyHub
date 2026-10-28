<script lang="ts">
	import { eventsOn } from '#lib/calendar.ts';
	import { clock } from '#lib/clock.svelte.ts';
	import Badge from '#lib/components/Badge.svelte';
	import Banner from '#lib/components/Banner.svelte';
	import { addDays, formatDayMonth, formatTime, formatWeekday } from '#lib/time.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const day = $derived(eventsOn(data.events, data.date));
	const title = $derived.by(() => {
		if (data.date === data.today) return 'Today';
		if (data.date === addDays(data.today, 1)) return 'Tomorrow';
		if (data.date === addDays(data.today, -1)) return 'Yesterday';
		return formatWeekday(data.date, 'long');
	});
	const isPast = (end: string) => new Date(end) <= clock.now;
</script>

<div class="day">
	<div class="nav">
		<a class="step" href="?date={addDays(data.date, -1)}" aria-label="Previous day">
			<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"
				><polyline points="15 18 9 12 15 6" /></svg
			>
		</a>
		<div class="label">
			<div class="label-title">{title}</div>
			<div class="label-date">
				{title === formatWeekday(data.date, 'long') ? '' : formatWeekday(data.date, 'long')}
				{formatDayMonth(data.date)}
			</div>
		</div>
		<a class="step" href="?date={addDays(data.date, 1)}" aria-label="Next day">
			<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"
				><polyline points="9 18 15 12 9 6" /></svg
			>
		</a>
		{#if data.date !== data.today}
			<a class="back" href="/day">Back to today</a>
		{/if}
	</div>

	{#if day.allDay.length > 0}
		<div class="banners">
			{#each day.allDay as event (event.id)}
				<Banner owner={data.owners[event.owner]} title={event.title} height={56} badge={36} fontSize={26} />
			{/each}
		</div>
	{/if}

	{#if day.timed.length === 0}
		<p class="empty">Nothing on.</p>
	{:else}
		<!-- Fills a column of seven rows, then a second column. -->
		<div class="rows">
			{#each day.timed as event (event.id)}
				{@const owner = data.owners[event.owner]}
				<div class="row" class:past={isPast(event.end)} style:background={owner.bg} style:color={owner.fg}>
					<span class="time tabular">{formatTime(new Date(event.start))}–{formatTime(new Date(event.end))}</span>
					<Badge {owner} size={44} />
					<span class="title">{event.title}</span>
				</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	.day {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	.nav {
		height: 72px;
		flex: none;
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.step {
		width: 72px;
		height: 72px;
		box-sizing: border-box;
		border-radius: 20px;
		border: 2px solid var(--line);
		background: var(--card);
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.label {
		min-width: 360px;
		text-align: center;
	}
	.label-title {
		font-size: 28px;
		font-weight: 700;
	}
	.label-date {
		font-size: 22px;
		color: var(--dim);
	}
	.back {
		margin-left: 12px;
		height: 72px;
		padding: 0 28px;
		box-sizing: border-box;
		border-radius: 22px;
		border: 2px solid var(--line);
		background: var(--card);
		font-size: 24px;
		font-weight: 700;
		display: flex;
		align-items: center;
	}
	.banners {
		height: 56px;
		flex: none;
		display: flex;
		gap: 12px;
		overflow: hidden;
	}

	.empty {
		margin: 0;
		font-size: 34px;
		color: var(--dim);
	}
	.rows {
		flex: 1;
		min-height: 0;
		display: grid;
		/* Seven rows fit under the all-day banners: 7 × 72px + 6 × 10px gaps. */
		grid-template-rows: repeat(7, 72px);
		grid-auto-flow: column;
		grid-auto-columns: minmax(0, 1fr);
		gap: 10px 24px;
		overflow: auto;
	}
	.row {
		box-sizing: border-box;
		display: flex;
		align-items: center;
		gap: 20px;
		padding: 0 24px;
		border-radius: 20px;
	}
	.row.past {
		opacity: 0.55;
	}
	.time {
		flex: none;
		font-size: 30px;
		font-weight: 700;
	}
	.title {
		flex: 1;
		min-width: 0;
		font-size: 34px;
		font-weight: 600;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
</style>
