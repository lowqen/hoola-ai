<script lang="ts" generics="T extends string">
	import Badge from './Badge.svelte';
	import Icon from './Icon.svelte';
	import type { IconName } from './icons.ts';

	interface Destination {
		id: T;
		label: string;
		icon: IconName;
		href?: string;
		/** 숫자면 숫자 배지, true면 점 배지. */
		badge?: number | boolean;
	}
	interface Props {
		destinations: Destination[];
		active: T;
		onselect?: (id: T) => void;
		/** 페이지 고정이 아니라 부모 안에 그린다 (갤러리 미리보기용). */
		contained?: boolean;
		/** 'auto': 840px 미만 하단 바, 이상 왼쪽 레일. */
		layout?: 'auto' | 'bar' | 'rail';
	}
	let { destinations, active, onselect, contained = false, layout = 'auto' }: Props = $props();
</script>

<nav class={`nav ${layout} ${contained ? 'contained' : ''}`} aria-label="주 메뉴">
	{#each destinations as d (d.id)}
		{@const on = d.id === active}
		{#if d.href}
			<a
				href={d.href}
				class="dest"
				aria-current={on ? 'page' : undefined}
				onclick={() => onselect?.(d.id)}
			>
				<span class="pill md-state" aria-hidden="true">
					<span class="md-layer"></span>
					<Icon name={d.icon} />
					{#if d.badge}<Badge value={d.badge} />{/if}
				</span>
				<span class="label"
					>{d.label}{#if d.badge}<span class="visually-hidden"
							>, {typeof d.badge === 'number' ? `새 항목 ${d.badge}개` : '새 항목 있음'}</span
						>{/if}</span
				>
			</a>
		{:else}
			<button
				type="button"
				class="dest"
				aria-current={on ? 'page' : undefined}
				onclick={() => onselect?.(d.id)}
			>
				<span class="pill md-state" aria-hidden="true">
					<span class="md-layer"></span>
					<Icon name={d.icon} />
					{#if d.badge}<Badge value={d.badge} />{/if}
				</span>
				<span class="label"
					>{d.label}{#if d.badge}<span class="visually-hidden"
							>, {typeof d.badge === 'number' ? `새 항목 ${d.badge}개` : '새 항목 있음'}</span
						>{/if}</span
				>
			</button>
		{/if}
	{/each}
</nav>

<style>
	.nav {
		display: flex;
		background: var(--md-sys-color-surface-container);
		z-index: 20;
	}
	/* 하단 바 */
	.nav.bar,
	.nav.auto {
		position: fixed;
		left: 0;
		right: 0;
		bottom: 0;
		/* M3 Expressive 짧은 내비게이션 바: 게임 화면의 세로 공간을 아낀다 */
		height: calc(64px + env(safe-area-inset-bottom));
		padding-bottom: env(safe-area-inset-bottom);
		justify-content: space-around;
	}
	.dest {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 4px;
		min-width: 48px;
		padding: 6px 0;
		border: 0;
		background: transparent;
		color: var(--md-sys-color-on-surface-variant);
		text-decoration: none;
		font-family: var(--md-ref-typeface-plain);
		cursor: pointer;
	}
	.pill {
		position: relative;
		display: grid;
		place-items: center;
		width: 64px;
		height: 32px;
		border-radius: var(--md-sys-shape-corner-full);
		transition: background-color var(--md-sys-motion-spring-standard-effects-default-duration)
			var(--md-sys-motion-spring-standard-effects-default);
	}
	.dest:hover .pill > :global(.md-layer)::before {
		opacity: var(--md-sys-state-hover-state-layer-opacity);
	}
	.dest:focus-visible {
		outline: none;
	}
	.dest:focus-visible .pill {
		outline: 3px solid var(--md-sys-color-tertiary);
		outline-offset: 2px;
	}
	.dest[aria-current='page'] {
		color: var(--md-sys-color-on-surface);
	}
	.dest[aria-current='page'] .pill {
		background: var(--md-sys-color-secondary-container);
		color: var(--md-sys-color-on-secondary-container);
		animation: grow var(--md-sys-motion-spring-expressive-spatial-fast-duration)
			var(--md-sys-motion-spring-expressive-spatial-fast);
	}
	.label {
		font-size: var(--md-sys-typescale-label-medium-size);
		font-weight: var(--md-sys-typescale-label-medium-weight);
	}
	.dest[aria-current='page'] .label {
		font-weight: 800;
	}
	/* 레일 */
	.nav.rail {
		position: fixed;
		top: 0;
		bottom: 0;
		left: 0;
		width: 96px;
		flex-direction: column;
		justify-content: flex-start;
		padding-top: 88px;
		gap: 12px;
		background: var(--md-sys-color-surface);
	}
	.rail .dest {
		flex: none;
		padding: 4px 0;
	}
	@media (min-width: 840px) {
		.nav.auto {
			top: 0;
			bottom: 0;
			right: auto;
			width: 96px;
			height: auto;
			flex-direction: column;
			justify-content: flex-start;
			padding: 88px 0 0;
			gap: 12px;
			background: var(--md-sys-color-surface);
		}
		.auto .dest {
			flex: none;
			padding: 4px 0;
		}
	}
	.contained {
		position: absolute !important;
	}
	@keyframes grow {
		from {
			transform: scaleX(0.4);
		}
	}
</style>
