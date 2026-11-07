<script lang="ts">
	// 조합 찾기: 손패에서 겹치지 않는 조합을 묶어 가장 많은 점수를 덜어낸다.
	import { onMount } from 'svelte';
	import {
		cardsText,
		handPoints,
		rankOf,
		sortCards,
		suitOf,
		type CardId
	} from '#lib/game/cards.ts';
	import { loadEngine } from '#lib/engine.ts';
	import Button from '#lib/ui/Button.svelte';
	import Chip from '#lib/ui/Chip.svelte';
	import type { MeldPuzzle } from './drills.ts';
	import QuestionBar from './QuestionBar.svelte';
	import { training } from './training.svelte.ts';
	import TrainScene from './TrainScene.svelte';

	let { puzzle }: { puzzle: MeldPuzzle } = $props();

	const obs = $derived(puzzle.obs);
	let selected = $state<CardId[]>([]);
	let groups = $state<CardId[][]>([]);
	let message = $state('');
	const used = $derived(groups.flat());
	const left = $derived(obs.hand.filter((c) => !used.includes(c)));

	function toggle(card: CardId) {
		if (training.feedback) return;
		selected = selected.includes(card) ? selected.filter((c) => c !== card) : [...selected, card];
		message = '';
	}

	async function bind() {
		if (!selected.length) {
			message = '묶을 카드를 고르세요';
			return;
		}
		const engine = await loadEngine();
		if (!engine.meldKind(selected.join(' '))) {
			message = '조합이 아니다: 같은 숫자 3장+ · 같은 무늬 연속 3장+ · 7 한 장';
			return;
		}
		groups = [...groups, selected];
		selected = [];
		message = '';
	}

	function submit() {
		const { answer } = puzzle;
		const covered = handPoints(used);
		const ok = covered === answer.covered;
		const lines = ok
			? [`덜어낸 점수 ${covered}점: 최선이다. 남는 손패 ${obs.hand_points - covered}점.`]
			: [
					`덜어낸 점수 ${covered}점 / 최선 ${answer.covered}점. 남는 손패가 ${obs.hand_points - covered}점이 아니라 ${answer.left}점이 될 수 있었다.`
				];
		if (!ok) {
			const missed = answer.melds.flat().filter((c) => !used.includes(c));
			if (missed.length) lines.push(`놓친 카드: ${cardsText(sortCards(missed))}`);
			if (answer.melds.some((m) => m.length === 1)) lines.push('7은 한 장만으로도 등록할 수 있다.');
			const wraps = answer.melds.some(
				(m) =>
					m.length >= 3 &&
					new Set(m.map(suitOf)).size === 1 &&
					m.some((c) => rankOf(c) === 'A') &&
					m.some((c) => rankOf(c) === 'K')
			);
			if (wraps) lines.push('A는 K와도 이어진다 (Q-K-A, K-A-2 순환 가능).');
		}
		training.answer({ ok, title: `${groups.length}개 묶음`, lines, bestMelds: answer.melds });
	}

	onMount(() => {
		training.submit = submit;
	});
</script>

<p class="prompt" data-testid="t-prompt">
	등록할 조합을 <b>전부</b> 묶으세요. 겹치지 않게, 손패 점수를 가장 많이 덜어내면 정답입니다.
</p>

{#if groups.length}
	<div class="groups" data-testid="t-groups">
		{#each groups as group, i (group.join())}
			<span data-testid="t-group">
				<Chip
					kind="input"
					removeLabel="묶음 풀기"
					onremove={training.feedback
						? undefined
						: () => (groups = groups.filter((_, at) => at !== i))}
				>
					{cardsText(sortCards(group))} · {handPoints(group)}점
				</Chip>
			</span>
		{/each}
	</div>
{/if}

<TrainScene {obs} hand={left} {selected} ontoggle={toggle} />

<QuestionBar {message}>
	<Button variant="tonal" size="md" icon="layers" data-testid="t-bind" onclick={bind}>묶기</Button>
	<Button size="md" icon="check" data-testid="t-submit" onclick={submit}>제출</Button>
</QuestionBar>

<style>
	.prompt {
		margin: 0;
		font-size: var(--md-sys-typescale-body-medium-size);
		line-height: var(--md-sys-typescale-body-medium-line-height);
	}
	.groups {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
</style>
