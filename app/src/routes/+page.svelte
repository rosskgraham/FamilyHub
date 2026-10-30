<script lang="ts">
	import { eventsOn } from '#lib/calendar.ts';
	import { clock } from '#lib/clock.svelte.ts';
	import Badge from '#lib/components/Badge.svelte';
	import Banner from '#lib/components/Banner.svelte';
	import ShoppingList from '#lib/components/ShoppingList.svelte';
	import { fitColumn } from '#lib/fit.ts';
	import { addDays, dayOfMonth, formatIn, formatTime, formatWeekday } from '#lib/time.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	// Fixed heights, so what fits is worked out rather than measured.
	const MAIN = 744; // the stage between the header and the bottom bar
	const NEXT = 168;
	const BANNER = 56;
	const SECTION_GAP = 16;
	const HEADING = 34;
	const HEADING_GAP = 10;
	const LATER_ROW = 76;
	const LATER_GAP = 10;
	const LATER_MAX = 3;
	const DAY_PADDING = 14;
	const DAY_HEAD = 34;
	const CHIP = 38;
	const CHIP_GAP = 8;

	const today = $derived(eventsOn(data.events, data.today));
	const upcoming = $derived(today.timed.filter((e) => new Date(e.start) > clock.now));
	const next = $derived(upcoming[0]);
	const rest = $derived(upcoming.slice(1));
	// Up to three rows; with more, two rows and a "+N more today" row.
	const later = $derived(rest.length > LATER_MAX ? rest.slice(0, LATER_MAX - 1) : rest);
	const laterMore = $derived(rest.length - later.length);
	const laterRows = $derived(later.length + (laterMore > 0 ? 1 : 0));

	const comingHeight = $derived(
		MAIN -
			NEXT -
			SECTION_GAP -
			(today.allDay.length > 0 ? BANNER + SECTION_GAP : 0) -
			(laterRows > 0 ? HEADING + HEADING_GAP + laterRows * LATER_ROW + (laterRows - 1) * LATER_GAP + SECTION_GAP : 0) -
			HEADING -
			HEADING_GAP -
			2 * DAY_PADDING -
			DAY_HEAD
	);
	const comingUp = $derived(
		[1, 2, 3, 4].map((i) => {
			const key = addDays(data.today, i);
			return { key, fit: fitColumn(eventsOn(data.events, key), { height: comingHeight, gap: CHIP_GAP, row: CHIP }) };
		})
	);

</script>

<div class="today" style:gap="{SECTION_GAP}px">
	{#if next}
		{@const owner = data.owners[next.owner]}
		<section class="next" style:height="{NEXT}px">
			<div class="who">
				<Badge {owner} size={80} />
				<div>
					<div class="eyebrow">Next up · {formatIn(clock.now, new Date(next.start))}</div>
					<div class="title">{next.title}</div>
				</div>
			</div>
			<div class="time tabular">{formatTime(new Date(next.start))}</div>
		</section>
	{:else}
		<section class="next" style:height="{NEXT}px">
			<div class="title">Nothing else today</div>
		</section>
	{/if}

	{#if today.allDay.length > 0}
		<div class="banners" style:height="{BANNER}px">
			{#each today.allDay as event (event.id)}
				<Banner owner={data.owners[event.owner]} title={event.title} height={BANNER} badge={36} fontSize={26} />
			{/each}
		</div>
	{/if}

	{#if laterRows > 0}
		<section class="later" style:gap="{LATER_GAP}px">
			<h2 style:margin-bottom="{HEADING_GAP - LATER_GAP}px">Later today</h2>
			{#each later as event (event.id)}
				{@const owner = data.owners[event.owner]}
				<div class="row" style:height="{LATER_ROW}px" style:background={owner.bg} style:color={owner.fg}>
					<span class="row-time tabular">{formatTime(new Date(event.start))}</span>
					<Badge {owner} size={44} />
					<span class="row-title">{event.title}</span>
				</div>
			{/each}
			{#if laterMore > 0}
				<a class="row more" href="/day" style:height="{LATER_ROW}px">+{laterMore} more today</a>
			{/if}
		</section>
	{/if}

	<section class="coming">
		<h2 style:margin-bottom="{HEADING_GAP}px">Coming up</h2>
		<div class="days">
			{#each comingUp as { key, fit } (key)}
				<div class="day" style:padding="{DAY_PADDING}px" style:gap="{CHIP_GAP}px">
					<a class="day-head" href="/day?date={key}" style:height="{DAY_HEAD}px">
						<span>{formatWeekday(key, 'short')}</span>
						<span class="day-num tabular">{dayOfMonth(key)}</span>
					</a>
					{#each fit.allDay as event (event.id)}
						<Banner owner={data.owners[event.owner]} title={event.title} height={CHIP} badge={24} fontSize={21} />
					{/each}
					{#each fit.timed as event (event.id)}
						{@const owner = data.owners[event.owner]}
						<div class="chip" style:height="{CHIP}px" style:background={owner.bg} style:color={owner.fg}>
							<span class="tag" style:background={owner.solid} style:color={owner.on}>{owner.initial}</span>
							<span class="chip-text"><b class="tabular">{formatTime(new Date(event.start))}</b> {event.title}</span>
						</div>
					{/each}
					{#if fit.more > 0}
						<a class="chip more" href="/day?date={key}" style:height="{CHIP}px">+{fit.more} more</a>
					{/if}
				</div>
			{/each}
		</div>
	</section>
</div>

<aside>
	<ShoppingList items={data.shopping.items} status={data.shopping.status} rows={7} moreHref="/shopping" />
</aside>

<style>
	.today {
		flex: 1 1 0;
		min-width: 0;
		display: flex;
		flex-direction: column;
	}
	.today > * {
		flex: none;
	}
	h2 {
		margin: 0;
		font-size: 28px;
		font-weight: 700;
		line-height: 34px;
	}

	.next {
		box-sizing: border-box;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 24px;
		padding: 0 32px;
		border-radius: 28px;
		background: var(--hero);
		color: var(--on-hero);
	}
	.who {
		min-width: 0;
		display: flex;
		align-items: center;
		gap: 24px;
	}
	.eyebrow {
		font-size: 22px;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--hero-dim);
	}
	/* Two lines at most, so a long title stays inside the 168px card. */
	.title {
		font-size: 56px;
		font-weight: 700;
		line-height: 1.1;
		margin-top: 4px;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
	.banners {
		display: flex;
		gap: 12px;
		overflow: hidden;
	}
	.time {
		font-size: 104px;
		font-weight: 600;
		line-height: 1;
	}

	.later {
		display: flex;
		flex-direction: column;
	}
	.row {
		box-sizing: border-box;
		display: flex;
		align-items: center;
		gap: 20px;
		padding: 0 24px;
		border-radius: 20px;
	}
	.row-time {
		width: 96px;
		font-size: 32px;
		font-weight: 700;
	}
	.row-title {
		flex: 1;
		min-width: 0;
		font-size: 34px;
		font-weight: 600;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.row.more {
		justify-content: center;
		background: var(--soft);
		font-size: 28px;
		font-weight: 700;
	}

	.coming {
		flex: 1 1 0;
		min-height: 0;
		display: flex;
		flex-direction: column;
	}
	.days {
		flex: 1;
		min-height: 0;
		display: flex;
		gap: 12px;
	}
	.day {
		flex: 1 1 0;
		min-width: 0;
		box-sizing: border-box;
		display: flex;
		flex-direction: column;
		border-radius: 20px;
		background: var(--card);
		overflow: hidden;
	}
	.day > * {
		flex: none;
	}
	.day-head {
		display: flex;
		align-items: center;
		gap: 10px;
		font-size: 28px;
		font-weight: 700;
	}
	.day-num {
		font-weight: 600;
		color: var(--dim);
	}
	.chip {
		box-sizing: border-box;
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 0 10px;
		border-radius: 12px;
		font-size: 21px;
		font-weight: 600;
	}
	.chip-text {
		min-width: 0;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.chip.more {
		justify-content: center;
		background: var(--soft);
		font-weight: 700;
	}
	.tag {
		flex: none;
		padding: 1px 8px;
		border-radius: 10px;
		font-size: 16px;
		font-weight: 700;
	}

	aside {
		width: 560px;
		flex: none;
		margin-left: 24px;
		display: flex;
	}
</style>
