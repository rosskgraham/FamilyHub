<script lang="ts">
	import type { WeatherIcon } from '#lib/weather.ts';

	let { icon }: { icon: WeatherIcon } = $props();
</script>

<!-- Line icons in the style of Feather and Lucide. -->
<svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
	{#if icon === 'sun'}
		<circle cx="12" cy="12" r="5" />
		<path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
	{:else if icon === 'moon'}
		<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
	{:else if icon === 'partly'}
		<path d="M12 2v2M4.93 4.93l1.41 1.41M20 12h2M19.07 4.93l-1.41 1.41M15.947 12.65a4 4 0 0 0-5.925-4.128" />
		<path d="M13 22H7a5 5 0 1 1 4.9-6H13a3 3 0 0 1 0 6Z" />
	{:else if icon === 'cloud'}
		<path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" />
	{:else if icon === 'fog'}
		<path d="M20 12.58A5 5 0 0 0 18 3h-1.26A8 8 0 1 0 4 11.25M4 16h16M6 20h12" />
	{:else if icon === 'rain'}
		<path d="M16 13v8M8 13v8M12 15v8M20 16.58A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15.25" />
	{:else if icon === 'snow'}
		<path d="M20 17.58A5 5 0 0 0 18 8h-1.26A8 8 0 1 0 4 16.25M8 16h.01M8 20h.01M12 18h.01M12 22h.01M16 16h.01M16 20h.01" />
	{:else}
		<path d="M19 16.9A5 5 0 0 0 18 7h-1.26a8 8 0 1 0-11.62 9" />
		<polyline points="13 11 9 17 15 17 11 23" />
	{/if}
</svg>
