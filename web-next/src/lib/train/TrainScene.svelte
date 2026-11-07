<script lang="ts">
	// 문제 장면: 대전과 같은 장면 컴포넌트로 그린다. 끌기와 받기는 없고 카드 고르기만 있다.
	import { sortCards, type CardId } from '#lib/game/cards.ts';
	import Scene from '#lib/game/Scene.svelte';
	import { meldOrder, type Observation } from '#lib/play/actions.ts';
	import { seatLabel } from './scoring.ts';

	interface Props {
		obs: Observation;
		/** 손패 대신 보여 줄 카드 (이미 묶은 카드를 뺄 때). */
		hand?: CardId[];
		selected?: CardId[];
		ontoggle?: (card: CardId) => void;
	}
	let { obs, hand, selected = [], ontoggle }: Props = $props();

	const name = $derived(seatLabel(obs.num_players));
	const seats = $derived(
		obs.hand_counts.slice(1).map((count, i) => ({
			id: i + 1,
			name: name(i + 1),
			count,
			registered: obs.registered[i + 1]
		}))
	);
	const melds = $derived(
		obs.melds.map((m) => ({
			id: m.index,
			kind: m.kind,
			owner: name(m.owner),
			cards: meldOrder(m)
		}))
	);
</script>

<Scene
	{seats}
	turn="me"
	stockCount={obs.stock_len ?? 0}
	discard={obs.discard_top ? [obs.discard_top] : []}
	{melds}
	hand={sortCards(hand ?? obs.hand)}
	{selected}
	turnLabel={obs.phase === 'turn_start' ? '받기 전' : '받은 뒤'}
	ontoggle={(card) => ontoggle?.(card)}
/>
