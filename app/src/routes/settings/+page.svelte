<script lang="ts">
	import { enhance } from '$app/forms';
	import { updated } from '$app/state';
	import { build } from '#lib/build.ts';
	import HouseholdSettings from '#lib/components/HouseholdSettings.svelte';
	import { showTime } from '#lib/show-time.svelte.ts';
	import { clock } from '#lib/clock.svelte.ts';
	import { clockFormat } from '#lib/show-time.svelte.ts';
	import { networkDetails, networkKind } from '#lib/network.ts';
	import { warmth, warmthNote } from '#lib/pi-temperature.ts';
	import { DEFAULT_THEME_CHOICE, type ThemeChoice } from '#lib/theme.ts';
	import { dayKey, formatDayMonth, formatDuration, formatTime, type ClockFormat } from '#lib/time.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	// "20 November, 16:23", in the clock format chosen above.
	const when = (iso: string) => `${formatDayMonth(dayKey(new Date(iso)))}, ${showTime(iso)}`;

	const clockChoices: { format: ClockFormat; name: string }[] = [
		{ format: '24h', name: '24-hour' },
		{ format: '12h', name: '12-hour' }
	];

	const themeChoices: { choice: ThemeChoice; name: string; note: string }[] = [
		{ choice: 'auto', name: 'Auto', note: 'By the sun' },
		{ choice: 'light', name: 'Light', note: 'Always' },
		{ choice: 'dark', name: 'Dark', note: 'Always' }
	];
	const themeChoice = $derived(data.themeChoice ?? DEFAULT_THEME_CHOICE);
</script>

<section class="settings">
	<h1>Settings</h1>

	{#if form && 'form' in form && form.form === 'clock'}<p class="problem">{form.message}</p>{/if}

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

	{#if form && 'form' in form && form.form === 'theme'}<p class="problem">{form.message}</p>{/if}

	<!-- Like the clock, a tap changes every screen straight away. Sleep stays dark whatever is chosen. -->
	<form method="POST" action="?/theme" use:enhance>
		<div class="row">
			<div>
				<h2 id="theme-heading">Theme</h2>
				<p>Auto is light from sunrise and dark after sunset.</p>
			</div>
			<div class="choices" role="group" aria-labelledby="theme-heading">
				{#each themeChoices as choice (choice.choice)}
					<button type="submit" name="theme" value={choice.choice} aria-pressed={themeChoice === choice.choice}>
						<span class="name">{choice.name}</span>
						<span class="example">{choice.note}</span>
					</button>
				{/each}
			</div>
		</div>
	</form>

	<HouseholdSettings
		household={data.household}
		choices={data.choices}
		google={data.google}
		nest={data.nest}
		problem={data.problem}
		backup={data.backup}
		form={form ?? null}
	/>

	<!-- What's running, to check a release reached the Pi. The values change with every build, so the screenshot tests
	     cover them up. -->
	<section class="about" aria-labelledby="about-heading">
		<h2 id="about-heading">About this Hub</h2>
		<dl>
			<dt>Version</dt>
			<dd class="varies">{build.release ? build.version : 'Development build'}</dd>
			{#if build.commit}
				<dt>Commit</dt>
				<dd class="varies tabular">{build.commit}</dd>
			{/if}
			<dt>Built</dt>
			<dd class="varies">{when(build.builtAt)}</dd>
			<dt>Running since</dt>
			<dd class="varies">
				{when(data.server.startedAt)} · {formatDuration(new Date(data.server.startedAt), clock.now)}
			</dd>
			<dt>Node.js</dt>
			<dd class="varies">{data.server.node}</dd>
			<dt>Temperature</dt>
			<!-- Only the Pi has one to read. A dev server runs on the PC, even when pi:dev shows it on the wall. -->
			{#if !data.server.temperature}
				<dd class="none">Only shown on the Pi</dd>
			{:else}
				{@const t = data.server.temperature}
				<dd>
					<span class="tabular">{t.now.toFixed(1)} °C</span> · highest since starting
					<span class="tabular">{t.highest.toFixed(1)} °C</span>
					<span class="warmth {warmth(t.highest)}">{warmthNote[warmth(t.highest)]}</span>
				</dd>
			{/if}
			<dt>Network</dt>
			<!-- Like the temperature, only the Pi (or Linux) has one to read. -->
			{#if !data.server.network}
				<dd class="none">Only shown on the Pi</dd>
			{:else}
				{@const n = data.server.network}
				<dd class:offline={n.kind === 'none'}>
					{networkKind(n)}
					{#if networkDetails(n)}<span class="detail">{networkDetails(n)}</span>{/if}
				</dd>
			{/if}
		</dl>
		{#if updated.current}
			<p class="update">A new version is installed. It loads once the Hub has been left alone for two minutes.</p>
		{/if}
	</section>
</section>

<style>
	/* Taller than the screen with the Household, so it scrolls above the bottom bar. */
	.settings {
		flex: 1;
		min-width: 0;
		overflow-y: auto;
		font-size: 28px;
	}
	.settings > :global(form),
	.settings > .about {
		max-width: 1100px;
	}
	.settings > form + form,
	.settings > form + .problem {
		margin-top: 24px;
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
	.about {
		margin-top: 24px;
		padding: 28px 32px;
		border-radius: 28px;
		background: var(--card);
	}
	dl {
		margin: 16px 0 0;
		display: grid;
		grid-template-columns: 240px 1fr;
		gap: 10px 24px;
		font-size: 26px;
	}
	dt {
		color: var(--dim);
	}
	dd {
		margin: 0;
		font-weight: 600;
	}
	.none {
		font-weight: 400;
		color: var(--dim);
	}
	.warmth,
	.detail {
		display: block;
		font-size: 24px;
		font-weight: 400;
		color: var(--dim);
	}
	.warmth.hot,
	.offline {
		color: var(--problem);
	}
	.update {
		margin: 20px 0 0;
		font-size: 24px;
		font-weight: 600;
		color: var(--ink);
	}
	.example {
		font-size: 22px;
		color: var(--dim);
	}
</style>
