<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		open: boolean;
		/** 스크린 리더용 제목 (화면에는 children 안에서 보여 준다). */
		label: string;
		onclose?: () => void;
		children: Snippet;
	}
	let { open = $bindable(), label, onclose, children }: Props = $props();

	let el: HTMLDialogElement | undefined = $state();
	let sheet: HTMLDivElement | undefined = $state();
	let dragY = $state(0);
	let dragging = $state(false);
	let closing = $state(false);

	$effect(() => {
		if (!el) return;
		if (open && !el.open) {
			closing = false;
			dragY = 0;
			el.showModal();
		} else if (!open && el.open) {
			closing = true;
			const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
			setTimeout(
				() => {
					el?.close();
					closing = false;
					dragY = 0;
				},
				reduce ? 0 : 220
			);
		}
	});

	function close() {
		open = false;
		onclose?.();
	}

	// 손잡이를 끌어 내리면 닫힌다 (시트 높이의 30% 이상)
	let startY = 0;
	function down(e: PointerEvent) {
		dragging = true;
		startY = e.clientY;
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
	}
	function move(e: PointerEvent) {
		if (dragging) dragY = Math.max(0, e.clientY - startY);
	}
	function up() {
		if (!dragging) return;
		dragging = false;
		const h = sheet?.offsetHeight ?? 400;
		if (dragY > h * 0.3) close();
		else dragY = 0;
	}
</script>

<dialog
	bind:this={el}
	class={`bs ${closing ? 'closing' : ''}`}
	aria-label={label}
	oncancel={(e) => {
		e.preventDefault();
		close();
	}}
	onclick={(e) => e.target === el && close()}
>
	<div
		bind:this={sheet}
		class={`sheet ${dragging ? 'dragging' : ''}`}
		style={`transform: translateY(${dragY}px)`}
	>
		<button
			type="button"
			class="handle"
			aria-label="시트 닫기"
			onclick={close}
			onpointerdown={down}
			onpointermove={move}
			onpointerup={up}
			onpointercancel={up}
		>
			<span></span>
		</button>
		<div class="body">{@render children()}</div>
	</div>
</dialog>

<style>
	.bs {
		padding: 0;
		margin: auto auto 0;
		border: 0;
		background: transparent;
		width: 100%;
		max-width: 640px;
		max-height: 90dvh;
		overflow: visible;
		color: var(--md-sys-color-on-surface);
	}
	.bs::backdrop {
		background: rgb(var(--md-sys-color-shadow-rgb) / 0.32);
		animation: fade var(--md-sys-motion-spring-standard-effects-default-duration)
			var(--md-sys-motion-spring-standard-effects-default);
	}
	.sheet {
		display: flex;
		flex-direction: column;
		max-height: 90dvh;
		border-radius: var(--md-sys-shape-corner-extra-large) var(--md-sys-shape-corner-extra-large) 0 0;
		background: var(--md-sys-color-surface-container-low);
		box-shadow: var(--md-sys-elevation-level1);
		animation: rise var(--md-sys-motion-spring-expressive-spatial-default-duration)
			var(--md-sys-motion-spring-expressive-spatial-default);
		transition: transform var(--md-sys-motion-spring-expressive-spatial-default-duration)
			var(--md-sys-motion-spring-expressive-spatial-default);
	}
	.dragging {
		transition: none;
	}
	.closing .sheet {
		animation: sink 220ms var(--md-sys-motion-easing-emphasized-accelerate) forwards;
	}
	.closing::backdrop {
		opacity: 0;
		transition: opacity 220ms;
	}
	.handle {
		display: grid;
		place-items: center;
		width: 100%;
		height: 36px;
		padding: 0;
		border: 0;
		background: transparent;
		cursor: grab;
		touch-action: none;
	}
	.handle span {
		width: 32px;
		height: 4px;
		border-radius: 2px;
		background: var(--md-sys-color-on-surface-variant);
		opacity: 0.4;
	}
	.body {
		padding: 0 24px 24px;
		overflow-y: auto;
	}
	@keyframes rise {
		from {
			transform: translateY(100%);
		}
	}
	@keyframes sink {
		to {
			transform: translateY(100%);
		}
	}
	@keyframes fade {
		from {
			opacity: 0;
		}
	}
</style>
