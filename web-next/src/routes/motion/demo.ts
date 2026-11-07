// 모션 데모 전용 규칙과 판. 실제 판정은 D4에서 엔진이 맡는다. 여기서는 데모가 그럴듯하게 돌 만큼만 본다.
import { rankNum, suitOf, type CardId } from '#lib/game/cards.ts';
import type { MeldInfo } from '#lib/game/MeldGroup.svelte';

const wrap = (r: number) => ((r - 1 + 13) % 13) + 1;

/** 같은 무늬로 순환 연속인 순서를 찾는다 (K-A-2 허용). 런이 아니면 null. */
function runOrder(cards: CardId[]): CardId[] | null {
	if (new Set(cards.map(suitOf)).size !== 1) return null;
	const byRank = new Map(cards.map((c) => [rankNum(c), c]));
	if (byRank.size !== cards.length) return null;
	for (const start of byRank.keys()) {
		if (byRank.has(wrap(start - 1))) continue;
		const order: CardId[] = [];
		for (let r = start; byRank.has(r) && order.length < cards.length; r = wrap(r + 1)) {
			order.push(byRank.get(r)!);
		}
		if (order.length === cards.length) return order;
	}
	return null;
}

/** 새 조합이 되면 종류와 정렬한 카드를 돌려준다. */
export function asMeld(cards: CardId[]): Pick<MeldInfo, 'kind' | 'cards'> | null {
	if (cards.length === 1) return rankNum(cards[0]) === 7 ? { kind: 'seven', cards } : null;
	if (cards.length < 3) return null;
	if (new Set(cards.map(rankNum)).size === 1)
		return cards.length <= 4 ? { kind: 'set', cards } : null;
	const run = runOrder(cards);
	return run && { kind: 'run', cards: run };
}

/** 붙인 뒤의 조합. 붙일 수 없으면 null. */
export function attached(meld: MeldInfo, card: CardId): MeldInfo | null {
	const all = [...meld.cards, card];
	if (meld.kind === 'set') {
		return rankNum(card) === rankNum(meld.cards[0]) && all.length <= 4
			? { ...meld, cards: all }
			: null;
	}
	if (meld.kind === 'run') {
		const run = runOrder(all);
		return run && { ...meld, cards: run };
	}
	if (rankNum(card) === 7) return { ...meld, kind: 'set', cards: all };
	const run = runOrder(all);
	return run && { ...meld, kind: 'run', cards: run };
}

// 고정한 판: 손패로 7 단독·붙이기·세트·런을, 봇의 버림으로 땡큐를 해 볼 수 있다.
export const START_HAND: CardId[] = ['5S', '5H', '6C', '7C', '9S', 'TS', '2D'];
export const BOT_MELD: CardId[] = ['QS', 'QH', 'QC'];
const OPENING: CardId[] = ['5D', '3C', 'KC', '4C', '8S'];

export function startStock(): CardId[] {
	const used = new Set([...START_HAND, ...BOT_MELD, ...OPENING]);
	const rest: CardId[] = [];
	for (const s of 'CDHS') for (const r of 'A23456789TJQK') if (!used.has(r + s)) rest.push(r + s);
	// 고정 시드 뒤섞기: 항상 같은 순서
	let seed = 20261107;
	for (let i = rest.length - 1; i > 0; i--) {
		seed = (seed * 1664525 + 1013904223) >>> 0;
		const j = seed % (i + 1);
		[rest[i], rest[j]] = [rest[j], rest[i]];
	}
	return [...OPENING, ...rest];
}
