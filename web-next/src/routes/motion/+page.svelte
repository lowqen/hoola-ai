<script lang="ts">
	// 모션 데모 (D3): 고정된 판으로 받기·버리기·등록·붙이기·땡큐·되돌리기와 봇 행동의 모션을 본다.
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { onDestroy } from 'svelte';
	import { cardAria, cardsText, cardText, sortCards, type SortMode } from '#lib/game/cards.ts';
	import type { MeldInfo } from '#lib/game/MeldGroup.svelte';
	import { expectFrom, flyBack, scaled, setMotionSpeed } from '#lib/game/motion.svelte.ts';
	import MeldGroup from '#lib/game/MeldGroup.svelte';
	import Pile from '#lib/game/Pile.svelte';
	import PlayingCard from '#lib/game/PlayingCard.svelte';
	import Scene from '#lib/game/Scene.svelte';
	import Seat, { type SeatInfo } from '#lib/game/Seat.svelte';
	import ActionBar, { type ActionSlot, type PrimaryAction } from '#lib/ui/ActionBar.svelte';
	import Button from '#lib/ui/Button.svelte';
	import IconButton from '#lib/ui/IconButton.svelte';
	import SegmentedButton from '#lib/ui/SegmentedButton.svelte';
	import TopAppBar from '#lib/ui/TopAppBar.svelte';
	import { snackbar } from '#lib/ui/snackbar.svelte.ts';
	import { asMeld, attached, BOT_MELD, START_HAND, startStock } from './demo.ts';

	type Phase = 'draw' | 'play' | 'bot';
	interface Board {
		stock: string[];
		hand: string[];
		discard: string[];
		melds: MeldInfo[];
		seats: SeatInfo[];
		phase: Phase;
		turn: number | 'me';
		registered: boolean;
		round: number;
		nextMeld: number;
	}

	const STOCK = '[data-zone="stock"]';
	const seatZone = (id: number) => `[data-zone="seat-${id}"]`;
	const BOT_BEAT_MS = 500;

	function freshBoard(): Board {
		return {
			stock: startStock(),
			hand: sortCards(START_HAND),
			discard: ['JD'],
			melds: [],
			seats: [
				{ id: 1, name: '봇 가', count: 7, registered: false },
				{ id: 2, name: '봇 나', count: 4, registered: false }
			],
			phase: 'draw',
			turn: 'me',
			registered: false,
			round: 0,
			nextMeld: 1
		};
	}

	let board = $state(freshBoard());
	let selected = $state<string[]>([]);
	let announcement = $state('');
	let sortMode = $state<SortMode>('suit');
	let speed = $state<'normal' | 'fast'>('normal');
	/** 봇 차례를 끊는 표식: 되돌리기나 새 판이면 올라간다. */
	let generation = 0;
	let undoSnackbar: number | undefined;

	$effect(() => setMotionSpeed(speed === 'fast' ? 0.6 : 1));
	onDestroy(() => {
		generation++;
	});

	const top = $derived(board.discard.at(-1));
	const meldToMake = $derived(selected.length ? asMeld(selected) : null);
	const thankYou = $derived(
		board.phase === 'draw' && top && selected.length >= 2 ? asMeld([...selected, top]) : null
	);

	function meldsFor(card: string) {
		if (!board.registered) return [];
		return board.melds.filter((m) => attached(m, card));
	}

	function dropTargets(card: string) {
		if (board.phase !== 'play') return [];
		return ['discard', ...meldsFor(card).map((m) => `meld-${m.id}`)];
	}

	/** 지금 판을 되돌릴 수 있게 저장하고, 행동 뒤 스낵바를 띄운다. */
	function withUndo(message: string, act: () => void) {
		const before = $state.snapshot(board) as Board;
		act();
		if (undoSnackbar !== undefined) snackbar.dismiss(undoSnackbar);
		undoSnackbar = snackbar.show({
			message,
			actionLabel: '되돌리기',
			onAction: () => {
				generation++;
				board = before;
				selected = [];
				announcement = '되돌렸다';
			}
		});
	}

	function draw() {
		if (board.phase !== 'draw') return;
		const card = board.stock[0];
		expectFrom(card, STOCK);
		board.stock = board.stock.slice(1);
		board.hand = sortCards([...board.hand, card], sortMode);
		board.phase = 'play';
		selected = [];
		announcement = `${cardAria(card)}를 받았다`;
	}

	function play(card: string, zone: string): boolean {
		if (!dropTargets(card).includes(zone)) return false;
		if (zone === 'discard') {
			discard(card);
			return true;
		}
		const meld = board.melds.find((m) => `meld-${m.id}` === zone);
		const next = meld && attached(meld, card);
		if (!next) return false;
		withUndo(`${cardText(card)}를 붙였다`, () => {
			board.melds = board.melds.map((m) => (m.id === next.id ? next : m));
			board.hand = board.hand.filter((c) => c !== card);
			selected = [];
			announcement = `${cardAria(card)}를 붙였다`;
		});
		return true;
	}

	function discard(card: string) {
		withUndo(`${cardText(card)}를 버렸다`, () => {
			board.hand = board.hand.filter((c) => c !== card);
			board.discard = [...board.discard, card];
			board.phase = 'bot';
			selected = [];
			announcement = `${cardAria(card)}를 버렸다`;
		});
		void botTurns();
	}

	function addMeld(kind: MeldInfo['kind'], cards: string[], owner: string) {
		board.melds = [...board.melds, { id: board.nextMeld++, kind, owner, cards }];
	}

	function register() {
		const meld = meldToMake;
		if (!meld || board.phase !== 'play') return;
		withUndo(`${cardsText(meld.cards)} 등록`, () => {
			addMeld(meld.kind, meld.cards, '나');
			board.hand = board.hand.filter((c) => !meld.cards.includes(c));
			board.registered = true;
			selected = [];
			announcement = `${cardsText(meld.cards)}를 등록했다`;
		});
	}

	function takeThankYou() {
		const meld = thankYou;
		if (!meld) return;
		withUndo(`땡큐 ${cardsText(meld.cards)}`, () => {
			addMeld(meld.kind, meld.cards, '나');
			board.discard = board.discard.slice(0, -1);
			board.hand = board.hand.filter((c) => !meld.cards.includes(c));
			board.registered = true;
			board.phase = 'play';
			selected = [];
			announcement = `땡큐로 ${cardsText(meld.cards)}를 등록했다`;
		});
	}

	/** 스톱 없는 간단한 봇: 받고 버린다. 둘째 바퀴에 봇 나가 세트를 등록한다. */
	async function botTurns() {
		const gen = ++generation;
		const beat = () => new Promise((done) => setTimeout(done, scaled(BOT_BEAT_MS)));
		board.round++;
		for (const id of [1, 2]) {
			board.turn = id;
			const seat = () => board.seats.find((s) => s.id === id)!;
			await beat();
			if (gen !== generation) return;
			flyBack(STOCK, seatZone(id));
			board.stock = board.stock.slice(1);
			seat().count++;
			seat().last = '더미에서 받음';
			await beat();
			if (gen !== generation) return;
			if (id === 2 && board.round === 2) {
				BOT_MELD.forEach((c, i) => expectFrom(c, seatZone(id), i * 50));
				addMeld('set', [...BOT_MELD], seat().name);
				seat().count -= BOT_MELD.length;
				seat().registered = true;
				seat().last = `등록 ${cardsText(BOT_MELD)}`;
				announcement = `${seat().name}가 ${cardsText(BOT_MELD)}를 등록했다`;
				await beat();
				if (gen !== generation) return;
			}
			const card = board.stock[0];
			expectFrom(card, seatZone(id));
			board.stock = board.stock.slice(1);
			board.discard = [...board.discard, card];
			seat().count--;
			seat().last = `버림 ${cardText(card)}`;
			announcement = `${seat().name}가 ${cardAria(card)}를 버렸다`;
		}
		await beat();
		if (gen !== generation) return;
		board.turn = 'me';
		board.phase = 'draw';
		announcement = '내 차례';
	}

	function restart() {
		generation++;
		if (undoSnackbar !== undefined) snackbar.dismiss(undoSnackbar);
		board = freshBoard();
		selected = [];
		announcement = '새 판';
	}

	function resort() {
		sortMode = sortMode === 'suit' ? 'rank' : 'suit';
		board.hand = sortCards(board.hand, sortMode);
	}

	function toggle(card: string) {
		selected = selected.includes(card) ? selected.filter((c) => c !== card) : [...selected, card];
	}

	function attachSelected() {
		const targets = selected.length === 1 ? meldsFor(selected[0]) : [];
		if (targets.length === 1) play(selected[0], `meld-${targets[0].id}`);
	}

	const single = $derived(selected.length === 1 ? selected[0] : null);
	const attachTargets = $derived(single ? meldsFor(single) : []);
	const canRegister = $derived(board.phase === 'play' && !!meldToMake);
	const canAttach = $derived(board.phase === 'play' && attachTargets.length === 1);

	const slots = $derived<ActionSlot[]>([
		{
			id: 'stop',
			label: '스톱',
			icon: 'stop_circle',
			enabled: false,
			tone: 'danger',
			reason: '데모에는 스톱이 없다'
		},
		{
			id: 'thankyou',
			label: '땡큐',
			icon: 'front_hand',
			enabled: !!thankYou,
			reason: '내 차례 시작에 버림패와 조합이 되는 카드 2장 이상을 고른다',
			onclick: takeThankYou
		},
		{
			id: 'register',
			label: '등록',
			icon: 'layers',
			enabled: canRegister,
			reason: '받은 뒤 조합이 되는 카드를 고른다',
			onclick: register
		},
		{
			id: 'attach',
			label: '붙이기',
			icon: 'add',
			enabled: canAttach,
			reason:
				attachTargets.length > 1 ? '붙일 조합을 바닥에서 누른다' : '붙일 수 있는 카드 1장을 고른다',
			onclick: attachSelected
		}
	]);

	const primary = $derived<PrimaryAction>(
		board.phase === 'draw'
			? { label: '받기', icon: 'playing_cards', enabled: true, onclick: draw }
			: board.phase === 'play'
				? {
						label: '버리기',
						icon: 'arrow_forward',
						enabled: !!single,
						onclick: () => single && discard(single)
					}
				: { label: '상대 차례', icon: 'timer', enabled: false }
	);

	const preview = $derived.by(() => {
		if (thankYou) return `땡큐 ${cardsText(thankYou.cards)}`;
		if (canRegister && meldToMake) return `등록 ${cardsText(meldToMake.cards)}`;
		if (board.phase === 'play' && single) return `버리기 ${cardText(single)}`;
		return undefined;
	});

	const hint = $derived(
		board.phase === 'draw'
			? '더미를 누르거나 받기. 버림패와 조합이 되면 2장을 골라 땡큐'
			: board.phase === 'play'
				? '끌어서 버림패나 조합에 놓기, 두 번 탭하면 버리기'
				: '상대가 두는 중'
	);

	const SAMPLE_SEATS: SeatInfo[] = [
		{ id: 91, name: '여유 있는 상대', count: 7, registered: false, last: '버림 K♦' },
		{ id: 92, name: '위험한 상대', count: 3, registered: true, last: '등록 5♠ 5♥ 5♦' }
	];
	const SAMPLE_MELD: MeldInfo = {
		id: 91,
		kind: 'run',
		owner: '봇',
		cards: ['8S', '9S', 'TS', 'JS']
	};
</script>

<svelte:head>
	<title>모션 데모 · 훌라 연습장</title>
	<meta
		name="description"
		content="훌라 연습장의 카드 받기·버리기·등록·붙이기 모션과 끌기 조작을 고정된 판으로 확인한다."
	/>
</svelte:head>

<TopAppBar title="모션 데모">
	{#snippet navigation()}
		<IconButton icon="arrow_back" label="처음으로" onclick={() => goto(resolve('/(app)'))} />
	{/snippet}
	{#snippet actions()}
		<IconButton icon="replay" label="새 판" data-testid="restart" onclick={restart} />
	{/snippet}
</TopAppBar>

<main>
	<div class="controls">
		<SegmentedButton
			label="모션 속도"
			bind:value={speed}
			options={[
				{ value: 'normal', label: '보통' },
				{ value: 'fast', label: '빠르게' }
			]}
		/>
		<Button variant="outlined" size="sm" icon="swap_horiz" data-testid="sort" onclick={resort}>
			{sortMode === 'suit' ? '무늬순' : '숫자순'}
		</Button>
	</div>

	<Scene
		seats={board.seats}
		turn={board.turn}
		stockCount={board.stock.length}
		discard={board.discard}
		melds={board.melds}
		hand={board.hand}
		{selected}
		{dropTargets}
		{announcement}
		ontoggle={toggle}
		onplay={play}
		ondraw={board.phase === 'draw' ? draw : undefined}
	>
		{#snippet actions()}
			<ActionBar {slots} {primary} {preview} {hint} />
		{/snippet}
	</Scene>

	<section class="states" aria-labelledby="states-title">
		<h2 id="states-title">카드와 좌석 상태</h2>
		<div class="row felt" data-testid="sizes">
			{#each ['xs', 'sm', 'md', 'lg'] as const as size (size)}
				<PlayingCard card="TH" {size} />
			{/each}
			<PlayingCard card="AS" />
			<PlayingCard card="KD" />
			<PlayingCard card="QC" />
			<PlayingCard />
			<PlayingCard card="7H" selected />
			<PlayingCard card="4D" mark="mine" />
			<PlayingCard card="9S" mark="best" />
		</div>
		<div class="row">
			{#each SAMPLE_SEATS as seat (seat.id)}
				<Seat {seat} />
			{/each}
			<Seat seat={{ ...SAMPLE_SEATS[0], id: 93, name: '차례인 상대' }} active />
		</div>
		<div class="row felt">
			<Pile kind="stock" count={23} />
			<Pile kind="stock" count={0} />
			<MeldGroup meld={SAMPLE_MELD} />
			<MeldGroup meld={{ ...SAMPLE_MELD, id: 92, cards: ['2H', '2D', '2C'], kind: 'set' }} target />
		</div>
	</section>
</main>

<style>
	main {
		display: flex;
		flex-direction: column;
		gap: 12px;
		max-width: 720px;
		margin: 0 auto;
		padding: 8px 12px 32px;
	}
	.controls {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}
	.states {
		display: flex;
		flex-direction: column;
		gap: 12px;
		margin-top: 16px;
	}
	h2 {
		margin: 0;
		font-size: var(--md-sys-typescale-title-medium-size);
	}
	.row {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		gap: 12px;
	}
	.felt {
		padding: 12px;
		border-radius: var(--md-sys-shape-corner-large);
		background: linear-gradient(160deg, var(--hoola-color-felt-1), var(--hoola-color-felt-2));
		color: var(--hoola-color-on-felt);
	}
</style>
