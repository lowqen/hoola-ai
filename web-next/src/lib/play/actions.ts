// 엔진 관측 형식과 행동 문자열 도우미.
import { cardsText, cardText, rankNum, sortCards, type CardId } from '#lib/game/cards.ts';

export interface TableMeld {
	index: number;
	owner: number;
	kind: 'set' | 'run' | 'seven';
	cards: CardId[];
}

export type GameEvent =
	| { seat: number; action: string; reshuffle?: undefined }
	| { reshuffle: number; seat?: undefined; action?: undefined };

export interface Observation {
	num_players: number;
	current_player: number;
	phase: 'turn_start' | 'meld' | 'over';
	hand: CardId[];
	hand_points: number;
	hand_counts: number[];
	registered: boolean[];
	melds: TableMeld[];
	discard_top: CardId | null;
	visible_discards: CardId[];
	stock_len: number | null;
	discard_count: number;
	thank_you_target: CardId | null;
	stop_limit: number;
	events: GameEvent[];
	revealed_hands: CardId[][] | null;
}

export interface Outcome {
	reason: 'out' | 'stop-success' | 'stop-fail' | 'no-cards' | 'turn-limit';
	winners: number[];
	points: number[];
	rewards: number[];
	player?: number;
	caller?: number;
}

/** 전략서 v1 스톱 기준표: 가장 적게 든 상대의 장수 → 스톱할 최대 점수 (null = 스톱 안 함). */
export const STOP_TABLE: (number | null)[] = [null, null, 4, 8, 10, 10, 10, 10];

export function parseAction(action: string): { verb: string; cards: CardId[]; meld?: number } {
	const [verb, ...rest] = action.split(' ');
	if (verb === 'attach') return { verb, cards: [rest[0]], meld: +rest[1] };
	if (verb === 'thankyou-attach') return { verb, cards: [], meld: +rest[0] };
	return { verb, cards: rest };
}

const KIND = { set: '세트', run: '런', seven: '7' };

/** 표시 순서: 런은 순환 규칙(Q K A)을 따라 끊긴 자리에서 시작하고, 나머지는 정렬한다. */
export function meldOrder(meld: Pick<TableMeld, 'kind' | 'cards'>): CardId[] {
	const sorted = sortCards(meld.cards);
	if (meld.kind !== 'run') return sorted;
	const gap = sorted.findIndex((c, i) => {
		const next = sorted[i + 1];
		return next && rankNum(next) - rankNum(c) > 1;
	});
	return gap < 0 ? sorted : [...sorted.slice(gap + 1), ...sorted.slice(0, gap + 1)];
}

function meldLabel(obs: Observation, index: number, seatName: (s: number) => string) {
	const meld = obs.melds[index];
	if (!meld) return `#${index}`;
	return `${seatName(meld.owner)}의 ${KIND[meld.kind]} [${cardsText(meldOrder(meld))}]`;
}

export function actionText(action: string, obs: Observation, seatName: (s: number) => string) {
	const { verb, cards, meld } = parseAction(action);
	switch (verb) {
		case 'stop':
			return '스톱';
		case 'draw':
			return '받기';
		case 'thankyou':
			return `땡큐 ${cardsText(sortCards(cards))}`;
		case 'thankyou-attach':
			return `땡큐 붙이기 → ${meldLabel(obs, meld!, seatName)}`;
		case 'register':
			return `등록 ${cardsText(sortCards(cards))}`;
		case 'attach':
			return `붙이기 ${cardText(cards[0])} → ${meldLabel(obs, meld!, seatName)}`;
		case 'discard':
			return `버림 ${cardText(cards[0])}`;
		default:
			return action;
	}
}

/** 스톱 기준표로 본 판단. */
export function stopAdvice(obs: Observation, humanSeat: number) {
	const others = obs.hand_counts.filter((_, seat) => seat !== humanSeat);
	const fewest = Math.min(7, ...others);
	const limit = STOP_TABLE[fewest];
	const ok = limit !== null && obs.hand_points <= limit;
	return {
		ok,
		text: `상대 최소 ${fewest}장 → ${limit === null ? '스톱 금지' : `${limit}점 이하`} · ${ok ? '스톱 권장' : '기다림'}`
	};
}
