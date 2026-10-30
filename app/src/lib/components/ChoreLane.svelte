<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import type { ChoreLane, ChoreTick } from '#lib/chores.ts';
	import type { Owner } from '#lib/household.ts';
	import Badge from './Badge.svelte';
	import ChoreIcon from './ChoreIcon.svelte';
	import Star from './Star.svelte';

	let {
		lane,
		owner,
		ondone
	}: {
		lane: ChoreLane;
		owner: Owner;
		/** A Routine has just been finished. */
		ondone: (routine: string, stars: number) => void;
	} = $props();

	// Ticks show straight away and are undone if the Hub turns them down.
	let pending: Record<string, boolean> = $state({});
	let problem: string | null = $state(null);

	const groups = $derived(
		lane.groups.map((g) => {
			const chores = g.chores.map((c) => ({ ...c, ticked: pending[`${g.routine.id}/${c.id}`] ?? c.ticked }));
			const done = chores.filter((c) => c.ticked).length;
			return { ...g, chores, done, finished: done === chores.length };
		})
	);
	const stars = $derived(
		lane.stars +
			lane.groups
				.flatMap((g) => g.chores.map((c) => ({ c, now: pending[`${g.routine.id}/${c.id}`] })))
				.reduce((sum, { c, now }) => sum + (now === undefined || now === c.ticked ? 0 : now ? c.stars : -c.stars), 0)
	);

	// One Routine is open at a time: the one whose time it is, unless another is tapped.
	let chosen: string | null = $state(null);
	const open = $derived(
		chosen ?? (groups.find((g) => g.now) ?? groups.find((g) => !g.finished) ?? groups[0])?.routine.id
	);
	const openGroup = $derived(groups.find((g) => g.routine.id === open));
	const progress = $derived(
		openGroup ? `${openGroup.routine.name}: ${openGroup.finished ? 'all done' : `${openGroup.done} of ${openGroup.chores.length} done`}` : ''
	);

	async function toggle(routine: string, chore: { id: string; ticked: boolean }) {
		const group = groups.find((g) => g.routine.id === routine)!;
		const ticked = !chore.ticked;
		const finishing = ticked && group.done === group.chores.length - 1;
		pending[`${routine}/${chore.id}`] = ticked;
		problem = null;
		if (finishing) ondone(group.routine.name, group.chores.reduce((sum, c) => sum + c.stars, 0));
		const tick: ChoreTick = { child: lane.child, chore: chore.id, routine, ticked };
		try {
			const response = await fetch('/api/chores', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(tick)
			});
			if (!response.ok) problem = 'That didn’t save. Try again.';
			await invalidateAll();
		} catch {
			problem = 'Couldn’t reach the Hub. Try again.';
		}
		delete pending[`${routine}/${chore.id}`];
	}
</script>

<section class="lane" aria-label="{owner.name}’s Chores">
	<div class="head">
		<Badge {owner} size={72} />
		<div class="who">
			<div class="name">{owner.name}</div>
			<div class="progress">{progress}</div>
		</div>
		<div class="stars tabular" aria-label="{stars} Stars"><Star size={32} />{stars}</div>
	</div>

	{#if problem}<p class="message" role="alert">{problem}</p>{/if}

	{#each groups as group (group.routine.id)}
		{#if group.routine.id === open}
			<div class="group">
				<div class="group-head">
					<h3>{group.routine.name}</h3>
					{#if group.finished}
						<span class="chip done" style:background={owner.solid} style:color={owner.on}>
							<svg width="18" height="18" viewBox="0 0 24 24" fill="none" style:stroke={owner.on} stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg>
							All done
						</span>
					{:else if group.now}
						<span class="chip now">Now</span>
					{:else if group.later}
						<span class="when">From {group.routine.from}</span>
					{/if}
				</div>
				<ul>
					{#each group.chores as chore (chore.id)}
						<li>
							<button
								class="chore"
								style:background={chore.ticked ? owner.bg : null}
								style:color={chore.ticked ? owner.fg : null}
								aria-pressed={chore.ticked}
								aria-label="{chore.ticked ? 'Untick' : 'Tick off'} {chore.name}"
								onclick={() => toggle(group.routine.id, chore)}
							>
								<span class="box" style:border-color={chore.ticked ? owner.solid : null} style:background={chore.ticked ? owner.solid : null}>
									{#if chore.ticked}
										<svg width="32" height="32" viewBox="0 0 24 24" fill="none" style:stroke={owner.on} stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg>
									{/if}
								</span>
								<ChoreIcon icon={chore.icon} />
								<span class="text">{chore.name}</span>
								<span class="earn tabular"><Star filled={chore.ticked} />+{chore.stars}</span>
							</button>
						</li>
					{/each}
				</ul>
			</div>
		{:else}
			<button class="folded" onclick={() => (chosen = group.routine.id)}>
				<span class="folded-name">{group.routine.name}</span>
				<span class="summary">
					{group.finished ? 'All done' : group.done > 0 ? `${group.done} of ${group.chores.length} done` : `${group.chores.length} ${group.chores.length === 1 ? 'job' : 'jobs'}`}
				</span>
				{#if group.later}<span class="when">From {group.routine.from}</span>{/if}
			</button>
		{/if}
	{/each}
</section>

<style>
	.lane {
		flex: 1 1 0;
		min-width: 0;
		box-sizing: border-box;
		display: flex;
		flex-direction: column;
		gap: 14px;
		padding: 24px;
		border-radius: 28px;
		background: var(--card);
	}
	.head {
		height: 80px;
		flex: none;
		display: flex;
		align-items: center;
		gap: 20px;
	}
	.who {
		flex: 1;
		min-width: 0;
	}
	.name {
		font-size: 44px;
		font-weight: 700;
		line-height: 1.1;
	}
	.progress {
		margin-top: 2px;
		font-size: 24px;
		color: var(--dim);
	}
	.stars {
		height: 56px;
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 0 20px 0 14px;
		border-radius: 28px;
		background: var(--star-bg);
		color: var(--star-fg);
		font-size: 30px;
		font-weight: 700;
	}
	.message {
		margin: 0;
		font-size: 22px;
		font-weight: 600;
		color: var(--problem);
	}
	.group {
		/* Shrinks, so its list scrolls, only when the lane is full. */
		flex: 0 1 auto;
		min-height: 0;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.group-head {
		height: 36px;
		flex: none;
		display: flex;
		align-items: center;
		gap: 12px;
	}
	h3 {
		margin: 0;
		font-size: 28px;
		font-weight: 700;
	}
	.chip {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 3px 12px;
		border-radius: 14px;
		font-size: 20px;
		font-weight: 700;
		color: var(--on-ink);
	}
	.now {
		background: var(--ink);
	}
	.done {
		padding-left: 8px;
	}
	.when {
		font-size: 22px;
		font-weight: 600;
		color: var(--dim);
	}
	ul {
		flex: 1;
		min-height: 0;
		margin: 0;
		padding: 0;
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: 10px;
		/* More Chores than fit scroll, rather than being cut off. */
		overflow-y: auto;
	}
	.chore {
		width: 100%;
		height: 72px;
		box-sizing: border-box;
		display: flex;
		align-items: center;
		gap: 18px;
		padding: 0 20px 0 12px;
		border: 0;
		border-radius: 20px;
		background: var(--bg);
		color: var(--ink);
		text-align: left;
	}
	.box {
		width: 52px;
		height: 52px;
		flex: none;
		box-sizing: border-box;
		display: flex;
		align-items: center;
		justify-content: center;
		border: 3px solid var(--box);
		border-radius: 14px;
		background: var(--card);
	}
	.text {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		font-size: 32px;
		font-weight: 600;
		white-space: nowrap;
		text-overflow: ellipsis;
	}
	.earn {
		flex: none;
		display: flex;
		align-items: center;
		gap: 4px;
		font-size: 26px;
		font-weight: 700;
	}
	.folded {
		height: 64px;
		flex: none;
		box-sizing: border-box;
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 0 20px;
		border: 2px dashed var(--line);
		border-radius: 20px;
		background: none;
		text-align: left;
	}
	.folded-name {
		font-size: 28px;
		font-weight: 700;
	}
	.summary {
		flex: 1;
		font-size: 24px;
		color: var(--dim);
	}
</style>
