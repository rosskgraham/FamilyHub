<script lang="ts">
	import { enhance } from '$app/forms';
	import { clockFormat } from '#lib/show-time.svelte.ts';
	import { showSleepTime, STEP_MINUTES, stepHours, type SleepHours, type SleepTime } from '#lib/sleep.ts';

	// Sleep and Lights out hours, in Settings (AB#64). Each − and + saves straight away, like the Clock and Theme. Not
	// locked: the hours can't sign anything out.

	let { hours }: { hours: SleepHours } = $props();

	const show = (time: string) => showSleepTime(time, clockFormat());
	const pairs: { heading: string; times: [SleepTime, string, string][] }[] = $derived([
		{
			heading: 'Sleep',
			times: [
				['sleepFrom', 'From', hours.sleep.from],
				['sleepUntil', 'Until', hours.sleep.until]
			]
		},
		{
			heading: 'Lights out',
			times: [
				['lightsOutFrom', 'From', hours.lightsOut.from],
				['lightsOutUntil', 'Until', hours.lightsOut.until]
			]
		}
	]);

	// Lights out off keeps its times, faded and not changeable.
	const can = (time: SleepTime, delta: number) =>
		(hours.lightsOutOn || time.startsWith('sleep')) && stepHours(hours, time, delta) !== null;

	// Why a Lights out button is greyed at the edge of Sleep, like the heating's limit.
	const limits = $derived(
		hours.lightsOutOn
			? [
					hours.lightsOut.from === hours.sleep.from &&
						`Lights out starts no earlier than Sleep, ${show(hours.sleep.from)}.`,
					hours.lightsOut.until === hours.sleep.until &&
						`Lights out ends by the end of Sleep, ${show(hours.sleep.until)}.`
				].filter(Boolean)
			: []
	);
</script>

<section class="sleep" aria-labelledby="sleep-heading">
	{#each pairs as pair, i (pair.heading)}
		<div class="part" class:off={i === 1 && !hours.lightsOutOn}>
			<div class="words">
				{#if i === 0}
					<h2 id="sleep-heading">Sleep</h2>
					<p>A dim clock and the next Event overnight. A touch wakes the Hub for two minutes.</p>
				{:else}
					<h2 id="lights-out-heading">Lights out</h2>
					<p>The screen goes dark during Sleep. A touch lights it for two minutes.</p>
					<form method="POST" action="?/lightsOut" use:enhance>
						<div class="choices" role="group" aria-labelledby="lights-out-heading">
							<button type="submit" name="lightsOutOn" value="on" aria-pressed={hours.lightsOutOn}>On</button>
							<button type="submit" name="lightsOutOn" value="off" aria-pressed={!hours.lightsOutOn}>Off</button>
						</div>
					</form>
				{/if}
			</div>
			<div>
				<form class="times" method="POST" action="?/sleepHours" use:enhance>
					{#each pair.times as [time, label, value] (time)}
						<div class="time" role="group" aria-label="{pair.heading} {label.toLowerCase()}">
							<span class="label">{label}</span>
							<div class="stepper">
								<button
									type="submit"
									name="step"
									value="{time}:-{STEP_MINUTES}"
									aria-label="{pair.heading} {label.toLowerCase()} earlier"
									disabled={!can(time, -STEP_MINUTES)}>−</button
								>
								<output class="tabular">{show(value)}</output>
								<button
									type="submit"
									name="step"
									value="{time}:{STEP_MINUTES}"
									aria-label="{pair.heading} {label.toLowerCase()} later"
									disabled={!can(time, STEP_MINUTES)}>+</button
								>
							</div>
						</div>
					{/each}
				</form>
				{#if i === 1}
					{#each limits as limit (limit)}<p class="limit">{limit}</p>{/each}
				{/if}
			</div>
		</div>
	{/each}
</section>

<style>
	/* Full width, like Household and Google, so both pairs of times fit beside their words. */
	.sleep {
		margin-top: 24px;
		padding: 8px 32px;
		border-radius: 28px;
		background: var(--card);
	}
	.part {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 48px;
		padding: 24px 0;
	}
	.part + .part {
		border-top: 2px solid var(--line);
	}
	.words {
		max-width: 640px;
	}
	h2 {
		margin: 0;
		font-size: 32px;
	}
	p {
		margin: 4px 0 0;
		color: var(--dim);
	}
	.choices {
		margin-top: 20px;
		width: max-content;
		display: flex;
		padding: 6px;
		gap: 6px;
		border-radius: 26px;
		background: var(--segment);
	}
	.choices button {
		width: 150px;
		height: 80px;
		border: 0;
		border-radius: 20px;
		background: none;
		font-size: 26px;
		font-weight: 700;
	}
	.choices button[aria-pressed='true'] {
		background: var(--selected);
	}
	.times {
		display: flex;
		gap: 56px;
	}
	.time {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
	}
	.label {
		font-size: 24px;
		font-weight: 600;
		color: var(--dim);
	}
	.stepper {
		display: flex;
		align-items: center;
		gap: 16px;
	}
	.stepper button {
		width: 88px;
		height: 88px;
		border-radius: 24px;
		border: 3px solid var(--ink);
		background: var(--card);
		font-size: 52px;
		font-weight: 700;
		line-height: 1;
	}
	.stepper button:disabled {
		color: var(--line);
		border-color: var(--line);
	}
	output {
		min-width: 170px;
		text-align: center;
		font-size: 56px;
		font-weight: 700;
	}
	.off .times {
		opacity: 0.4;
	}
	.limit {
		margin-top: 12px;
		font-size: 24px;
		font-weight: 600;
		color: var(--ink);
	}
</style>
