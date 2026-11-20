<script lang="ts">
	import { eventWhen } from '#lib/calendar.ts';
	import { EVERYONE } from '#lib/household.ts';
	import { eventDetail, type Shown } from '#lib/event-detail.svelte.ts';
	import { clockFormat } from '#lib/show-time.svelte.ts';
	import Badge from './Badge.svelte';
	import BinIcon from './BinIcon.svelte';
	import CakeIcon from './CakeIcon.svelte';

	let { shown }: { shown: Shown } = $props();

	const event = $derived(shown.event);
	const owner = $derived(shown.owner);
	const when = $derived(eventWhen(event, clockFormat()));
	const who = $derived(
		event.birthday ? 'Birthday' : event.bin ? 'Bin day' : owner.id === EVERYONE ? 'Family' : owner.name
	);

	let close: HTMLButtonElement | undefined = $state();
	$effect(() => close?.focus());
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && eventDetail.close()} />

<!-- Tapping anywhere outside the card closes it, as does Close. -->
<div class="backdrop" role="presentation" onclick={(e) => e.target === e.currentTarget && eventDetail.close()}>
	<div
		class="card"
		role="dialog"
		aria-modal="true"
		aria-labelledby="event-title"
		style:border-color={event.allDay ? owner.solid : 'transparent'}
		style:background={event.allDay ? 'var(--card)' : owner.bg}
		style:color={owner.fg}
	>
		<div class="top">
			<div class="who">
				{#if event.bin}<BinIcon colour={event.bin} size={64} />{:else if event.birthday}<CakeIcon
						size={64}
					/>{:else}<Badge {owner} size={64} />{/if}
				<span>{who}</span>
			</div>
			<button class="close" bind:this={close} onclick={() => eventDetail.close()}>Close</button>
		</div>
		<h2 id="event-title">{event.title}</h2>
		<div class="when">
			<span class="time tabular">{when.time}</span>
			<span class="day">{when.day}</span>
		</div>
	</div>
</div>

<style>
	.backdrop {
		position: absolute;
		inset: 0;
		z-index: 5;
		background: rgb(0 0 0 / 0.45);
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.card {
		width: 1000px;
		box-sizing: border-box;
		padding: 40px 48px 48px;
		border: 4px solid;
		border-radius: 36px;
		display: flex;
		flex-direction: column;
		gap: 24px;
		box-shadow: 0 24px 64px rgb(0 0 0 / 0.3);
	}
	.top {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.who {
		display: flex;
		align-items: center;
		gap: 20px;
		font-size: 32px;
		font-weight: 700;
	}
	.close {
		height: 72px;
		padding: 0 32px;
		border: 2px solid currentColor;
		border-radius: 22px;
		background: none;
		font-size: 26px;
		font-weight: 700;
	}
	h2 {
		margin: 0;
		font-size: 60px;
		font-weight: 700;
		line-height: 1.1;
		overflow-wrap: anywhere;
	}
	.when {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.time {
		font-size: 44px;
		font-weight: 700;
	}
	.day {
		font-size: 30px;
		font-weight: 600;
	}
</style>
