<script lang="ts">
	// 오답 노트: 예전에 틀린 장면에서 최선의 수를 보기 중에 고른다. 두 번 맞히면 노트에서 빠진다.
	import { onMount } from 'svelte';
	import { actionText } from '#lib/play/actions.ts';
	import Button from '#lib/ui/Button.svelte';
	import type { NotebookItem, ScoredMove } from './drills.ts';
	import { isGoodMove, seatLabel } from './scoring.ts';
	import { training } from './training.svelte.ts';
	import TrainScene from './TrainScene.svelte';

	let { puzzle }: { puzzle: NotebookItem } = $props();

	const obs = $derived(puzzle.obs);
	const name = $derived(seatLabel(puzzle.obs.num_players));
	// 보기 순서는 문제를 열 때 한 번만 섞는다
	const options = $derived([...puzzle.scored].sort(() => Math.random() - 0.5));

	function choose(move: ScoredMove) {
		if (training.feedback) return;
		const ok = isGoodMove(move);
		const ranked = [...puzzle.scored].sort((a, b) => b.value - a.value);
		training.answer({
			ok,
			title: ok ? '이번엔 맞혔다' : '다시 틀렸다',
			lines: [
				ok
					? '최선이거나 최선과 확실한 차이가 없는 수다.'
					: `최선은 ${actionText(puzzle.best, obs, name)}.`,
				...(puzzle.lines ?? [])
			],
			bars: ranked.slice(0, 6).map((v, i) => ({
				text: actionText(v.action, obs, name),
				percent: v.value * 100,
				mine: v.action === move.action,
				best: i === 0
			}))
		});
	}

	onMount(() => {
		training.choose = (index) => {
			if (options[index]) choose(options[index]);
		};
	});
</script>

<p class="prompt" data-testid="t-prompt">
	<b>오답 노트.</b> 예전에 틀린 장면이다. 최선의 수를 고르세요.
</p>

<TrainScene {obs} />

<div class="options" role="group" aria-label="보기" data-testid="t-options">
	{#each options as move, i (move.action)}
		<Button
			wide
			variant="tonal"
			disabled={!!training.feedback}
			data-testid="t-option"
			onclick={() => choose(move)}>{i + 1}. {actionText(move.action, obs, name)}</Button
		>
	{/each}
</div>

<style>
	.prompt {
		margin: 0;
		font-size: var(--md-sys-typescale-body-medium-size);
		line-height: var(--md-sys-typescale-body-medium-line-height);
	}
	.options {
		display: grid;
		gap: 8px;
	}
</style>
