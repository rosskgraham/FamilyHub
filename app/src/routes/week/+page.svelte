<script lang="ts">
	import { eventsOn } from '#lib/calendar.ts';
	import { clock } from '#lib/clock.svelte.ts';
	import Badge from '#lib/components/Badge.svelte';
	import { fitColumn, type Space } from '#lib/fit.ts';
	import { owners } from '#lib/household.ts';
	import { dayOfMonth, formatDayMonth, formatTime, formatWeekday, type DayKey } from '#lib/time.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	// A column is 656px: 14px padding top and bottom, a 64px heading, and 564px for rows.
	const SPACE: Space = { height: 564, gap: 12, card: 112, row: 44 };

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

	const columns = $derived(
		data.days.map((key) => ({
			key,
			fit: fitColumn(eventsOn(data.events, key), SPACE, key === data.today ? clock.now : undefined)
		}))
	);

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
		{#each columns as { key, fit } (key)}
			<section class="day {state(key)}" style:gap="{SPACE.gap}px">
				<a class="head" href="/day?date={key}">
					<span class="name">{formatWeekday(key, 'short')}</span>
					<span class="num tabular">{dayOfMonth(key)}</span>
				</a>
				{#each fit.allDay as event (event.id)}
					{@const owner = owners[event.owner]}
					<div class="all-day" style:height="{SPACE.row}px" style:background={owner.bg} style:color={owner.fg}>{event.title}</div>
				{/each}
				{#if fit.earlier > 0}
					<a class="line" href="/day?date={key}" style:height="{SPACE.row}px">{fit.earlier} earlier</a>
				{/if}
				{#each fit.timed as event (event.id)}
					{@const owner = owners[event.owner]}
					{#if fit.compact}
						<div class="row" style:height="{SPACE.row}px" style:background={owner.bg} style:color={owner.fg}>
							<span class="row-time tabular">{formatTime(new Date(event.start))}</span>
							<Badge {owner} size={26} />
							<span class="row-title">{event.title}</span>
						</div>
					{:else}
						<div class="card" style:height="{SPACE.card}px" style:background={owner.bg} style:color={owner.fg}>
							<div class="card-top">
								<span class="card-time tabular">{formatTime(new Date(event.start))}</span>
								<Badge {owner} />
							</div>
							<div class="card-title">{event.title}</div>
						</div>
					{/if}
				{/each}
				{#if fit.more > 0}
					<a class="line more" href="/day?date={key}" style:height="{SPACE.row}px">+{fit.more} more</a>
				{/if}
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
		padding: 14px;
		border-radius: 24px;
		background: var(--card);
		overflow: hidden;
	}
	.day > * {
		flex: none;
		box-sizing: border-box;
	}
	.day.past {
		background: var(--past);
	}
	.day.today {
		box-shadow: 0 0 0 4px var(--ink);
	}
	.head {
		height: 64px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0 14px;
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

	.all-day,
	.row,
	.line {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 0 12px;
		border-radius: 12px;
		font-size: 20px;
		font-weight: 600;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.all-day {
		display: block;
		line-height: 44px;
	}
	.row-time {
		flex: none;
		font-weight: 700;
	}
	.row-title {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.line {
		justify-content: center;
		border: 2px dashed var(--line);
		color: var(--dim);
	}
	.more {
		border-style: solid;
		background: var(--soft);
		color: var(--ink);
		font-weight: 700;
	}

	.card {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 12px 14px;
		border-radius: 16px;
		overflow: hidden;
	}
	.card-top {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.card-time {
		font-size: 22px;
		font-weight: 700;
	}
	.card-title {
		font-size: 26px;
		font-weight: 600;
		line-height: 1.15;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
</style>
