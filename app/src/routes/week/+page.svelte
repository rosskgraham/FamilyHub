<script lang="ts">
	import { eventsOn } from '#lib/calendar.ts';
	import Badge from '#lib/components/Badge.svelte';
	import { owners } from '#lib/household.ts';
	import { dayOfMonth, formatDayMonth, formatTime, formatWeekday, type DayKey } from '#lib/time.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const title = $derived.by(() => {
		if (data.offset === 0) return 'This week';
		if (data.offset === 1) return 'Next week';
		if (data.offset === -1) return 'Last week';
		return data.offset > 0 ? `In ${data.offset} weeks` : `${-data.offset} weeks ago`;
	});

	// "19–25 October", or "29 September – 5 October" across two months.
	const range = $derived.by(() => {
		const first = data.days[0]!;
		const last = data.days[6]!;
		return first.slice(5, 7) === last.slice(5, 7)
			? `${dayOfMonth(first)}–${formatDayMonth(last)}`
			: `${formatDayMonth(first)} – ${formatDayMonth(last)}`;
	});

	function state(key: DayKey): 'past' | 'today' | 'future' {
		if (key === data.today) return 'today';
		return key < data.today ? 'past' : 'future';
	}
</script>

<div class="week">
	<div class="nav">
		<a class="step" href="?week={data.offset - 1}" aria-label="Previous week">
			<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"
				><polyline points="15 18 9 12 15 6" /></svg
			>
		</a>
		<div class="label">
			<div class="label-title">{title}</div>
			<div class="label-range">{range}</div>
		</div>
		<a class="step" href="?week={data.offset + 1}" aria-label="Next week">
			<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"
				><polyline points="9 18 15 12 9 6" /></svg
			>
		</a>
		{#if data.offset !== 0}
			<a class="back" href="/week">Back to this week</a>
		{/if}
	</div>

	<div class="columns">
		{#each data.days as key (key)}
			{@const { allDay, timed } = eventsOn(data.events, key)}
			<section class="day {state(key)}">
				<div class="head">
					<span class="name">{formatWeekday(key, 'short')}</span>
					<span class="num tabular">{dayOfMonth(key)}</span>
				</div>
				{#each allDay as event (event.id)}
					{@const owner = owners[event.owner]}
					<div class="all-day" style:background={owner.bg} style:color={owner.fg}>{event.title}</div>
				{/each}
				{#each timed as event (event.id)}
					{@const owner = owners[event.owner]}
					<div class="event" style:background={owner.bg} style:color={owner.fg}>
						<div class="event-top">
							<span class="event-time tabular">{formatTime(new Date(event.start))}</span>
							<Badge {owner} />
						</div>
						<div class="event-title">{event.title}</div>
					</div>
				{/each}
			</section>
		{/each}
	</div>
</div>

<style>
	.week {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.nav {
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
		min-width: 280px;
		text-align: center;
	}
	.label-title {
		font-size: 28px;
		font-weight: 700;
	}
	.label-range {
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

	.columns {
		flex: 1;
		min-height: 0;
		display: flex;
		gap: 14px;
	}
	.day {
		flex: 1 1 0;
		min-width: 0;
		box-sizing: border-box;
		display: flex;
		flex-direction: column;
		gap: 12px;
		padding: 14px;
		border-radius: 24px;
		background: var(--card);
		overflow: hidden;
	}
	.day.past {
		background: var(--past);
	}
	.day.today {
		box-shadow: 0 0 0 4px var(--ink);
	}
	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 10px 14px;
		border-radius: 14px;
		background: var(--soft);
	}
	.past .head {
		background: var(--past-head);
	}
	.today .head {
		background: var(--ink);
		color: #ffffff;
	}
	.name {
		font-size: 30px;
		font-weight: 700;
	}
	.num {
		font-size: 44px;
		font-weight: 600;
		line-height: 1;
	}
	.all-day {
		padding: 8px 14px;
		border-radius: 12px;
		font-size: 22px;
		font-weight: 600;
	}
	.event {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 12px 14px;
		border-radius: 16px;
	}
	.event-top {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.event-time {
		font-size: 22px;
		font-weight: 700;
	}
	.event-title {
		font-size: 26px;
		font-weight: 600;
		line-height: 1.15;
	}
</style>
