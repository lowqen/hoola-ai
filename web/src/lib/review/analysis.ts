// 복기 판정: 결정마다 L3 평가를 등급·이유·오답 노트 항목으로 바꾼다. 화면과 무관한 순수 함수다.
import {
	cardsText,
	cardText,
	handPoints,
	rankNum,
	sortCards,
	suitOf,
	type CardId
} from '#lib/game/cards.ts';
import type { HintMove } from '#lib/engine.ts';
import {
	actionText,
	parseAction,
	stopTableFor,
	type GameEvent,
	type Observation,
	type Outcome
} from '#lib/play/actions.ts';
import type { ReviewSummary } from '#lib/store.ts';
import type { NotebookItem } from '#lib/train/drills.ts';
import type { Category } from './categories.ts';
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
	const limit = stopTableFor(obs.stop_limit)[fewest];
	const tableStop = limit !== null && obs.hand_points <= limit;
	const mineStop = mine === 'stop';
	return {
		fewest,
		limit,
		followed: mineStop === tableStop,
		aboutStop: mineStop !== (best === 'stop')
	};
}

const pct = (v: number) => `${Math.round(v * 100)}%`;
const pp = (v: number) => `${Math.round(v * 100)}%p`;
const RANKS = 'A23456789TJQK';
const wrap = (x: number) => ((((x - 1) % 13) + 13) % 13) + 1;
const cardAt = (rank: number, suit: string) => RANKS[wrap(rank) - 1] + suit;

/** 다음 사람이 이 카드를 땡큐하려면 손에 있어야 하는 2장 조합 (아직 안 보인 카드만). 7 단독 땡큐는 없다. */
function thankYouPairs(card: CardId, unseen: Set<CardId>): CardId[][] {
	const r = rankNum(card);
	const s = suitOf(card);
	const same = [...unseen].filter((c) => rankNum(c) === r);
	const pairs: CardId[][] = [];
	for (let i = 0; i < same.length; i++)
		for (let j = i + 1; j < same.length; j++) pairs.push([same[i], same[j]]);
	for (const [a, b] of [
		[-2, -1],
		[-1, 1],
		[1, 2]
	]) {
		const pair = [cardAt(r + a, s), cardAt(r + b, s)];
		if (pair.every((c) => unseen.has(c))) pairs.push(pair);
	}
	return pairs;
}

/** 가장 적게 든 상대가 그 장수로 낼 수 있는 가장 낮은 점수 (안 보인 카드 중 가벼운 것부터). */
function lowestPossible(count: number, unseen: Set<CardId>): number {
	return [...unseen]
		.map(rankNum)
		.sort((a, b) => a - b)
		.slice(0, count)
		.reduce((sum, x) => sum + x, 0);
}

/** 이 카드들이 손에 남은 다른 카드와 이루던 조각 (등록·땡큐로 함께 빠지면 사라진다). */
function brokenFragment(used: CardId[], obs: Observation, unseen: Set<CardId>) {
	const rest = obs.hand.filter((c) => !used.includes(c));
	for (const c of used) {
		if (!obs.hand.includes(c)) continue;
		const f = fragmentOf(c, [c, ...rest], unseen);
		if (f) return { card: c, ...f };
	}
	return null;
}

interface ExplainContext {
	seat: number;
	seatName: (seat: number) => string;
	stopFailed: boolean;
	nextTookMyDiscard: boolean;
}

/**
 * 내 수와 추천 수의 차이를 계산할 수 있는 사실로만 설명한다. 승률은 대화 상자가 따로 보여 준다.
 * 보이는 사실(점수·조합·땡큐 위험·스톱 기준)로 설명되지 않으면 추측하지 않고 그렇게 밝힌다.
 */
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
	const limit = stopTableFor(obs.stop_limit)[fewest];
	const table = tableText(fewest, limit);
	const name = (action: string) => actionText(action, obs, ctx.seatName);
	const unseen = unseenOf(obs);
	const gap = best.value - mine.value;
	const registered = obs.registered[ctx.seat];
	/** 손패에서 cards를 내려놓은 뒤의 장수·점수와, 그 결과에 대한 설명. */
	const afterMeld = (cards: CardId[]) => {
		const left = obs.hand.filter((c) => !cards.includes(c));
		const after = handPoints(left);
		const notes: string[] = [];
		// 내려놓은 뒤 한 장이 남으면 그 장을 버리는 순간 털린다
		if (left.length <= 1)
			notes.push(
				left.length === 0
					? '손패가 0장이 되어 그 자리에서 털고 이긴다.'
					: `남은 ${cardText(left[0])} 한 장을 버리면 이번 차례에 털고 이긴다.`
			);
		else if (limit !== null && after <= limit && pts > limit)
			notes.push(`손패가 ${after}점이 되어 다음 차례부터 스톱 기준(${table})에 든다.`);
		return { after, notes };
	};
	const simOnly = () =>
		`점수·조합·땡큐 위험 같은 보이는 사실로는 차이가 드러나지 않는다. 숨은 패를 ${REVIEW_K}가지로 바꿔 끝까지 둬 본 결과에서만 ${pp(gap)} 차이가 났다.`;

	if (b.verb === 'stop' && m.verb !== 'stop') {
		return {
			category: 'stop',
			lines: [
				`지금 스톱하면 이길 확률이 ${pct(best.value)}였다 (숨은 패 ${REVIEW_K}가지 중 내가 혼자 가장 낮은 비율).`,
				`손패 ${pts}점, 가장 적게 든 상대 ${fewest}장: 기준표(${table})도 스톱을 권한다.`,
				`${name(mine.action)}를 고르면 상대들이 한 번씩 더 두며 털거나 점수를 낮출 기회를 얻어 승률이 ${pct(mine.value)}로 내려간다.`
			]
		};
	}
	if (m.verb === 'stop' && b.verb !== 'stop') {
		const low = lowestPossible(fewest, unseen);
		const lines = [
			`이 스톱이 이길 확률은 ${pct(mine.value)}였다. 선언자는 다른 모두보다 점수가 엄격하게 낮아야 이기고, 같아도 진다.`,
			`손패 ${pts}점인데 가장 적게 든 상대가 ${fewest}장이다. 안 보인 카드로 그 장수면 가장 낮게 ${low}점까지 가능하다${low <= pts ? ' — 나보다 낮거나 같을 수 있다' : ''}.`,
			`기준표: ${table}. 계속 두었다면(${name(best.action)}) 승률 ${pct(best.value)}.`
		];
		if (ctx.stopFailed) lines.push('실제로 이 스톱은 실패했다.');
		return { category: 'stop', lines };
	}
	if (b.verb === 'thankyou' && m.verb !== 'thankyou') {
		const used = b.cards.filter((c) => obs.hand.includes(c));
		const taken = b.cards.find((c) => !obs.hand.includes(c));
		const { after, notes } = afterMeld(used);
		const lines = [
			`땡큐 기회를 놓쳤다: ${taken ? `버림패 ${cardText(taken)}를 가져와 ` : ''}${cardsText(sortCards(b.cards))} 등록.`,
			`손에서 ${cardsText(sortCards(used))}가 빠져 손패가 ${pts}점 → ${after}점이 된다. 받기는 모르는 카드 한 장을 더할 뿐이다.`,
			...notes
		];
		if (!registered) lines.push('등록 상태가 되어 이후 바닥 조합에 붙이기도 할 수 있었다.');
		return { category: 'thankyou', lines };
	}
	if (m.verb === 'thankyou' && b.verb !== 'thankyou') {
		const used = m.cards.filter((c) => obs.hand.includes(c));
		const broken = brokenFragment(used, obs, unseen);
		const lines = [
			`땡큐하면 손에서 ${cardsText(sortCards(used))}(−${handPoints(used)}점)가 빠진다. 추천은 ${name(best.action)}.`
		];
		if (broken)
			lines.push(
				`${cardText(broken.card)}는 ${cardText(broken.partner)}와 ${broken.kind} 이루던 카드라, 땡큐로 그 조합 가능성(살릴 카드 ${broken.outs.length}장)이 사라졌다.`
			);
		else lines.push(simOnly());
		return { category: 'thankyou', lines };
	}
	if (m.verb === 'thankyou' && b.verb === 'thankyou') {
		const gm = handPoints(m.cards.filter((c) => obs.hand.includes(c)));
		const gb = handPoints(b.cards.filter((c) => obs.hand.includes(c)));
		return {
			category: 'thankyou',
			lines: [
				`같은 땡큐라도 조합이 달랐다: 추천 ${cardsText(sortCards(b.cards))}(손패 −${gb}점), 내 수 ${cardsText(sortCards(m.cards))}(−${gm}점).`,
				...(gb > gm ? [] : [simOnly()])
			]
		};
	}
	if (b.verb === 'register' && m.verb !== 'register') {
		const { after, notes } = afterMeld(b.cards);
		return {
			category: 'meld',
			lines: [
				`등록할 수 있는 조합을 놓쳤다: ${cardsText(sortCards(b.cards))} — 손패 ${pts}점 → ${after}점.`,
				...(notes.length
					? notes
					: ['조합을 들고 있으면 상대가 스톱할 때 그 점수까지 손패로 비교된다.'])
			]
		};
	}
	if (b.verb === 'attach' && m.verb !== 'attach') {
		const card = b.cards[0];
		const { after, notes } = afterMeld([card]);
		return {
			category: 'meld',
			lines: [
				`붙일 수 있는 카드를 놓쳤다: ${name(best.action)} — 손패 ${pts}점 → ${after}점.`,
				...notes
			]
		};
	}
	if (m.verb === 'register' && b.verb !== 'register') {
		const broken = brokenFragment(m.cards, obs, unseen);
		const lines = [`이 조합은 지금 내려놓지 않는 편이 나았다. 추천: ${name(best.action)}.`];
		if (broken)
			lines.push(
				`${cardText(broken.card)}는 ${cardText(broken.partner)}와 ${broken.kind} 이루던 카드다. 손에 두면 더 큰 조합으로 키울 수 있다 (살릴 카드 ${broken.outs.length}장).`
			);
		else lines.push(simOnly());
		return { category: 'meld', lines };
	}
	if (m.verb === 'discard' && b.verb === 'discard') {
		const mc = m.cards[0];
		const bc = b.cards[0];
		const mp = rankNum(mc);
		const bp = rankNum(bc);
		const mf = fragmentOf(mc, obs.hand, unseen);
		const bf = fragmentOf(bc, obs.hand, unseen);
		const md = thankYouPairs(mc, unseen).length;
		const bd = thankYouPairs(bc, unseen).length;
		const reasons: string[] = [];
		const tradeoffs: string[] = [];
		if (mf && !bf)
			reasons.push(
				`버린 ${cardText(mc)}는 ${cardText(mf.partner)}와 ${mf.kind} 이루던 카드다. 살려 줄 카드 ${mf.outs.length}장(${cardsText(sortCards(mf.outs))})이 아직 안 나왔다. ${cardText(bc)}는 조합과 상관없다.`
			);
		else if (mf && bf && mf.outs.length > bf.outs.length)
			reasons.push(
				`둘 다 조합 직전 카드지만 살릴 카드가 ${cardText(mc)} 쪽 ${mf.outs.length}장, ${cardText(bc)} 쪽 ${bf.outs.length}장이다.`
			);
		else if (bf && !mf)
			tradeoffs.push(
				`${cardText(bc)}는 ${cardText(bf.partner)}와 ${bf.kind} 이루는 카드인데도 버리는 편이 나았다.`
			);
		if (bp > mp)
			reasons.push(
				`${cardText(bc)}(${bp}점)가 ${cardText(mc)}(${mp}점)보다 ${bp - mp}점 무겁다. 추천대로 버리면 손패 ${pts - bp}점, 내 수대로면 ${pts - mp}점이다.`
			);
		else if (mp > bp) tradeoffs.push(`${cardText(mc)}가 ${mp - bp}점 더 무겁긴 했다.`);
		if (md > bd)
			reasons.push(
				`다음 사람이 땡큐할 수 있는 2장 조합이 ${cardText(mc)}는 ${md}가지, ${cardText(bc)}는 ${bd}가지다 (안 보인 카드 기준).`
			);
		else if (bd > md)
			tradeoffs.push(
				`땡큐 위험은 ${cardText(bc)} 쪽이 ${bd}가지로 더 크다 (${cardText(mc)} ${md}가지).`
			);
		if (limit !== null && pts - bp <= limit && pts - mp > limit)
			reasons.push(
				`${cardText(bc)}를 버리면 손패 ${pts - bp}점으로 다음 차례 스톱 기준(${table})에 든다.`
			);
		const lines = reasons.length ? reasons : [simOnly()];
		if (reasons.length && tradeoffs.length)
			lines.push(
				`반대로 ${tradeoffs.join(' ')} 그래도 종합하면 ${cardText(bc)} 쪽이 ${pp(gap)} 높았다.`
			);
		if (ctx.nextTookMyDiscard) lines.push(`실제로 다음 사람이 버린 ${cardText(mc)}를 땡큐해 갔다.`);
		return { category: 'discard', lines };
	}
	return { category: 'other', lines: [`추천: ${name(best.action)}.`, simOnly()] };
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
