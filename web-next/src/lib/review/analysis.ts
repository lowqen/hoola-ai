// 복기 판정: 결정마다 L3 평가를 등급·이유·오답 노트 항목으로 바꾼다. 화면과 무관한 순수 함수다.
import { cardsText, cardText, handPoints, sortCards, type CardId } from '#lib/game/cards.ts';
import type { HintMove } from '#lib/engine.ts';
import {
	actionText,
	parseAction,
	STOP_TABLE,
	type GameEvent,
	type Observation,
	type Outcome
} from '#lib/play/actions.ts';
import type { ReviewSummary } from '#lib/store.ts';
import type { NotebookItem, PuzzleKind } from '#lib/train/drills.ts';
import { fragmentOf, unseenOf } from '#lib/train/scoring.ts';
import type { IconName } from '#lib/ui/icons.ts';

/** 복기 시뮬레이션 수: 숨은 패 160가지 × 수마다 끝까지 둔다. */
export const REVIEW_K = 160;

export type GradeId = 'best' | 'table' | 'good' | 'inaccuracy' | 'mistake' | 'blunder';

export interface Grade {
	id: GradeId;
	label: string;
	icon: IconName;
	/** 판정 기준 손실. 이 값 이상이면 이 등급이다. */
	min: number;
}

// 손실이 큰 등급부터 찾는다
const GRADES: Grade[] = [
	{ id: 'blunder', min: 0.1, label: '블런더', icon: 'close' },
	{ id: 'mistake', min: 0.05, label: '실수', icon: 'warning' },
	{ id: 'inaccuracy', min: 0.02, label: '부정확', icon: 'help' },
	{ id: 'good', min: 0, label: '좋음', icon: 'check' }
];
const BEST: Grade = { id: 'best', min: 0, label: '최선', icon: 'star' };
/** 스톱 기준표대로 둔 판단: 시뮬레이션과 달라도 실수로 세지 않는다. */
const TABLE: Grade = { id: 'table', min: 0, label: '기준표대로', icon: 'rule' };

export const LEGEND: Grade[] = [BEST, TABLE, GRADES[2], GRADES[1], GRADES[0]];

export type Category = 'stop' | 'thankyou' | 'meld' | 'discard' | 'other';

export const CATEGORY: Record<Category, string> = {
	stop: '스톱 판단',
	thankyou: '땡큐',
	meld: '등록·붙이기',
	discard: '버림 선택',
	other: '기타'
};

/** 실수 유형에 맞는 훈련. */
export const DRILL_OF: Partial<Record<Category, PuzzleKind>> = {
	stop: 'stop',
	thankyou: 'thankyou',
	meld: 'meld',
	discard: 'discard'
};

export interface Decision {
	index: number;
	action: string;
}

export interface ReviewContext {
	replay: string;
	decisions: Decision[];
	seat: number;
	players: number;
	seatName: (seat: number) => string;
	outcome: Outcome;
	events: GameEvent[];
	/** 오답 노트 키의 앞부분 (같은 판을 다시 복기해도 겹치지 않게). */
	key: string;
}

export interface RawItem {
	obs: Observation;
	/** 고를 수가 하나뿐이면 없다. */
	scored?: HintMove[];
}

export interface ReviewItem {
	/** 고를 수가 있었던 결정 중 몇 번째인가. */
	n: number;
	decision: Decision;
	obs: Observation;
	scored: HintMove[];
	mine: HintMove;
	best: HintMove;
	loss: number;
	grade: Grade;
	category: Category;
	lines: string[];
}

const points = (card: CardId) => handPoints([card]);
const fewestOpponent = (obs: Observation, seat: number) =>
	Math.min(7, ...obs.hand_counts.filter((_, s) => s !== seat));
const tableText = (fewest: number, limit: number | null) =>
	limit === null
		? `상대 최소 ${fewest}장 → 스톱 금지`
		: `상대 최소 ${fewest}장 → ${limit}점 이하 스톱`;

/** 이 결정이 "스톱할까 말까"의 문제이고, 내가 기준표와 같은 판단을 했는가. */
function stopTableCheck(
	obs: Observation,
	mine: string,
	best: string,
	legal: string[],
	seat: number
) {
	if (obs.phase !== 'turn_start' || !legal.includes('stop')) return null;
	const fewest = fewestOpponent(obs, seat);
	const limit = STOP_TABLE[fewest];
	const tableStop = limit !== null && obs.hand_points <= limit;
	const mineStop = mine === 'stop';
	return {
		fewest,
		limit,
		followed: mineStop === tableStop,
		aboutStop: mineStop !== (best === 'stop')
	};
}

interface ExplainContext {
	seat: number;
	seatName: (seat: number) => string;
	stopFailed: boolean;
	nextTookMyDiscard: boolean;
}

/** 내 수와 추천 수를 비교해 직관적인 이유를 만든다. */
function explain(
	obs: Observation,
	mine: HintMove,
	best: HintMove,
	ctx: ExplainContext
): { category: Category; lines: string[] } {
	const m = parseAction(mine.action);
	const b = parseAction(best.action);
	const pts = obs.hand_points;
	const fewest = fewestOpponent(obs, ctx.seat);
	const table = tableText(fewest, STOP_TABLE[fewest]);
	const name = (action: string) => actionText(action, obs, ctx.seatName);

	if (b.verb === 'stop' && m.verb !== 'stop') {
		return {
			category: 'stop',
			lines: [
				`스톱할 장면이었다. 손패 ${pts}점이고 가장 적게 든 상대가 ${fewest}장이다.`,
				`스톱 기준표(${table})에 해당한다. 기다리면 상대가 털거나 점수를 더 낮출 시간을 준다.`
			]
		};
	}
	if (m.verb === 'stop' && b.verb !== 'stop') {
		const lines = [
			`스톱이 일렀다. 손패 ${pts}점인데 가장 적게 든 상대가 ${fewest}장이라, 그 상대가 나보다 낮거나 같을 가능성이 크다 (같아도 선언자 패배).`,
			`스톱 기준표: ${table}.`
		];
		if (ctx.stopFailed) lines.push('실제로 이 스톱은 실패했다.');
		return { category: 'stop', lines };
	}
	if (b.verb === 'thankyou' && m.verb !== 'thankyou') {
		const gain = handPoints(b.cards.filter((c) => obs.hand.includes(c)));
		return {
			category: 'thankyou',
			lines: [
				`땡큐 기회를 놓쳤다: ${cardsText(sortCards(b.cards))}.`,
				`받는 대신 버림패를 가져와 바로 등록하면 손패가 ${gain}점 줄고 등록 상태가 되어 붙이기도 할 수 있었다.`
			]
		};
	}
	if (m.verb === 'thankyou' && b.verb !== 'thankyou') {
		return {
			category: 'thankyou',
			lines: [
				`이 땡큐는 손해였다. 추천: ${name(best.action)}.`,
				'가져온 조합 때문에 더 좋은 조합의 재료를 썼거나, 받기로 얻을 기회가 더 컸다.'
			]
		};
	}
	if (b.verb === 'register' && m.verb !== 'register') {
		return {
			category: 'meld',
			lines: [
				`등록할 수 있는 조합을 놓쳤다: ${cardsText(sortCards(b.cards))} (손패 −${handPoints(b.cards)}점).`,
				'조합은 생기는 즉시 내려놓는 게 유리하다. 손패 점수가 낮아져야 내 스톱이 가능해지고 상대 스톱에도 지지 않는다.'
			]
		};
	}
	if (b.verb === 'attach' && m.verb !== 'attach') {
		const card = b.cards[0];
		return {
			category: 'meld',
			lines: [
				`바닥 조합에 붙일 수 있는 ${cardText(card)}(${points(card)}점)를 놓쳤다: ${name(best.action)}.`
			]
		};
	}
	if (m.verb === 'register' && b.verb !== 'register') {
		return {
			category: 'meld',
			lines: [`이 조합은 지금 등록하지 않는 편이 나았다. 추천: ${name(best.action)}.`]
		};
	}
	if (m.verb === 'discard' && b.verb === 'discard') {
		const mc = m.cards[0];
		const bc = b.cards[0];
		const unseen = unseenOf(obs);
		const mf = fragmentOf(mc, obs.hand, unseen);
		const bf = fragmentOf(bc, obs.hand, unseen);
		const lines: string[] = [];
		if (mf && !bf) {
			lines.push(
				`${cardText(mc)}는 ${cardText(mf.partner)}와 ${mf.kind} 이루는 조합 직전 카드였다. 살려 줄 카드 ${mf.outs.length}장(${cardsText(sortCards(mf.outs))})이 아직 안 나왔다.`,
				`조합과 상관없는 ${cardText(bc)}(${points(bc)}점)를 버렸어야 했다.`
			);
		} else if (points(bc) > points(mc) && !bf) {
			lines.push(
				`${cardText(bc)}(${points(bc)}점)가 ${cardText(mc)}(${points(mc)}점)보다 무겁고 조합에도 쓰이지 않는다.`,
				'무거운 카드부터 버려야 손패 점수가 빨리 내려가 스톱이 가능해지고, 상대 스톱에도 안전하다.'
			);
		} else if (bf && mf && bf.outs.length < mf.outs.length) {
			lines.push(
				`둘 다 조합 직전 카드지만 ${cardText(mc)} 쪽 조각이 살릴 카드가 더 많다 (${mf.outs.length}장 vs ${bf.outs.length}장).`
			);
		} else if (points(bc) < points(mc)) {
			lines.push(
				`더 가벼운 ${cardText(bc)}를 버리고 ${cardText(mc)}를 남기는 편이 나았다. 남은 패와 조합될 가능성이나 다음 사람의 땡큐 가능성이 차이를 만든 장면이다.`
			);
		} else {
			lines.push(`시뮬레이션상 ${cardText(bc)}를 버리는 편이 유리했다.`);
		}
		if (ctx.nextTookMyDiscard) lines.push(`실제로 다음 사람이 버린 ${cardText(mc)}를 땡큐해 갔다.`);
		return { category: 'discard', lines };
	}
	return { category: 'other', lines: [`추천: ${name(best.action)}.`] };
}

/** 워커 결과를 복기 항목으로 만든다. 고를 수가 하나뿐이었던 결정은 뺀다. */
export function buildItems(raw: (RawItem | undefined)[], ctx: ReviewContext): ReviewItem[] {
	const actions = ctx.events.filter((e) => e.action !== undefined);
	const items: ReviewItem[] = [];
	raw.forEach((r, i) => {
		if (!r?.scored) return;
		const decision = ctx.decisions[i];
		const mine = r.scored.find((v) => v.action === decision.action);
		if (!mine) return;
		const best = r.scored[0];
		const certain = mine.gap > 2 * mine.gap_se;
		const check = stopTableCheck(
			r.obs,
			mine.action,
			best.action,
			r.scored.map((v) => v.action),
			ctx.seat
		);
		const base = { n: items.length + 1, decision, obs: r.obs, scored: r.scored, mine, best };
		if (check?.followed && check.aboutStop) {
			// 기준표대로 둔 스톱 판단은 실수로 세지 않고, 시뮬레이션 의견은 참고로만 보여 준다
			items.push({
				...base,
				loss: 0,
				grade: TABLE,
				category: 'stop',
				lines: [
					`스톱 기준표(${tableText(check.fewest, check.limit)})대로 ${mine.action === 'stop' ? '스톱했다' : '스톱하지 않았다'}. 실수로 세지 않는다.`,
					`참고: 시뮬레이션은 ${actionText(best.action, r.obs, ctx.seatName)} 쪽을 ${((best.value - mine.value) * 100).toFixed(0)}%p 높게 봤지만, 스톱 판단은 상대 손패 추정에 크게 좌우되는 장면이라 실측 기준표를 우선한다.`
				]
			});
			return;
		}
		const loss = certain ? mine.gap : 0;
		const after = actions[decision.index + 1];
		const m = parseAction(decision.action);
		const { category, lines } = explain(r.obs, mine, best, {
			seat: ctx.seat,
			seatName: ctx.seatName,
			stopFailed: ctx.outcome.reason === 'stop-fail' && i === ctx.decisions.length - 1,
			nextTookMyDiscard:
				m.verb === 'discard' &&
				after?.seat === (ctx.seat + 1) % ctx.players &&
				!!after.action?.startsWith('thankyou ') &&
				after.action.split(' ').includes(m.cards[0])
		});
		items.push({
			...base,
			loss,
			grade: mine.gap <= 1e-12 ? BEST : GRADES.find((g) => loss >= g.min)!,
			category,
			lines
		});
	});
	return items;
}

/** 저장 형식은 기존 앱과 같다 (기록 화면의 약점 집계가 쓴다). */
export function summarize(items: ReviewItem[]): ReviewSummary {
	const counts: Record<string, number> = {};
	for (const g of [BEST, TABLE, ...GRADES]) counts[g.id] = 0;
	const categories: Record<string, number> = {};
	for (const item of items) {
		counts[item.grade.id]++;
		if (item.loss > 0) categories[item.category] = (categories[item.category] ?? 0) + 1;
	}
	return {
		decisions: items.length,
		accurate: items.filter((it) => it.loss === 0).length,
		loss: items.reduce((sum, it) => sum + it.loss, 0),
		counts,
		categories
	};
}

/** 오답 노트에 넣을 확실한 실수 장면. 내 수는 보기에 반드시 들어간다. */
export function mistakesOf(items: ReviewItem[], key: string): NotebookItem[] {
	const at = new Date().toISOString();
	return items
		.filter((it) => it.loss > 0)
		.map((it) => {
			const top = it.scored.slice(0, 5);
			if (!top.some((v) => v.action === it.mine.action)) top.push(it.mine);
			return {
				key: `${key}#${it.decision.index}`,
				obs: it.obs,
				scored: top,
				mine: it.mine.action,
				best: it.best.action,
				lines: it.lines,
				category: it.category,
				loss: it.loss,
				at,
				solved: 0
			};
		});
}

/** 가장 큰 실수 (없으면 첫 결정). */
export function biggestMistake(items: ReviewItem[]): number {
	let best = 0;
	items.forEach((it, i) => {
		if (it.loss > items[best].loss) best = i;
	});
	return best;
}
