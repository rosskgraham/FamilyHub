<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { chime } from '#lib/chime.ts';
	import { UP_FOR_GRABS, type BonusView, type ChoreTick } from '#lib/chores.ts';
	import type { Household, OwnerId } from '#lib/household.ts';
	import Badge from './Badge.svelte';
	import Star from './Star.svelte';

	let { jobs, owners, kids }: { jobs: BonusView[]; owners: Household; kids: OwnerId[] } = $props();

	// Changes show straight away and are undone if the Hub turns them down.
	let pending: Record<string, OwnerId | null> = $state({});
	let picking: string | null = $state(null);
	let undoing: string | null = $state(null);
	let problem: string | null = $state(null);

	const shown = $derived(jobs.map((j) => ({ ...j, doneBy: j.id in pending ? pending[j.id]! : j.doneBy })));

	async function send(job: string, child: OwnerId, ticked: boolean) {
		picking = null;
		undoing = null;
		problem = null;
		pending[job] = ticked ? child : null;
		if (ticked) chime();
		const tick: ChoreTick = { child, chore: job, routine: UP_FOR_GRABS, ticked };
		try {
			const response = await fetch('/api/chores', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(tick)
			});
			if (response.status === 409) problem = 'Someone else got there first.';
			else if (!response.ok) problem = 'That didn’t save. Try again.';
			await invalidateAll();
		} catch {
			problem = 'Couldn’t reach the Hub. Try again.';
		}
		delete pending[job];
	}
</script>

<section class="grabs" aria-labelledby="grabs-title">
	<div>
		<h2 id="grabs-title">Up for grabs</h2>
		<p class="hint">Extra Stars for whoever does it first</p>
	</div>

	{#if problem}<p class="message" role="alert">{problem}</p>{/if}

	<ul>
		{#each shown as job (job.id)}
			{@const by = job.doneBy ? owners[job.doneBy] : undefined}
			<li class:done={by}>
				<div class="job">
					<div class="about">
						<div class="name">{job.name}</div>
						<div class="earn tabular"><Star size={22} />+{job.stars}</div>
					</div>
					{#if by}
						<button
							class="by"
							style:background={by.bg}
							style:color={by.fg}
							aria-label="Done by {by.name}. Undo?"
							onclick={() => (undoing = undoing === job.id ? null : job.id)}
						>
							<Badge owner={by} size={40} />
							Done
						</button>
					{:else}
						<button class="take" aria-expanded={picking === job.id} onclick={() => (picking = picking === job.id ? null : job.id)}>
							Done it
						</button>
					{/if}
				</div>

				{#if picking === job.id && !by}
					<div class="pick" role="group" aria-label="Who did {job.name}?">
						<span class="ask">Who did it?</span>
						{#each kids as kid (kid)}
							<button class="kid" aria-label={owners[kid]!.name} onclick={() => send(job.id, kid, true)}>
								<Badge owner={owners[kid]!} size={56} />
								<span>{owners[kid]!.name}</span>
							</button>
						{/each}
					</div>
				{:else if undoing === job.id && by}
					<div class="pick">
						<span class="ask">Not done by {by.name}?</span>
						<button class="quiet" onclick={() => send(job.id, by.id, false)}>Undo</button>
						<button class="quiet" onclick={() => (undoing = null)}>Keep</button>
					</div>
				{/if}
			</li>
		{/each}
	</ul>
</section>

<style>
	.grabs {
		flex: 1;
		min-height: 0;
		box-sizing: border-box;
		display: flex;
		flex-direction: column;
		gap: 16px;
		padding: 28px;
		border-radius: 28px;
		background: var(--card);
	}
	h2 {
		margin: 0;
		font-size: 32px;
		font-weight: 700;
	}
	.hint {
		margin: 4px 0 0;
		font-size: 22px;
		color: var(--dim);
	}
	.message {
		margin: 0;
		font-size: 22px;
		font-weight: 600;
		color: #a3201a;
	}
	ul {
		flex: 1;
		min-height: 0;
		margin: 0;
		padding: 0;
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: 12px;
		/* More jobs than fit scroll, rather than being cut off. */
		overflow-y: auto;
	}
	li {
		flex: none;
		display: flex;
		flex-direction: column;
		gap: 12px;
		padding: 12px 12px 12px 20px;
		border-radius: 20px;
		background: var(--bg);
	}
	.job {
		min-height: 64px;
		display: flex;
		align-items: center;
		gap: 14px;
	}
	.about {
		flex: 1;
		min-width: 0;
	}
	.name {
		overflow: hidden;
		font-size: 28px;
		font-weight: 600;
		white-space: nowrap;
		text-overflow: ellipsis;
	}
	.done .name {
		color: var(--dim);
	}
	.earn {
		display: flex;
		align-items: center;
		gap: 4px;
		font-size: 22px;
		font-weight: 700;
		color: #5c3d00;
	}
	.take,
	.by,
	.quiet {
		height: 64px;
		flex: none;
		box-sizing: border-box;
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 0 22px;
		border-radius: 20px;
		font-size: 24px;
		font-weight: 700;
	}
	.take,
	.quiet {
		border: 2px solid var(--line);
		background: var(--card);
	}
	.by {
		padding-left: 12px;
		border: 0;
	}
	.pick {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 12px;
	}
	.ask {
		flex-basis: 100%;
		font-size: 22px;
		font-weight: 700;
	}
	.kid {
		height: 72px;
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 0 22px 0 8px;
		border: 2px solid var(--line);
		border-radius: 36px;
		background: var(--card);
		font-size: 26px;
		font-weight: 700;
	}
</style>
