<script lang="ts">
	import ShoppingList from '#lib/components/ShoppingList.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<!-- The Shopping section: the whole list, three columns of seven before it scrolls sideways. -->
<ShoppingList items={data.shopping.items} status={data.shopping.status} rows={7} columns={3} />
