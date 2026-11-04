<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		/** 짧은 설명 (트리거의 aria-describedby로 연결된다). */
		text: string;
		children: Snippet;
	}
	let { text, children }: Props = $props();
	const id = `tip-${Math.random().toString(36).slice(2, 8)}`;
	let show = $state(false);
	let timer: ReturnType<typeof setTimeout> | null = null;
	const enter = () => {
		timer = setTimeout(() => (show = true), 400);
	};
	const leave = () => {
		if (timer) clearTimeout(timer);
		show = false;
	};
</script>

<!-- 감싼 요소에 포커스·호버가 오면 보인다. Esc로 숨긴다. -->
<span
	class="wrap"
	role="presentation"
	aria-describedby={id}
	onpointerenter={enter}
	onpointerleave={leave}
	onfocusin={() => (show = true)}
	onfocusout={leave}
	onkeydown={(e) => e.key === 'Escape' && leave()}
>
	{@render children()}
	<span {id} role="tooltip" class={`tip ${show ? 'show' : ''}`}>{text}</span>
</span>

<style>
	.wrap {
		position: relative;
		display: inline-flex;
	}
	.tip {
		position: absolute;
		left: 50%;
		bottom: calc(100% + 6px);
		z-index: 50;
		padding: 4px 8px;
		border-radius: var(--md-sys-shape-corner-extra-small);
		background: var(--md-sys-color-inverse-surface);
		color: var(--md-sys-color-inverse-on-surface);
		font-size: var(--md-sys-typescale-body-small-size);
		line-height: var(--md-sys-typescale-body-small-line-height);
		white-space: nowrap;
		pointer-events: none;
		opacity: 0;
		transform: translate(-50%, 4px);
		transition:
			opacity var(--md-sys-motion-spring-standard-effects-fast-duration)
				var(--md-sys-motion-spring-standard-effects-fast),
			transform var(--md-sys-motion-spring-standard-effects-fast-duration)
				var(--md-sys-motion-spring-standard-effects-fast);
	}
	.tip.show {
		opacity: 1;
		transform: translate(-50%, 0);
	}
</style>
