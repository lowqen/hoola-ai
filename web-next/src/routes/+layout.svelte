<script lang="ts">
	import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
	import '#lib/theme/tokens.css';
	import '#lib/theme/base.css';
	import favicon from '#lib/assets/favicon.svg';
	import SnackbarHost from '#lib/ui/SnackbarHost.svelte';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{@render children()}
<SnackbarHost />
