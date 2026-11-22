// 복기 판정: 결정마다 L3 평가를 등급·이유·오답 노트 항목으로 바꾼다. 화면과 무관한 순수 함수다.
import { t } from '#lib/i18n/index.ts';
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
	{ id: 'blunder', min: 0.1, label: t('블런더'), icon: 'close' },
	{ id: 'mistake', min: 0.05, label: t('실수'), icon: 'warning' },
	{ id: 'inaccuracy', min: 0.02, label: t('부정확'), icon: 'help' },
	{ id: 'good', min: 0, label: t('좋음'), icon: 'check' }
];
const BEST: Grade = { id: 'best', min: 0, label: t('최선'), icon: 'star' };
/** 스톱 기준표대로 둔 판단: 시뮬레이션과 달라도 실수로 세지 않는다. */
const TABLE: Grade = { id: 'table', min: 0, label: t('기준표대로'), icon: 'rule' };

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
		? `${t('상대 최소 {n}장', { n: fewest })} → ${t('스톱 금지')}`
		: `${t('상대 최소 {n}장', { n: fewest })} → ${t('{n}점 이하면 스톱', { n: limit })}`;

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
					? t('손패가 0장이 되어 그 자리에서 털고 이긴다.')
					: t('남은 {card} 한 장을 버리면 이번 차례에 털고 이긴다.', { card: cardText(left[0]) })
			);
		else if (limit !== null && after <= limit && pts > limit)
			notes.push(
				t('손패가 {n}점이 되어 다음 차례부터 스톱 기준({table})에 든다.', { n: after, table })
			);
		return { after, notes };
	};
	const simOnly = () =>
		t(
			'점수·조합·땡큐 위험 같은 보이는 사실로는 차이가 드러나지 않는다. 숨은 패를 {k}가지로 바꿔 끝까지 둬 본 결과에서만 {gap} 차이가 났다.',
			{ k: REVIEW_K, gap: pp(gap) }
		);

	if (b.verb === 'stop' && m.verb !== 'stop') {
		return {
			category: 'stop',
			lines: [
				t('지금 스톱하면 이길 확률이 {p}였다 (숨은 패 {k}가지 중 내가 혼자 가장 낮은 비율).', {
					p: pct(best.value),
					k: REVIEW_K
				}),
				t('손패 {pts}점, 가장 적게 든 상대 {n}장: 기준표({table})도 스톱을 권한다.', {
					pts,
					n: fewest,
					table
				}),
				t(
					'{move}를 고르면 상대들이 한 번씩 더 두며 털거나 점수를 낮출 기회를 얻어 승률이 {p}로 내려간다.',
					{ move: name(mine.action), p: pct(mine.value) }
				)
			]
		};
	}
	if (m.verb === 'stop' && b.verb !== 'stop') {
		const low = lowestPossible(fewest, unseen);
		const lines = [
			t(
				'이 스톱이 이길 확률은 {p}였다. 선언자는 다른 모두보다 점수가 엄격하게 낮아야 이기고, 같아도 진다.',
				{ p: pct(mine.value) }
			),
			t(
				low <= pts
					? '손패 {pts}점인데 가장 적게 든 상대가 {n}장이다. 안 보인 카드로 그 장수면 가장 낮게 {low}점까지 가능하다 — 나보다 낮거나 같을 수 있다.'
					: '손패 {pts}점인데 가장 적게 든 상대가 {n}장이다. 안 보인 카드로 그 장수면 가장 낮게 {low}점까지 가능하다.',
				{ pts, n: fewest, low }
			),
			t('기준표: {table}. 계속 두었다면({move}) 승률 {p}.', {
				table,
				move: name(best.action),
				p: pct(best.value)
			})
		];
		if (ctx.stopFailed) lines.push(t('실제로 이 스톱은 실패했다.'));
		return { category: 'stop', lines };
	}
	if (b.verb === 'thankyou' && m.verb !== 'thankyou') {
		const used = b.cards.filter((c) => obs.hand.includes(c));
		const taken = b.cards.find((c) => !obs.hand.includes(c));
		const { after, notes } = afterMeld(used);
		const lines = [
			taken
				? t('땡큐 기회를 놓쳤다: 버림패 {card}를 가져와 {cards} 등록.', {
						card: cardText(taken),
						cards: cardsText(sortCards(b.cards))
					})
				: t('땡큐 기회를 놓쳤다: {cards} 등록.', { cards: cardsText(sortCards(b.cards)) }),
			t(
				'손에서 {cards}가 빠져 손패가 {pts}점 → {after}점이 된다. 받기는 모르는 카드 한 장을 더할 뿐이다.',
				{ cards: cardsText(sortCards(used)), pts, after }
			),
			...notes
		];
		if (!registered) lines.push(t('등록 상태가 되어 이후 바닥 조합에 붙이기도 할 수 있었다.'));
		return { category: 'thankyou', lines };
	}
	if (m.verb === 'thankyou' && b.verb !== 'thankyou') {
		const used = m.cards.filter((c) => obs.hand.includes(c));
		const broken = brokenFragment(used, obs, unseen);
		const lines = [
			t('땡큐하면 손에서 {cards}(−{n}점)가 빠진다. 추천은 {move}.', {
				cards: cardsText(sortCards(used)),
				n: handPoints(used),
				move: name(best.action)
			})
		];
		if (broken)
			lines.push(
				t(
					'{card}는 {partner}와 {kind} 이루던 카드라, 땡큐로 그 조합 가능성(살릴 카드 {n}장)이 사라졌다.',
					{
						card: cardText(broken.card),
						partner: cardText(broken.partner),
						kind: broken.kind,
						n: broken.outs.length
					}
				)
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
				t('같은 땡큐라도 조합이 달랐다: 추천 {best}(손패 −{gb}점), 내 수 {mine}(−{gm}점).', {
					best: cardsText(sortCards(b.cards)),
					gb,
					mine: cardsText(sortCards(m.cards)),
					gm
				}),
				...(gb > gm ? [] : [simOnly()])
			]
		};
	}
	if (b.verb === 'register' && m.verb !== 'register') {
		const { after, notes } = afterMeld(b.cards);
		return {
			category: 'meld',
			lines: [
				t('등록할 수 있는 조합을 놓쳤다: {cards} — 손패 {pts}점 → {after}점.', {
					cards: cardsText(sortCards(b.cards)),
					pts,
					after
				}),
				...(notes.length
					? notes
					: [t('조합을 들고 있으면 상대가 스톱할 때 그 점수까지 손패로 비교된다.')])
			]
		};
	}
	if (b.verb === 'attach' && m.verb !== 'attach') {
		const card = b.cards[0];
		const { after, notes } = afterMeld([card]);
		return {
			category: 'meld',
			lines: [
				t('붙일 수 있는 카드를 놓쳤다: {move} — 손패 {pts}점 → {after}점.', {
					move: name(best.action),
					pts,
					after
				}),
				...notes
			]
		};
	}
	if (m.verb === 'register' && b.verb !== 'register') {
		const broken = brokenFragment(m.cards, obs, unseen);
		const lines = [
			t('이 조합은 지금 내려놓지 않는 편이 나았다. 추천: {move}.', { move: name(best.action) })
		];
		if (broken)
			lines.push(
				t(
					'{card}는 {partner}와 {kind} 이루던 카드다. 손에 두면 더 큰 조합으로 키울 수 있다 (살릴 카드 {n}장).',
					{
						card: cardText(broken.card),
						partner: cardText(broken.partner),
						kind: broken.kind,
						n: broken.outs.length
					}
				)
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
				t(
					'버린 {card}는 {partner}와 {kind} 이루던 카드다. 살려 줄 카드 {n}장({outs})이 아직 안 나왔다. {best}는 조합과 상관없다.',
					{
						card: cardText(mc),
						partner: cardText(mf.partner),
						kind: mf.kind,
						n: mf.outs.length,
						outs: cardsText(sortCards(mf.outs)),
						best: cardText(bc)
					}
				)
			);
		else if (mf && bf && mf.outs.length > bf.outs.length)
			reasons.push(
				t('둘 다 조합 직전 카드지만 살릴 카드가 {mine} 쪽 {mn}장, {best} 쪽 {bn}장이다.', {
					mine: cardText(mc),
					mn: mf.outs.length,
					best: cardText(bc),
					bn: bf.outs.length
				})
			);
		else if (bf && !mf)
			tradeoffs.push(
				t('{card}는 {partner}와 {kind} 이루는 카드인데도 버리는 편이 나았다.', {
					card: cardText(bc),
					partner: cardText(bf.partner),
					kind: bf.kind
				})
			);
		if (bp > mp)
			reasons.push(
				t(
					'{best}({bp}점)가 {mine}({mp}점)보다 {d}점 무겁다. 추천대로 버리면 손패 {bl}점, 내 수대로면 {ml}점이다.',
					{ best: cardText(bc), bp, mine: cardText(mc), mp, d: bp - mp, bl: pts - bp, ml: pts - mp }
				)
			);
		else if (mp > bp)
			tradeoffs.push(t('{card}가 {n}점 더 무겁긴 했다.', { card: cardText(mc), n: mp - bp }));
		if (md > bd)
			reasons.push(
				t(
					'다음 사람이 땡큐할 수 있는 2장 조합이 {mine}는 {md}가지, {best}는 {bd}가지다 (안 보인 카드 기준).',
					{ mine: cardText(mc), md, best: cardText(bc), bd }
				)
			);
		else if (bd > md)
			tradeoffs.push(
				t('땡큐 위험은 {best} 쪽이 {bd}가지로 더 크다 ({mine} {md}가지).', {
					best: cardText(bc),
					bd,
					mine: cardText(mc),
					md
				})
			);
		if (limit !== null && pts - bp <= limit && pts - mp > limit)
			reasons.push(
				t('{card}를 버리면 손패 {n}점으로 다음 차례 스톱 기준({table})에 든다.', {
					card: cardText(bc),
					n: pts - bp,
					table
				})
			);
		const lines = reasons.length ? reasons : [simOnly()];
		if (reasons.length && tradeoffs.length)
			lines.push(
				t('반대로 {list} 그래도 종합하면 {card} 쪽이 {gap} 높았다.', {
					list: tradeoffs.join(' '),
					card: cardText(bc),
					gap: pp(gap)
				})
			);
		if (ctx.nextTookMyDiscard)
			lines.push(t('실제로 다음 사람이 버린 {card}를 땡큐해 갔다.', { card: cardText(mc) }));
		return { category: 'discard', lines };
	}
	return {
		category: 'other',
		lines: [t('추천: {text}', { text: name(best.action) }) + '.', simOnly()]
	};
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
					t(
						mine.action === 'stop'
							? '스톱 기준표({table})대로 스톱했다. 실수로 세지 않는다.'
							: '스톱 기준표({table})대로 스톱하지 않았다. 실수로 세지 않는다.',
						{ table: tableText(check.fewest, check.limit) }
					),
					t(
						'참고: 시뮬레이션은 {move} 쪽을 {gap}%p 높게 봤지만, 스톱 판단은 상대 손패 추정에 크게 좌우되는 장면이라 실측 기준표를 우선한다.',
						{
							move: actionText(best.action, r.obs, ctx.seatName),
							gap: ((best.value - mine.value) * 100).toFixed(0)
						}
					)
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
