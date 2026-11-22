<script lang="ts">
	// 스톱 판단: 기준표대로 스톱할지 받을지 고른다.
	import { t } from '#lib/i18n/index.ts';
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
				? `${t('상대 최소 {n}장', { n: fewest })} → ${t('스톱 금지')}`
				: `${t('상대 최소 {n}장', { n: fewest })} → ${t('{n}점 이하면 스톱', { n: limit ?? 0 })}`;
		const others = puzzle.points
			.slice(1)
			.map((p, i) => `${name(i + 1)} ${t('{n}점', { n: p })}`)
			.join(', ');
		const lines = [
			`${t('기준표: {text}', { text: rule })} → ${stop ? t('스톱') : t('기다림')}.`,
			t('학습된 추정: 지금 스톱하면 이길 확률 약 {n}%.', { n: Math.round(puzzle.estimate * 100) }),
			puzzle.truth
				? t('실제 손패: {others} → 지금 스톱했다면 이겼다.', { others })
				: t('실제 손패: {others} → 지금 스톱했다면 졌다.', { others })
		];
		if (puzzle.truth !== stop) {
			lines.push(
				t(
					'이번 한 판의 결과는 기준표와 다르지만, 기준표는 수만 판 평균으로 가장 많이 이기는 판단이다.'
				)
			);
		}
		training.answer({ ok, title: ok ? t('기준표대로') : t('기준표와 다른 판단'), lines });
	}
</script>

<p class="prompt" data-testid="t-prompt">
	<b>{t('차례 시작.')}</b>
	{t('손패')} <b>{t('{n}점', { n: puzzle.obs.hand_points })}</b>. {t('지금 스톱할까요?')}
</p>

<TrainScene obs={puzzle.obs} />

<QuestionBar>
	<Button
		variant="danger"
		size="md"
		icon="stop_circle"
		data-testid="t-stop"
		onclick={() => answer(true)}>{t('스톱')}</Button
	>
	<Button size="md" icon="playing_cards" data-testid="t-draw" onclick={() => answer(false)}
		>{t('받기')}</Button
	>
</QuestionBar>

<style>
	.prompt {
		margin: 0;
		font-size: var(--md-sys-typescale-body-medium-size);
		line-height: var(--md-sys-typescale-body-medium-line-height);
	}
</style>
