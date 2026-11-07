<script lang="ts">
	// 하단 탐색 바로 위에 붙는 고정 영역: 훈련의 행동 바와 피드백 시트가 쓴다 (DESIGN_PLAN §5.2).
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();
</script>

<div class="dock"><div class="inner">{@render children()}</div></div>

<style>
	.dock {
		position: fixed;
		z-index: 40;
		right: 0;
		bottom: calc(64px + env(safe-area-inset-bottom));
		left: 0;
		display: flex;
		justify-content: center;
		pointer-events: none;
	}
	.inner {
		width: min(720px, 100%);
		pointer-events: auto;
	}
	@media (min-width: 840px) {
		.dock {
			bottom: 0;
			left: 96px;
		}
	}
</style>
