<script lang="ts">
	// 앱 셸: 대전·훈련·기록 3개 목적지 (DESIGN_PLAN §6.2). 휴대폰은 하단 바, 태블릿·PC는 레일.
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import AppNav from '#lib/ui/AppNav.svelte';
	import { snackbar } from '#lib/ui/snackbar.svelte.ts';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	const active = $derived(
		page.route.id?.endsWith('/train')
			? 'train'
			: page.route.id?.endsWith('/records')
				? 'records'
				: 'play'
	);

	$effect(() => {
		snackbar.placement = active === 'play' ? 'top' : 'nav';
		return () => {
			snackbar.placement = 'default';
		};
	});
</script>

<div class="content">{@render children()}</div>
<AppNav
	{active}
	destinations={[
		{ id: 'play', label: '대전', icon: 'playing_cards', href: resolve('/(app)') },
		{ id: 'train', label: '훈련', icon: 'school', href: `${resolve('/(app)/train')}/` },
		{ id: 'records', label: '기록', icon: 'bar_chart', href: `${resolve('/(app)/records')}/` }
	]}
/>

<style>
	.content {
		padding-bottom: calc(64px + env(safe-area-inset-bottom));
	}
	@media (min-width: 840px) {
		.content {
			padding-left: 96px;
			padding-bottom: 0;
		}
	}
</style>
