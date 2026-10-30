<script lang="ts">
	import { nextEvent, type CalendarEvent } from '#lib/calendar.ts';
	import { clock } from '#lib/clock.svelte.ts';
	import type { Household } from '#lib/household.ts';
	import { sleepPalette } from '#lib/sleep.ts';
	import { addDays, dayKey, formatDayMonth, formatIn, formatTime, formatWeekday } from '#lib/time.ts';
	import Badge from './Badge.svelte';

	let { events, owners, onwake }: { events: CalendarEvent[]; owners: Household; onwake: () => void } = $props();

	const today = $derived(dayKey(clock.now));
	const next = $derived(nextEvent(events, clock.now));
	const owner = $derived(next ? owners[next.owner] : undefined);
	const when = $derived.by(() => {
		if (!next) return '';
		const day = dayKey(new Date(next.start));
		if (day === today) return formatIn(clock.now, new Date(next.start));
		return day === addDays(today, 1) ? 'tomorrow' : formatWeekday(day, 'long');
	});
</script>

<!-- The whole screen is one button, so the tap that wakes the Hub doesn't also press whatever is underneath. -->
<button
	class="sleep"
	aria-label="Wake the Hub"
	onclick={onwake}
	style:--sleep-bg={sleepPalette.bg}
	style:--sleep-clock={sleepPalette.clock}
	style:--sleep-text={sleepPalette.text}
	style:--sleep-event={sleepPalette.event}
	style:--sleep-line={sleepPalette.line}
	style:--sleep-hint={sleepPalette.hint}
>
	<span class="clock tabular">{formatTime(clock.now)}</span>
	<span class="date">{formatWeekday(today, 'long')} {formatDayMonth(today)}</span>
	{#if next && owner}
		<span class="next">
			<Badge {owner} size={44} />
			<span class="title">{next.title} · <span class="tabular">{formatTime(new Date(next.start))}</span></span>
			<span class="when">{when}</span>
		</span>
	{/if}
	<span class="hint">Tap to wake</span>
</button>

<style>
	.sleep {
		position: absolute;
		inset: 0;
		z-index: 10;
		box-sizing: border-box;
		padding: 48px 64px;
		border: 0;
		background: var(--sleep-bg);
		color: var(--sleep-text);
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 28px;
		cursor: default;
	}
	.clock {
		font-size: 280px;
		font-weight: 500;
		line-height: 1;
		letter-spacing: -0.03em;
		color: var(--sleep-clock);
	}
	.date {
		font-size: 44px;
		font-weight: 500;
	}
	.next {
		margin-top: 40px;
		display: flex;
		align-items: center;
		gap: 20px;
		padding: 18px 32px;
		border: 2px solid var(--sleep-line);
		border-radius: 24px;
	}
	.title {
		font-size: 30px;
		font-weight: 600;
		color: var(--sleep-event);
	}
	.when {
		font-size: 26px;
	}
	.hint {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 40px;
		font-size: 24px;
		font-weight: 500;
		color: var(--sleep-hint);
	}
</style>
