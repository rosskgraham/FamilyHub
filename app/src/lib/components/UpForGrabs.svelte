<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { chime } from '#lib/chime.ts';
	import { UP_FOR_GRABS, type BonusView, type ChoreTick } from '#lib/chores.ts';
	import type { Household, OwnerId } from '#lib/household.ts';
	import Badge from './Badge.svelte';
	import Star from './Star.svelte';

	let { jobs, owners, kids }: { jobs: BonusView[]; owners: Household; kids: OwnerId[] } = $props();

	// Changes show straight away and are undone if the Hub turns them down.
	let pending: Record<string, OwnerId[]> = $state({});
	let picking: string | null = $state(null);
	// Who did the job being picked for. Children who did it together each get its Stars.
	let chosen: OwnerId[] = $state([]);
	let undoing: string | null = $state(null);
	let problem: string | null = $state(null);

	const shown = $derived(jobs.map((j) => ({ ...j, doneBy: j.id in pending ? pending[j.id]! : j.doneBy })));

	function pick(job: string) {
		picking = picking === job ? null : job;
		chosen = [];
	}

	function choose(kid: OwnerId) {
		chosen = chosen.includes(kid) ? chosen.filter((k) => k !== kid) : [...chosen, kid];
	}

	/** "Leo", "Leo and Maya", "Leo, Maya and Sam". */
	function together(names: string[]): string {
		return names.length < 2 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
	}

	async function send(job: string, kids: OwnerId[], ticked: boolean) {
		picking = null;
		undoing = null;
		problem = null;
		pending[job] = ticked ? kids : [];
		if (ticked) chime();
		try {
			for (const child of kids) {
				const tick: ChoreTick = { child, chore: job, routine: UP_FOR_GRABS, ticked };
				const response = await fetch('/api/chores', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify(tick)
				});
				if (!response.ok) problem = 'That didn’t save. Try again.';
			}
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
		<p class="hint">Extra Stars for everyone who does it</p>
	</div>

	{#if problem}<p class="message" role="alert">{problem}</p>{/if}

	<ul>
		{#each shown as job (job.id)}
			{@const by = job.doneBy.map((id) => owners[id]!)}
			{@const names = together(by.map((o) => o.name))}
			<li class:done={by.length > 0}>
				<div class="job">
					<div class="about">
						<div class="name">{job.name}</div>
						<div class="earn tabular"><Star size={22} />+{job.stars}</div>
					</div>
					{#if by.length > 0}
						<!-- One child's colour, or a neutral one when they did it together. -->
						<button
							class="by"
							style:background={by.length === 1 ? by[0]!.bg : 'var(--soft)'}
							style:color={by.length === 1 ? by[0]!.fg : 'var(--ink)'}
							aria-label="Done by {names}. Undo?"
							onclick={() => (undoing = undoing === job.id ? null : job.id)}
						>
							<span class="badges">
								{#each by as owner (owner.id)}<Badge {owner} size={40} />{/each}
							</span>
							Done
						</button>
					{:else}
						<button class="take" aria-expanded={picking === job.id} onclick={() => pick(job.id)}>
							Done it
						</button>
					{/if}
				</div>

				{#if picking === job.id && by.length === 0}
					<div class="pick" role="group" aria-label="Who did {job.name}?">
						<span class="ask">Who did it? Pick everyone who helped.</span>
						{#each kids as kid (kid)}
							{@const owner = owners[kid]!}
							<button
								class="kid"
								aria-label={owner.name}
								aria-pressed={chosen.includes(kid)}
								style:border-color={chosen.includes(kid) ? owner.solid : null}
								style:background={chosen.includes(kid) ? owner.bg : null}
								style:color={chosen.includes(kid) ? owner.fg : null}
								onclick={() => choose(kid)}
							>
								<Badge {owner} size={56} />
								<span>{owner.name}</span>
							</button>
						{/each}
						<button class="take" disabled={chosen.length === 0} onclick={() => send(job.id, chosen, true)}>Done</button>
					</div>
				{:else if undoing === job.id && by.length > 0}
					<div class="pick">
						<span class="ask">Not done by {names}?</span>
						<button class="quiet" onclick={() => send(job.id, job.doneBy, false)}>Undo</button>
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
		/* Stays inside its column, so a long name shortens rather than widening the panel. */
		min-width: 0;
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
		color: var(--problem);
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
	/* Two lines at most, so a name still shows beside a wide Done. */
	.name {
		overflow: hidden;
		font-size: 28px;
		font-weight: 600;
		line-height: 1.15;
		display: -webkit-box;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 2;
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
		color: var(--star-fg);
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
	.badges {
		display: flex;
		gap: 4px;
	}
	.take:disabled {
		opacity: 0.4;
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
		box-sizing: border-box;
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 0 22px 0 8px;
		border: 3px solid var(--line);
		border-radius: 36px;
		background: var(--card);
		font-size: 26px;
		font-weight: 700;
	}
</style>
