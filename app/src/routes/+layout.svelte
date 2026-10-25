<script lang="ts">
	import '../app.css';
	import favicon from '#lib/assets/favicon.svg';
	import Header from '#lib/components/Header.svelte';
	import NavBar from '#lib/components/NavBar.svelte';
	import { invalidateAll } from '$app/navigation';
	import { onMount } from 'svelte';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	// The Hub is designed at 1920×1080 and scaled to fit whatever window it's in.
	const WIDTH = 1920;
	const HEIGHT = 1080;
	let innerWidth = $state(WIDTH);
	let innerHeight = $state(HEIGHT);
	const scale = $derived(Math.min(innerWidth / WIDTH, innerHeight / HEIGHT));
	const left = $derived((innerWidth - WIDTH * scale) / 2);
	const top = $derived((innerHeight - HEIGHT * scale) / 2);

	// Check for changes every minute.
	onMount(() => {
		const timer = setInterval(() => invalidateAll(), 60_000);
		return () => clearInterval(timer);
	});
</script>

<svelte:head>
	<title>FamilyHub</title>
	<link rel="icon" href={favicon} />
</svelte:head>

<svelte:window bind:innerWidth bind:innerHeight />

<div class="stage" style:transform="translate({left}px, {top}px) scale({scale})">
	<Header weather={data.weather} />
	<main>{@render children()}</main>
	<NavBar />
</div>

<style>
	.stage {
		position: absolute;
		left: 0;
		top: 0;
		width: 1920px;
		height: 1080px;
		box-sizing: border-box;
		padding: 32px;
		display: flex;
		flex-direction: column;
		gap: 24px;
		transform-origin: 0 0;
	}
	main {
		flex: 1;
		min-height: 0;
		display: flex;
	}
</style>
