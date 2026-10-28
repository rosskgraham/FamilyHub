<script lang="ts">
	import Celebration from '#lib/components/Celebration.svelte';
	import ChoreLane from '#lib/components/ChoreLane.svelte';
	import UpForGrabs from '#lib/components/UpForGrabs.svelte';
	import type { OwnerId } from '#lib/household.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	let celebrating: { child: OwnerId; routine: string; stars: number } | null = $state(null);
</script>

<!-- The Chores section: a lane per child, each ticking off their own Chores, and Bonus jobs beside them. -->
<div class="chores">
<div class="lanes">
	{#each data.lanes as lane (lane.child)}
		<ChoreLane
			{lane}
			owner={data.owners[lane.child]!}
			ondone={(routine, stars) => (celebrating = { child: lane.child, routine, stars })}
		/>
	{/each}
</div>
{#if data.bonus.length > 0}
	<aside>
		<UpForGrabs jobs={data.bonus} owners={data.owners} kids={data.lanes.map((l) => l.child)} />
	</aside>
{/if}
</div>

{#if celebrating}
	<Celebration
		owner={data.owners[celebrating.child]!}
		routine={celebrating.routine}
		stars={celebrating.stars}
		onclose={() => (celebrating = null)}
	/>
{/if}

<style>
	.chores {
		flex: 1;
		min-width: 0;
		display: flex;
		gap: 24px;
	}
	aside {
		width: 528px;
		flex: none;
		display: flex;
	}
	.lanes {
		flex: 1;
		min-width: 0;
		display: flex;
		gap: 24px;
	}
</style>
