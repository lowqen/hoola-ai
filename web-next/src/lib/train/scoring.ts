// 문제 화면의 채점과 설명에 쓰는 함수. 세션을 시작할 때 함께 불러온다.
import { handPoints, rankNum, suitOf, type CardId } from '#lib/game/cards.ts';
import type { Observation } from '#lib/play/actions.ts';
import type { ScoredMove } from './drills.ts';

export const seatLabel = (players: number) => (seat: number) =>
	seat === 0 ? '나' : players > 2 ? `${seat}번 상대` : '상대';

/** 1위와 확실한 차이가 없으면 맞은 수로 친다. */
export const isGoodMove = (v: ScoredMove) => !(v.gap > 2 * v.gap_se && v.gap >= 0.02);

export const sameCards = (a: CardId[], b: CardId[]) =>
	a.length === b.length && [...a].sort().join() === [...b].sort().join();

// ---------- 조각(조합 직전 카드) 분석 ----------

const RANKS = 'A23456789TJQK';
const wrapRank = (x: number) => ((((x - 1) % 13) + 13) % 13) + 1;
const cardOf = (rank: number, suit: string) => RANKS[wrapRank(rank) - 1] + suit;

/** 관측 좌석이 위치를 모르는 카드 (손패·바닥·버림패 기억 제외). */
export function unseenOf(obs: Observation): Set<CardId> {
	const seen = new Set([
		...obs.hand,
		...(obs.known_discards ?? []),
		...obs.melds.flatMap((m) => m.cards)
	]);
	const all: CardId[] = [];
	for (const suit of 'SHDC') for (const rank of RANKS) all.push(rank + suit);
	return new Set(all.filter((c) => !seen.has(c)));
}

export interface Fragment {
	kind: string;
	partner: CardId;
	outs: CardId[];
}

/** card가 손패의 다른 카드와 2장 조각을 이루면 살릴 카드가 가장 많은 조각을 돌려준다. */
export function fragmentOf(card: CardId, hand: CardId[], unseen: Set<CardId>): Fragment | null {
	const others = hand.filter((c) => c !== card);
	const rank = rankNum(card);
	const suit = suitOf(card);
	const candidates: Fragment[] = [];
	const same = others.filter((c) => rankNum(c) === rank);
	if (same.length) {
		candidates.push({
			kind: '페어를',
			partner: same[0],
			outs: [...unseen].filter((c) => rankNum(c) === rank)
		});
	}
	for (const d of [1, -1, 2, -2]) {
		const partner = others.find((c) => suitOf(c) === suit && rankNum(c) === wrapRank(rank + d));
		if (!partner) continue;
		const lo = Math.min(rank, rank + d);
		const hi = Math.max(rank, rank + d);
		const need = Math.abs(d) === 1 ? [lo - 1, hi + 1] : [lo + 1];
		const outs = need.map((x) => cardOf(x, suit)).filter((c) => c !== card && unseen.has(c));
		candidates.push({ kind: Math.abs(d) === 1 ? '연속을' : '한 칸 건너뛴 연속을', partner, outs });
	}
	candidates.sort((a, b) => b.outs.length - a.outs.length);
	return candidates.length && candidates[0].outs.length > 0 ? candidates[0] : null;
}

/** 버림 규칙 점수: 카드 점수 − 살려 줄 카드 수 × 3 (높을수록 먼저 버린다). */
export function discardScore(card: CardId, hand: CardId[], unseen: Set<CardId>) {
	const fragment = fragmentOf(card, hand, unseen);
	return handPoints([card]) - (fragment ? fragment.outs.length : 0) * 3;
}
