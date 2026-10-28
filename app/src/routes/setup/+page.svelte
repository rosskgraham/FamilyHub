<script lang="ts">
	import Badge from '#lib/components/Badge.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const problems: Record<string, string> = {
		cancelled: 'Signing in was cancelled.',
		expired: 'Signing in took too long. Try again.',
		failed: 'Google turned the sign-in down. Check the runbook’s “If something goes wrong”.',
		ended: 'Google has ended the Hub’s sign-in. Sign in again.'
	};
	const problem = $derived(data.problem ? (problems[data.problem] ?? null) : null);
</script>

<section class="setup">
	<h1>Set up Google</h1>

	{#if problem}<p class="problem">{problem}</p>{/if}
	{#if form?.message}<p class="problem">{form.message}</p>{/if}

	{#if data.step === 'credentials'}
		<p>The Hub doesn’t have its Google credentials yet. Put <code>GOOGLE_CLIENT_ID</code> and <code>GOOGLE_CLIENT_SECRET</code> in <code>app/.env</code> and restart it.</p>
	{:else if data.step === 'sign-in'}
		<p>Sign in with the Household’s Google account. Google will warn that the app isn’t verified; that’s expected.</p>
		<a class="primary" href="/auth/google" data-sveltekit-reload>Sign in with Google</a>
	{:else}
		{#if !data.householdFromFile}
			<p class="problem">These are sample names. List the Household in <code>app/household.json</code> (copy <code>household.example.json</code>), then reload this page.</p>
		{/if}
		<p>Choose whose each Calendar is. Events show in that person’s colour.</p>
		<form method="POST" action="?/save">
			{#each data.choices as choice (choice.owner.id)}
				<label>
					<Badge owner={choice.owner} size={48} />
					<span class="who">{choice.owner.id === 'everyone' ? 'Family' : choice.owner.name}</span>
					<select name={choice.owner.id} value={choice.calendarId}>
						<option value="">Not shown</option>
						{#each data.calendars as calendar (calendar.id)}
							<option value={calendar.id}>{calendar.summary}</option>
						{/each}
					</select>
				</label>
			{/each}
			<p class="section">Choose the Google Tasks list that is the Shopping list.</p>
			<label>
				<span class="who">Shopping</span>
				<select name="shoppingList" value={data.shoppingList}>
					<option value="">Sample list</option>
					{#each data.taskLists as list (list.id)}
						<option value={list.id}>{list.title}</option>
					{/each}
				</select>
			</label>
			<div class="actions">
				<button class="primary" type="submit">{data.saved ? 'Save' : 'Save and show the calendar'}</button>
				<button class="quiet" type="submit" formaction="?/signOut">Sign out of Google</button>
			</div>
		</form>
	{/if}
</section>

<style>
	.setup {
		flex: 1;
		max-width: 1100px;
		font-size: 28px;
	}
	h1 {
		margin: 0 0 16px;
		font-size: 44px;
	}
	p {
		margin: 0 0 24px;
		color: var(--dim);
	}
	.section {
		margin: 16px 0 0;
	}
	.problem {
		padding: 16px 24px;
		border-radius: 16px;
		background: #ffddb8;
		color: #6b2e00;
		font-weight: 600;
	}
	code {
		font-size: 24px;
	}
	form {
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	label {
		display: flex;
		align-items: center;
		gap: 20px;
	}
	.who {
		width: 160px;
		font-weight: 700;
	}
	select {
		flex: 1;
		height: 64px;
		padding: 0 16px;
		border-radius: 16px;
		border: 2px solid var(--line);
		background: var(--card);
		font: inherit;
		font-size: 26px;
	}
	.actions {
		display: flex;
		gap: 16px;
		margin-top: 16px;
	}
	.primary,
	.quiet {
		height: 72px;
		padding: 0 32px;
		box-sizing: border-box;
		border-radius: 22px;
		font-size: 26px;
		font-weight: 700;
		display: inline-flex;
		align-items: center;
	}
	.primary {
		border: 0;
		background: var(--ink);
		color: #ffffff;
	}
	.quiet {
		border: 2px solid var(--line);
		background: var(--card);
	}
</style>
