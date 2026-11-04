<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon from './Icon.svelte';
	import IconButton from './IconButton.svelte';
	import type { IconName } from './icons.ts';

	interface Props {
		open: boolean;
		headline: string;
		icon?: IconName;
		/** full: 휴대폰에서 화면 전체 (복기 같은 큰 화면). */
		fullscreen?: boolean;
		/** 바깥(스크림)을 눌러 닫기. 확인이 필요한 대화상자는 끈다. */
		dismissible?: boolean;
		onclose?: () => void;
		children: Snippet;
		actions?: Snippet;
	}
	let {
		open = $bindable(),
		headline,
		icon,
		fullscreen = false,
		dismissible = true,
		onclose,
		children,
		actions
	}: Props = $props();

	let el: HTMLDialogElement | undefined = $state();
	let closing = $state(false);
	const titleId = `dlg-${Math.random().toString(36).slice(2, 8)}`;

	$effect(() => {
		if (!el) return;
		if (open && !el.open) {
			closing = false;
			el.showModal();
		} else if (!open && el.open) {
			// 닫힘 애니메이션 후 실제로 닫는다
			closing = true;
			const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
			setTimeout(
				() => {
					el?.close();
					closing = false;
				},
				reduce ? 0 : 180
			);
		}
	});

	function requestClose() {
		open = false;
		onclose?.();
	}
	function onCancel(e: Event) {
		e.preventDefault(); // Esc: 애니메이션과 함께 닫는다
		requestClose();
	}
	function onClick(e: MouseEvent) {
		if (dismissible && e.target === el) requestClose(); // 스크림
	}
</script>

<dialog
	bind:this={el}
	class={`dlg ${fullscreen ? 'full' : ''} ${closing ? 'closing' : ''}`}
	aria-labelledby={titleId}
	oncancel={onCancel}
	onclick={onClick}
>
	<div class="surface">
		<header>
			{#if fullscreen}
				<IconButton icon="close" label="닫기" onclick={requestClose} />
			{:else if icon}
				<span class="hero"><Icon name={icon} /></span>
			{/if}
			<h2
				id={titleId}
				class={fullscreen ? 'md-typescale-title-large' : 'md-typescale-headline-small'}
			>
				{headline}
			</h2>
		</header>
		<div class="content">{@render children()}</div>
		{#if actions}<footer>{@render actions()}</footer>{/if}
	</div>
</dialog>

<style>
	.dlg {
		padding: 0;
		border: 0;
		background: transparent;
		color: var(--md-sys-color-on-surface);
		max-width: min(560px, calc(100vw - 48px));
		width: 100%;
		max-height: calc(100dvh - 48px);
		overflow: visible;
	}
	.dlg::backdrop {
		background: rgb(var(--md-sys-color-shadow-rgb) / 0.32);
		animation: fade var(--md-sys-motion-spring-standard-effects-default-duration)
			var(--md-sys-motion-spring-standard-effects-default);
	}
	.surface {
		display: flex;
		flex-direction: column;
		max-height: calc(100dvh - 48px);
		border-radius: var(--md-sys-shape-corner-extra-large);
		background: var(--md-sys-color-surface-container-high);
		box-shadow: var(--md-sys-elevation-level3);
		overflow: hidden;
		animation: enter var(--md-sys-motion-spring-expressive-spatial-default-duration)
			var(--md-sys-motion-spring-expressive-spatial-default);
	}
	.closing .surface {
		animation: exit 180ms var(--md-sys-motion-easing-emphasized-accelerate) forwards;
	}
	.closing::backdrop {
		opacity: 0;
		transition: opacity 180ms;
	}
	header {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 16px;
		padding: 24px 24px 16px;
	}
	header:not(:has(.hero)) {
		align-items: flex-start;
	}
	h2 {
		margin: 0;
	}
	.hero {
		color: var(--md-sys-color-secondary);
	}
	.content {
		padding: 0 24px;
		overflow-y: auto;
		color: var(--md-sys-color-on-surface-variant);
		font-size: var(--md-sys-typescale-body-medium-size);
		line-height: var(--md-sys-typescale-body-medium-line-height);
	}
	footer {
		display: flex;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: 8px;
		padding: 24px;
	}
	/* 전체 화면: 휴대폰은 꽉 채우고, 넓은 화면은 큰 대화상자 */
	.full {
		max-width: min(960px, 100vw);
	}
	.full header {
		flex-direction: row;
		align-items: center;
		padding: 8px 16px 8px 8px;
		gap: 8px;
	}
	.full .content {
		padding: 0 24px 24px;
		color: var(--md-sys-color-on-surface);
	}
	@media (max-width: 600px) {
		.full {
			max-width: 100vw;
			max-height: 100dvh;
			height: 100dvh;
			margin: 0;
		}
		.full .surface {
			height: 100dvh;
			max-height: 100dvh;
			border-radius: 0;
		}
	}
	@keyframes enter {
		from {
			opacity: 0;
			transform: translateY(16px) scale(0.96);
		}
	}
	@keyframes exit {
		to {
			opacity: 0;
			transform: translateY(8px) scale(0.98);
		}
	}
	@keyframes fade {
		from {
			opacity: 0;
		}
	}
</style>
