// 카드 표기와 도우미. 카드 id는 엔진과 같은 형식이다 ("TS" = 스페이드 10, "AH" = 하트 A).

export type CardId = string;
export type CardSize = 'xs' | 'sm' | 'md' | 'lg';
export type SortMode = 'suit' | 'rank';

const SUIT_ORDER = 'SHDC';
const RANK_ORDER = 'A23456789TJQK';
const SUIT_SYMBOL: Record<string, string> = { S: '♠', H: '♥', D: '♦', C: '♣' };
const SUIT_NAME: Record<string, string> = { S: '스페이드', H: '하트', D: '다이아', C: '클로버' };

/** 카드 크기(px). 컴포넌트와 손패 배치가 같은 값을 쓴다. */
export const CARD_PX: Record<CardSize, { w: number; h: number }> = {
	xs: { w: 32, h: 44 },
	sm: { w: 42, h: 58 },
	md: { w: 54, h: 76 },
	lg: { w: 64, h: 90 }
};

export const rankOf = (c: CardId) => c.slice(0, -1);
export const suitOf = (c: CardId) => c.slice(-1);
export const rankNum = (c: CardId) => RANK_ORDER.indexOf(rankOf(c)) + 1;
export const isRed = (c: CardId) => suitOf(c) === 'H' || suitOf(c) === 'D';
export const rankLabel = (c: CardId) => (rankOf(c) === 'T' ? '10' : rankOf(c));
export const suitSymbol = (c: CardId) => SUIT_SYMBOL[suitOf(c)];

/** 짧은 표기: "10♠". */
export const cardText = (c: CardId) => rankLabel(c) + suitSymbol(c);
export const cardsText = (cs: CardId[]) => cs.map(cardText).join(' ');
/** 스크린 리더용: "하트 10". */
export const cardAria = (c: CardId) => `${SUIT_NAME[suitOf(c)]} ${rankLabel(c)}`;

/** 손패 점수: A=1, 숫자 그대로, J·Q·K=11·12·13. */
export const handPoints = (cs: CardId[]) => cs.reduce((sum, c) => sum + rankNum(c), 0);

export function sortCards(cs: CardId[], mode: SortMode = 'suit'): CardId[] {
	const suit = (c: CardId) => SUIT_ORDER.indexOf(suitOf(c));
	return [...cs].sort((a, b) =>
		mode === 'suit'
			? suit(a) - suit(b) || rankNum(a) - rankNum(b)
			: rankNum(a) - rankNum(b) || suit(a) - suit(b)
	);
}
