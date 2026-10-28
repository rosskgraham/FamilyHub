<script lang="ts">
	let { size = 26, filled = true }: { size?: number; filled?: boolean } = $props();
</script>

<svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? '#F5B400' : '#FFFFFF'} stroke="#8A5A00" stroke-width="1.6" stroke-linejoin="round" aria-hidden="true"
	><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg
>
