<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		title: string;
		subtitle?: string;
		/** 왼쪽 (뒤로·메뉴 아이콘 버튼). */
		navigation?: Snippet;
		/** 오른쪽 행동들 (최대 3개 권장, 나머지는 메뉴로). */
		actions?: Snippet;
		/** 스크롤하면 배경이 한 단계 진해진다 (기본: 창 스크롤 감지). */
		scrolled?: boolean;
		sticky?: boolean;
	}
	let { title, subtitle, navigation, actions, scrolled, sticky = true }: Props = $props();
	let auto = $state(false);
	$effect(() => {
		if (scrolled !== undefined) return;
		const on = () => (auto = scrollY > 4);
		on();
		addEventListener('scroll', on, { passive: true });
		return () => removeEventListener('scroll', on);
	});
	const isScrolled = $derived(scrolled ?? auto);
</script>

<header class={`bar ${isScrolled ? 'scrolled' : ''} ${sticky ? 'sticky' : ''}`}>
	{#if navigation}<div class="nav">{@render navigation()}</div>{/if}
	<div class="titles">
		<h1 class="md-typescale-title-large">{title}</h1>
		{#if subtitle}<p class="md-typescale-body-small">{subtitle}</p>{/if}
	</div>
	{#if actions}<div class="actions">{@render actions()}</div>{/if}
</header>

<style>
	.bar {
		display: flex;
		align-items: center;
		gap: 4px;
		min-height: 64px;
		padding: 8px 4px 8px 16px;
		background: var(--md-sys-color-surface);
		color: var(--md-sys-color-on-surface);
		transition: background-color var(--md-sys-motion-spring-standard-effects-default-duration)
			var(--md-sys-motion-spring-standard-effects-default);
	}
	@media (max-width: 600px) {
		.bar {
			min-height: 56px;
			padding-block: 4px;
		}
	}
	.sticky {
		position: sticky;
		top: 0;
		z-index: 10;
	}
	.scrolled {
		background: var(--md-sys-color-surface-container);
	}
	.nav {
		margin-left: -8px;
		margin-right: 4px;
	}
	.titles {
		flex: 1;
		min-width: 0;
	}
	h1 {
		margin: 0;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	p {
		margin: 0;
		color: var(--md-sys-color-on-surface-variant);
	}
	.actions {
		display: flex;
		align-items: center;
		gap: 4px;
	}
</style>
