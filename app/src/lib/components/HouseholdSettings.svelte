<script lang="ts">
	import { enhance } from '$app/forms';
	import { EVERYONE, type Colour, type MemberConfig } from '#lib/household.ts';
	import MemberForm from './MemberForm.svelte';

	// The Household and Google, in Settings (ADR 0012). Locked until held for a second, as it can sign the Hub out of
	// Google: enough to stop a quick tap. It locks again when Settings is left.

	interface Choice {
		id: string;
		summary?: string;
		title?: string;
	}

	let {
		household,
		choices,
		google,
		problem,
		backup,
		form
	}: {
		household: { members: MemberConfig[]; everyone: Colour };
		choices: { calendars: Record<string, string>; shoppingList: string; todoList: string; birthdays: string };
		google:
			| { step: 'credentials' }
			| { step: 'sign-in' }
			| { step: 'unreachable' }
			| { step: 'ready'; calendars: Choice[]; taskLists: Choice[] };
		problem: string | null;
		backup: { lastAt?: string | null; failingSince?: string | null; needsSignIn?: boolean } | null;
		form: { form?: string; message?: string; saved?: string } | null;
	} = $props();

	const HOLD_MS = 1000;
	let unlocked = $state(false);
	let holding = $state(false);
	let timer: ReturnType<typeof setTimeout> | undefined;
	function hold() {
		holding = true;
		clearTimeout(timer);
		timer = setTimeout(() => ((unlocked = true), (holding = false)), HOLD_MS);
	}
	function letGo() {
		holding = false;
		clearTimeout(timer);
	}

	const calendars = $derived(
		google.step === 'ready' ? google.calendars.map((c) => ({ id: c.id, summary: c.summary ?? c.id })) : null
	);
	const taskLists = $derived(google.step === 'ready' ? google.taskLists : null);
	const memberColours = $derived(household.members.map((m) => m.colour));
	const messageFor = (key: string) => (form?.form === key ? (form.message ?? null) : null);

	const problems: Record<string, string> = {
		cancelled: 'Signing in was cancelled.',
		expired: 'Signing in took too long. Try again.',
		failed: 'Google turned the sign-in down. Check the runbook’s “If something goes wrong”.',
		ended: 'Google has ended the Hub’s sign-in. Sign in again.'
	};
	const problemText = $derived(problem ? (problems[problem] ?? null) : null);
	const when = (iso: string) =>
		new Date(iso).toLocaleString('en-GB', {
			timeZone: 'Europe/London',
			weekday: 'long',
			day: 'numeric',
			month: 'long',
			hour: '2-digit',
			minute: '2-digit'
		});

	let confirmingSignOut = $state(false);
</script>

<section class="household" aria-labelledby="household-heading">
	<div class="head">
		<div>
			<h2 id="household-heading">Household and Google</h2>
			<p>Who’s in the Household, their colours and Calendars, and the Hub’s Google account.</p>
		</div>
		{#if !unlocked}
			<button
				class="hold"
				class:holding
				onpointerdown={hold}
				onpointerup={letGo}
				onpointerleave={letGo}
				onpointercancel={letGo}
				oncontextmenu={(e) => e.preventDefault()}
				onkeydown={(e) => e.key === 'Enter' && (unlocked = true)}
				aria-label="Hold to change the Household and Google"
			>
				<span class="fill" aria-hidden="true"></span>
				<span class="hold-text">Hold to change</span>
			</button>
		{:else}
			<button class="quiet" onclick={() => (unlocked = false)}>Done</button>
		{/if}
	</div>

	<div class="body" class:locked={!unlocked} inert={!unlocked}>
		{#if household.members.length === 0}
			<p class="note">The Hub is showing a made-up Household. Add the first Member to show the real one.</p>
		{/if}

		<div class="rows">
			{#each household.members as m (m.id)}
				<MemberForm
					action="?/updateMember"
					id={m.id}
					name={m.name}
					colour={m.colour}
					calendar={choices.calendars[m.id] ?? ''}
					{calendars}
					unavailable={[household.everyone]}
					removable
					message={messageFor(m.id)}
				/>
			{/each}
			<MemberForm
				action="?/family"
				fixedName="Family"
				colour={household.everyone}
				calendar={choices.calendars[EVERYONE] ?? ''}
				{calendars}
				unavailable={memberColours}
				message={messageFor(EVERYONE)}
			/>
			<MemberForm
				action="?/addMember"
				colour={null}
				{calendars}
				unavailable={[household.everyone]}
				submit="Add"
				message={messageFor('add')}
			/>
		</div>

		{#if taskLists && calendars}
			<form
				method="POST"
				action="?/lists"
				class="lists"
				use:enhance={() =>
					({ update }) =>
						update({ reset: false })}
			>
				<label>
					<span>Birthdays</span>
					<select name="birthdays" value={choices.birthdays}>
						<option value="">Not shown</option>
						{#each calendars as c (c.id)}<option value={c.id}>{c.summary}</option>{/each}
					</select>
				</label>
				<label>
					<span>Shopping</span>
					<select name="shoppingList" value={choices.shoppingList}>
						<option value="">Sample list</option>
						{#each taskLists as l (l.id)}<option value={l.id}>{l.title}</option>{/each}
					</select>
				</label>
				<label>
					<span>To-dos</span>
					<select name="todoList" value={choices.todoList}>
						<option value="">Sample To-dos</option>
						{#each taskLists as l (l.id)}<option value={l.id}>{l.title}</option>{/each}
					</select>
				</label>
				<button class="primary" type="submit">Save</button>
			</form>
		{/if}

		<div class="google">
			{#if problemText}<p class="problem">{problemText}</p>{/if}
			{#if google.step === 'credentials'}
				<p>
					The Hub doesn’t have its Google credentials yet. Put <code>GOOGLE_CLIENT_ID</code> and
					<code>GOOGLE_CLIENT_SECRET</code> in <code>app/.env</code> and restart it.
				</p>
			{:else if google.step === 'sign-in'}
				<p>Sign in with the Household’s Google account to show its Calendars, Shopping list and To-dos.</p>
				<a class="primary" href="/auth/google" data-sveltekit-reload>Sign in with Google</a>
			{:else}
				<p>
					{#if google.step === 'unreachable'}
						Google can’t be reached just now, so Calendars and lists can’t be chosen.
					{:else if backup?.needsSignIn}
						Chores backups need the Hub signed in to Google again, to add Google Drive. Sign out, then sign in.
					{:else if backup?.failingSince}
						Signed in to Google. Chores backups have been failing since {when(backup.failingSince)}.
					{:else if backup?.lastAt}
						Signed in to Google. The Hub was last backed up to Google Drive {when(backup.lastAt)}.
					{:else}
						Signed in to Google. The Hub is backed up to Google Drive every night.
					{/if}
				</p>
				<form
					method="POST"
					action="?/signOut"
					onsubmit={(e) => {
						if (!confirmingSignOut) {
							e.preventDefault();
							confirmingSignOut = true;
							setTimeout(() => (confirmingSignOut = false), 4000);
						}
					}}
				>
					<button class="quiet" class:confirming={confirmingSignOut} type="submit"
						>{confirmingSignOut ? 'Tap to sign out' : 'Sign out of Google'}</button
					>
				</form>
			{/if}
		</div>
	</div>
</section>

<style>
	.household {
		margin-top: 24px;
		padding: 28px 32px;
		border-radius: 28px;
		background: var(--card);
	}
	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 32px;
		margin-bottom: 24px;
	}
	h2 {
		margin: 0;
		font-size: 32px;
	}
	p {
		margin: 4px 0 0;
		color: var(--dim);
		font-size: 24px;
	}
	.hold {
		position: relative;
		overflow: hidden;
		width: 260px;
		height: 72px;
		border: 2px solid var(--line);
		border-radius: 22px;
		background: var(--soft);
		font-size: 24px;
		font-weight: 700;
		touch-action: none;
		user-select: none;
	}
	.fill {
		position: absolute;
		inset: 0;
		width: 0;
		background: var(--selected);
	}
	.hold.holding .fill {
		width: 100%;
		transition: width 1s linear;
	}
	.hold-text {
		position: relative;
	}
	.body.locked {
		opacity: 0.45;
	}
	.note {
		margin: 0 0 20px;
		color: var(--ink);
		font-weight: 600;
	}
	.rows {
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	.lists {
		margin-top: 28px;
		display: flex;
		align-items: center;
		gap: 20px;
	}
	.lists label {
		flex: 1;
		min-width: 0;
		display: flex;
		align-items: center;
		gap: 12px;
		font-size: 24px;
		font-weight: 700;
	}
	select {
		flex: 1;
		min-width: 0;
		height: 64px;
		padding: 0 14px;
		border-radius: 16px;
		border: 2px solid var(--line);
		background: var(--card);
		color: var(--ink);
		font: inherit;
		font-size: 22px;
	}
	.google {
		margin-top: 28px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 24px;
		flex-wrap: wrap;
	}
	.google p {
		margin: 0;
	}
	.primary,
	.quiet {
		flex: none;
		height: 64px;
		padding: 0 24px;
		box-sizing: border-box;
		border-radius: 20px;
		font-size: 24px;
		font-weight: 700;
		display: inline-flex;
		align-items: center;
	}
	.primary {
		border: 0;
		background: var(--ink);
		color: var(--on-ink);
	}
	.quiet {
		border: 2px solid var(--line);
		background: var(--card);
	}
	.quiet.confirming {
		background: var(--danger);
		border-color: var(--danger);
		color: var(--on-danger);
	}
	.problem {
		width: 100%;
		padding: 12px 20px;
		border-radius: 14px;
		background: var(--warn-bg);
		color: var(--warn-fg);
		font-weight: 600;
	}
	code {
		font-size: 22px;
	}
</style>
