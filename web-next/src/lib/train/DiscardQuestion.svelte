<script lang="ts">
	// 버릴 카드: 등록·붙이기가 끝난 장면에서 한 장을 고른다. 규칙 점수와 시뮬레이션을 함께 보여 준다.
	import { onMount } from 'svelte';
	import { cardText, handPoints, sortCards, type CardId } from '#lib/game/cards.ts';
	import { actionText, parseAction } from '#lib/play/actions.ts';
	import Button from '#lib/ui/Button.svelte';
	import type { DiscardPuzzle } from './drills.ts';
	import { discardScore, fragmentOf, isGoodMove, seatLabel, unseenOf } from './scoring.ts';
	import QuestionBar from './QuestionBar.svelte';
	import { training } from './training.svelte.ts';
	import TrainScene from './TrainScene.svelte';

	let { puzzle }: { puzzle: DiscardPuzzle } = $props();

	const obs = $derived(puzzle.obs);
	let pick = $state<CardId | null>(null);
	let message = $state('');

	function toggle(card: CardId) {
		if (training.feedback) return;
		pick = pick === card ? null : card;
		message = '';
	}

	function submit() {
		if (!pick) {
			message = '버릴 카드를 고르세요';
			return;
		}
		const chosen = pick;
		const { scored } = puzzle;
		const mine = scored.find((v) => v.action === `discard ${chosen}`);
		const ok = mine ? isGoodMove(mine) : false;
		const best = parseAction(scored[0].action).cards[0];
		const unseen = unseenOf(obs);
		const points = (c: CardId) => handPoints([c]);
		const rows = sortCards(obs.hand)
			.map((card) => ({
				card,
				points: points(card),
				outs: fragmentOf(card, obs.hand, unseen)?.outs.length ?? 0,
				score: discardScore(card, obs.hand, unseen),
				mine: card === chosen,
				best: card === best
			}))
			.sort((a, b) => b.score - a.score || b.points - a.points); // 동점이면 무거운 카드부터
		const ruleBest = rows[0].card;

		const lines: string[] = [];
		if (ok) {
			lines.push(
				chosen === best
					? `${cardText(chosen)}: 최선이다.`
					: `${cardText(chosen)}: 최선(${cardText(best)})과 확실한 차이가 없다.`
			);
		} else {
			lines.push(
				`${cardText(chosen)}보다 ${cardText(best)}를 버리는 편이 추정 승률 ${((mine?.gap ?? 0) * 100).toFixed(1)}%p 높다.`
			);
			const fragment = fragmentOf(chosen, obs.hand, unseen);
			if (fragment) {
				lines.push(
					`${cardText(chosen)}는 ${cardText(fragment.partner)}와 ${fragment.kind} 이루는 조합 직전 카드였다 (살릴 카드 ${fragment.outs.length}장 남음).`
				);
			}
			if (points(best) > points(chosen)) {
				lines.push(`${cardText(best)}(${points(best)}점)가 더 무겁다. 무거운 카드부터 버린다.`);
			}
		}
		lines.push(
			ruleBest === best
				? `규칙(점수 − 살릴 카드 수×3, 동점이면 무거운 카드)으로도 ${cardText(ruleBest)}가 1위다.`
				: `규칙 1위는 ${cardText(ruleBest)}지만, 이 장면은 시뮬레이션이 ${cardText(best)}를 더 높게 본다 (남은 패와의 연결·상대 땡큐 가능성 차이).`
		);
		const name = seatLabel(puzzle.players);
		training.answer({
			ok,
			title: ok ? '좋은 버림' : '더 나은 버림이 있다',
			lines,
			rule: rows,
			bars: scored.slice(0, 6).map((v, i) => ({
				text: actionText(v.action, obs, name),
				percent: v.value * 100,
				mine: v.action === `discard ${chosen}`,
				best: i === 0
			}))
		});
	}

	onMount(() => {
		training.submit = submit;
	});
</script>

<p class="prompt" data-testid="t-prompt">
	<b>등록·붙이기는 끝났다.</b> 버릴 카드 1장을 고르세요.
</p>

<TrainScene {obs} selected={pick ? [pick] : []} ontoggle={toggle} />

<QuestionBar {message}>
	<Button size="md" icon="arrow_forward" data-testid="t-submit" onclick={submit}>버리기</Button>
</QuestionBar>

<style>
	.prompt {
		margin: 0;
		font-size: var(--md-sys-typescale-body-medium-size);
		line-height: var(--md-sys-typescale-body-medium-line-height);
	}
</style>
