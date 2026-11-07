<script lang="ts">
	// 봇이 더미에서 받은 카드처럼 앞면을 보여 주면 안 되는 비행을 그린다.
	import { ghostFlight, ghosts } from './motion.svelte.ts';
	import PlayingCard from './PlayingCard.svelte';
</script>

<div class="layer" aria-hidden="true">
	{#each ghosts as ghost (ghost.id)}
		<div class="ghost" use:ghostFlight={ghost}><PlayingCard size="xs" /></div>
	{/each}
</div>

<style>
	.layer {
		position: fixed;
		z-index: 60;
		inset: 0;
		overflow: hidden;
		pointer-events: none;
	}
	.ghost {
		position: absolute;
		will-change: transform;
	}
</style>
