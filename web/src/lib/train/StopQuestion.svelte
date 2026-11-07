<script lang="ts">
	// 스톱 판단: 기준표대로 스톱할지 받을지 고른다.
	import Button from '#lib/ui/Button.svelte';
	import type { StopPuzzle } from './drills.ts';
	import { seatLabel } from './scoring.ts';
	import QuestionBar from './QuestionBar.svelte';
	import { training } from './training.svelte.ts';
	import TrainScene from './TrainScene.svelte';

	let { puzzle }: { puzzle: StopPuzzle } = $props();

	function answer(stopped: boolean) {
		const { fewest, limit, stop } = puzzle.table;
		const ok = stopped === stop;
		const name = seatLabel(puzzle.players);
		const rule =
			limit === null
				? `상대 최소 ${fewest}장 → 스톱 금지`
				: `상대 최소 ${fewest}장 → ${limit}점 이하면 스톱`;
		const others = puzzle.points
			.slice(1)
			.map((p, i) => `${name(i + 1)} ${p}점`)
			.join(', ');
		const lines = [
			`기준표: ${rule} → ${stop ? '스톱' : '기다림'}.`,
			`학습된 추정: 지금 스톱하면 이길 확률 약 ${Math.round(puzzle.estimate * 100)}%.`,
			`실제 손패: ${others} → 지금 스톱했다면 ${puzzle.truth ? '이겼다' : '졌다'}.`
		];
		if (puzzle.truth !== stop) {
			lines.push(
				'이번 한 판의 결과는 기준표와 다르지만, 기준표는 수만 판 평균으로 가장 많이 이기는 판단이다.'
			);
		}
		training.answer({ ok, title: ok ? '기준표대로' : '기준표와 다른 판단', lines });
	}
</script>

<p class="prompt" data-testid="t-prompt">
	<b>차례 시작.</b> 손패 <b>{puzzle.obs.hand_points}점</b>. 지금 스톱할까요?
</p>

<TrainScene obs={puzzle.obs} />

<QuestionBar>
	<Button
		variant="danger"
		size="md"
		icon="stop_circle"
		data-testid="t-stop"
		onclick={() => answer(true)}>스톱</Button
	>
	<Button size="md" icon="playing_cards" data-testid="t-draw" onclick={() => answer(false)}
		>받기</Button
	>
</QuestionBar>

<style>
	.prompt {
		margin: 0;
		font-size: var(--md-sys-typescale-body-medium-size);
		line-height: var(--md-sys-typescale-body-medium-line-height);
	}
</style>
