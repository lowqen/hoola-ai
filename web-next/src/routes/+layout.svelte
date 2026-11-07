<script lang="ts">
	import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
	import '#lib/theme/tokens.css';
	import '#lib/theme/base.css';
	// JS에 data URI로 넣지 않고 파일로 둔다
	import favicon from '#lib/assets/favicon.svg?no-inline';
	import SnackbarHost from '#lib/ui/SnackbarHost.svelte';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{@render children()}
<SnackbarHost />
