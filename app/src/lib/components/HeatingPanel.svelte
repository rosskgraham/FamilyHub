<script lang="ts">
	import { formatDegrees, heatingSummary, MAX_TARGET, MIN_TARGET, whyNoTarget, type Heating } from '#lib/heating.ts';
	import { heatingPanel } from '#lib/heating-panel.svelte.ts';
	import { showTime } from '#lib/show-time.svelte.ts';
	import FlameIcon from './FlameIcon.svelte';

	// The Heating panel (mockups C and D in design/mockups/heating/), opened by tapping the heating in the header. It
	// changes only the target, like turning the Nest's dial (ADR 0013), and looks and closes like an Event's detail.

	let { heating }: { heating: Heating } = $props();

	const why = $derived(whyNoTarget(heating));
	const nestTarget = $derived(heating.reporting ? heating.target : null);
	const target = $derived(heatingPanel.target ?? nestTarget);
	const on = $derived(heating.reporting && heating.heating);
	const doing = $derived(
		!heating.reporting
			? null
			: heating.mode === 'heat'
				? heating.heating
					? 'Heating'
					: 'Warm enough'
				: heatingSummary(heating)
	);

	let close: HTMLButtonElement | undefined = $state();
	$effect(() => close?.focus());
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && heatingPanel.close()} />

<!-- Tapping anywhere outside the card closes it, as does Close. -->
<div class="backdrop" role="presentation" onclick={(e) => e.target === e.currentTarget && heatingPanel.close()}>
	<div class="card" role="dialog" aria-modal="true" aria-labelledby="heating-title">
		<div class="top">
			<h2 id="heating-title">Heating</h2>
			<button class="close" bind:this={close} onclick={() => heatingPanel.close()}>Close</button>
		</div>

		<div class="now">
			<div>
				<div class="big" class:dim={!heating.reporting}>
					{heating.reporting ? formatDegrees(heating.temperature) : '–'}°
				</div>
				<div class="label">Inside now</div>
			</div>
			{#if doing}
				<div class="state" class:on><FlameIcon filled={on} size={40} />{doing}</div>
			{:else if !heating.reporting}
				<div class="state problem">
					<FlameIcon filled={false} size={40} />Not reporting{heating.since ? ` since ${showTime(heating.since)}` : ''}
				</div>
			{/if}
		</div>

		{#if why === null && target !== null}
			<div class="set">
				<div class="what">Target<small>Until the next scheduled change</small></div>
				<div class="stepper">
					<button
						aria-label="Lower the target"
						disabled={target <= MIN_TARGET}
						onclick={() => nestTarget !== null && heatingPanel.tap(-1, nestTarget)}>−</button
					>
					<div class="target tabular" aria-live="polite">{formatDegrees(target)}°</div>
					<button
						aria-label="Raise the target"
						disabled={target >= MAX_TARGET}
						onclick={() => nestTarget !== null && heatingPanel.tap(1, nestTarget)}>+</button
					>
				</div>
			</div>
			{#if heatingPanel.failed}
				<div class="failed" role="alert">Couldn’t change the heating — try again</div>
			{/if}
			<div class="foot">
				Between {MIN_TARGET}° and {MAX_TARGET}°. The schedule, Eco and Off are changed in the Nest app.
			</div>
		{:else}
			<div class="foot">{why}</div>
		{/if}
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
		border: 4px solid var(--ink);
		border-radius: 36px;
		background: var(--card);
		color: var(--ink);
		display: flex;
		flex-direction: column;
		gap: 28px;
		box-shadow: 0 24px 64px rgb(0 0 0 / 0.3);
	}
	.top {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	h2 {
		margin: 0;
		font-size: 60px;
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
	.now {
		display: flex;
		gap: 48px;
		align-items: baseline;
	}
	.big {
		font-size: 96px;
		font-weight: 700;
		line-height: 1;
	}
	.big.dim {
		color: var(--dim);
	}
	.label {
		font-size: 30px;
		font-weight: 600;
		color: var(--dim);
	}
	.state {
		display: inline-flex;
		align-items: center;
		gap: 12px;
		font-size: 30px;
		font-weight: 700;
		color: var(--dim);
	}
	.state.on {
		color: var(--flame);
	}
	.state.problem {
		color: var(--problem);
	}
	.set {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 32px;
		background: var(--soft);
		border-radius: 28px;
		padding: 24px 32px;
	}
	.what {
		font-size: 30px;
		font-weight: 600;
	}
	.what small {
		display: block;
		font-size: 24px;
		font-weight: 400;
		color: var(--dim);
		margin-top: 6px;
	}
	.stepper {
		display: flex;
		align-items: center;
		gap: 28px;
	}
	.stepper button {
		width: 120px;
		height: 120px;
		border-radius: 32px;
		border: 3px solid var(--ink);
		background: var(--card);
		color: var(--ink);
		font-size: 64px;
		font-weight: 700;
		line-height: 1;
	}
	.stepper button:disabled {
		color: var(--line);
		border-color: var(--line);
	}
	.target {
		font-size: 88px;
		font-weight: 700;
		min-width: 190px;
		text-align: center;
	}
	.failed {
		font-size: 26px;
		font-weight: 700;
		color: var(--problem);
	}
	.foot {
		font-size: 24px;
		color: var(--dim);
	}
</style>
