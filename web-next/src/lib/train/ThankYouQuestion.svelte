<script lang="ts">
	// 땡큐 찾기: 버림패 맨 위로 땡큐할 카드를 고르거나, 안 되면 받는다.
	import { onMount } from 'svelte';
	import { cardsText, cardText, handPoints, sortCards, type CardId } from '#lib/game/cards.ts';
	import { actionText, parseAction } from '#lib/play/actions.ts';
	import Button from '#lib/ui/Button.svelte';
	import type { ThankYouPuzzle } from './drills.ts';
	import { sameCards, seatLabel } from './scoring.ts';
	import QuestionBar from './QuestionBar.svelte';
	import { training } from './training.svelte.ts';
	import TrainScene from './TrainScene.svelte';

	let { puzzle }: { puzzle: ThankYouPuzzle } = $props();

	const obs = $derived(puzzle.obs);
	const target = $derived(obs.thank_you_target!);
	let selected = $state<CardId[]>([]);
	let message = $state('');

	/** 땡큐로 손패에서 덜어내는 점수. */
	const relief = (cards: CardId[]) => handPoints(cards.filter((c) => obs.hand.includes(c)));

	function toggle(card: CardId) {
		if (training.feedback) return;
		selected = selected.includes(card) ? selected.filter((c) => c !== card) : [...selected, card];
		message = '';
	}

	function explain() {
		const options = puzzle.options.map((a) => parseAction(a).cards);
		if (!options.length) {
			return [`${cardText(target)}와 내 카드 2장으로 만들 수 있는 세트나 런이 없다. 받는다.`];
		}
		const best = options.reduce((b, o) => (relief(o) > relief(b) ? o : b));
		const name = seatLabel(puzzle.players);
		return [
			`가능한 땡큐: ${puzzle.options.map((a) => actionText(a, obs, name)).join(' · ')}`,
			`가장 많이 덜어내는 땡큐: ${cardsText(sortCards(best))} (손패 −${relief(best)}점)`
		];
	}

	function draw() {
		const ok = puzzle.options.length === 0;
		training.answer({
			ok,
			title: ok ? '땡큐 불가를 알아봤다' : '땡큐 기회를 놓쳤다',
			lines: explain()
		});
	}

	function thankYou() {
		if (selected.length < 2) {
			message = '버림패 카드와 함께 등록할 내 카드를 2장 이상 고르세요';
			return;
		}
		const picked = [...selected, target];
		const ok = puzzle.options.some((a) => sameCards(parseAction(a).cards, picked));
		training.answer({
			ok,
			title: ok
				? '땡큐 성공'
				: puzzle.options.length
					? '그 카드들로는 조합이 안 된다'
					: '이 장면은 땡큐가 안 된다',
			lines: explain()
		});
	}

	onMount(() => {
		training.submit = () => (selected.length ? thankYou() : draw());
	});
</script>

<p class="prompt" data-testid="t-prompt">
	<b>차례 시작, 받기 전입니다.</b> 버림패 맨 위 <b>{cardText(target)}</b>로 땡큐할 수 있으면 함께
	등록할 <b>내 카드</b>를 고르고 땡큐, 안 되면 받기.
</p>

<TrainScene {obs} {selected} ontoggle={toggle} />

<QuestionBar {message}>
	<Button variant="tonal" size="md" icon="playing_cards" data-testid="t-draw" onclick={draw}
		>받기</Button
	>
	<Button size="md" icon="front_hand" data-testid="t-thankyou" onclick={thankYou}>땡큐</Button>
</QuestionBar>

<style>
	.prompt {
		margin: 0;
		font-size: var(--md-sys-typescale-body-medium-size);
		line-height: var(--md-sys-typescale-body-medium-line-height);
	}
</style>
