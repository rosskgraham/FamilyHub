<script lang="ts">
	import { clock } from '#lib/clock.svelte.ts';
	import { bandAt, cheapNow, formatKw, formatPence, type Live, type Rates, type Slot } from '#lib/energy.ts';
	import { formatTime } from '#lib/time.ts';

	let { rates, slots, live }: { rates: Rates | null; slots: Slot[]; live: Live | null } = $props();

	const band = $derived(bandAt(clock.now, slots));
	const cheap = $derived(cheapNow(clock.now, slots));
	const bandName = { 'off-peak': 'off-peak', slot: 'smart slot', peak: 'peak' };
	const time = (iso: string) => formatTime(new Date(iso));
</script>

<!-- The Today view's glance at Energy: the price now and the next cheap time. Opens the Energy Section. -->
<a class="card" href="/energy">
	<div class="head">
		<span class="title">Energy</span>
		<span class="using">
			{#if live}Using {formatKw(live.watts)}{/if}
			<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6" /></svg>
		</span>
	</div>
	{#if rates}
		<div class="now">
			<span class="price tabular">{formatPence(band === 'peak' ? rates.peak : rates.offPeak)}</span>
			<span class="dim">now, {bandName[band]}</span>
		</div>
		<div class="cheap">
			{#if cheap.current}
				<span>Cheap now · {cheap.current.slot ? 'smart slot' : 'off-peak'}</span>
				<span class="tabular">until {time(cheap.current.to)}</span>
			{:else}
				<span>Next cheap · {cheap.next.slot ? 'smart slot' : 'off-peak'}</span>
				<span class="tabular">{time(cheap.next.from)} · {formatPence(rates.offPeak)}</span>
			{/if}
		</div>
	{:else}
		<div class="dim">Prices not known</div>
	{/if}
</a>

<style>
	.card {
		flex: none;
		box-sizing: border-box;
		display: flex;
		flex-direction: column;
		gap: 12px;
		padding: 22px 28px;
		border-radius: 28px;
		background: var(--card);
	}
	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.title {
		font-size: 36px;
		font-weight: 700;
	}
	.using {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 22px;
		font-weight: 600;
		color: var(--dim);
	}
	.now {
		display: flex;
		align-items: baseline;
		gap: 12px;
	}
	.price {
		font-size: 56px;
		font-weight: 600;
		line-height: 1;
	}
	.dim {
		font-size: 24px;
		font-weight: 600;
		color: var(--dim);
	}
	.cheap {
		height: 64px;
		box-sizing: border-box;
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0 18px;
		border-radius: 18px;
		background: var(--off-peak-bg);
		color: var(--cheap-fg);
		font-size: 24px;
		font-weight: 700;
	}
	.cheap .tabular {
		font-size: 28px;
	}
</style>
