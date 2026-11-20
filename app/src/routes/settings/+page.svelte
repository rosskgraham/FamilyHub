<script lang="ts">
	import { enhance } from '$app/forms';
	import { clock } from '#lib/clock.svelte.ts';
	import { clockFormat } from '#lib/show-time.svelte.ts';
	import { formatTime, type ClockFormat } from '#lib/time.ts';
	import type { PageProps } from './$types';

	let { form }: PageProps = $props();

	const clockChoices: { format: ClockFormat; name: string }[] = [
		{ format: '24h', name: '24-hour' },
		{ format: '12h', name: '12-hour' }
	];
</script>

<section class="settings">
	<h1>Settings</h1>

	{#if form?.message}<p class="problem">{form.message}</p>{/if}

	<!-- A tap saves straight away, and every time on the screen changes with it. -->
	<form method="POST" action="?/clock" use:enhance>
		<div class="row">
			<div>
				<h2 id="clock-heading">Clock</h2>
				<p>How times are shown, on every screen.</p>
			</div>
			<div class="choices" role="group" aria-labelledby="clock-heading">
				{#each clockChoices as choice (choice.format)}
					<button type="submit" name="clockFormat" value={choice.format} aria-pressed={clockFormat() === choice.format}>
						<span class="name">{choice.name}</span>
						<span class="example tabular">{formatTime(clock.now, choice.format)}</span>
					</button>
				{/each}
			</div>
		</div>
	</form>
</section>

<style>
	.settings {
		flex: 1;
		max-width: 1100px;
		font-size: 28px;
	}
	h1 {
		margin: 0 0 32px;
		font-size: 44px;
	}
	h2 {
		margin: 0;
		font-size: 32px;
	}
	p {
		margin: 4px 0 0;
		color: var(--dim);
	}
	.problem {
		margin: 0 0 24px;
		padding: 16px 24px;
		border-radius: 16px;
		background: var(--warn-bg);
		color: var(--warn-fg);
		font-weight: 600;
	}
	.row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 32px;
		padding: 28px 32px;
		border-radius: 28px;
		background: var(--card);
	}
	.choices {
		display: flex;
		padding: 6px;
		gap: 6px;
		border-radius: 26px;
		background: var(--segment);
	}
	.choices button {
		width: 200px;
		height: 96px;
		border: 0;
		border-radius: 20px;
		background: none;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 2px;
	}
	.choices button[aria-pressed='true'] {
		background: var(--selected);
	}
	.name {
		font-size: 26px;
		font-weight: 700;
	}
	.example {
		font-size: 22px;
		color: var(--dim);
	}
</style>
