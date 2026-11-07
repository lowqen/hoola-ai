// 기록 화면의 집계. 저장 형식은 기존 앱과 같다.
import { botName } from '#lib/play/bots.ts';
import { CATEGORY, DRILL_OF, type Category } from '#lib/review/categories.ts';
import type { GameRecord } from '#lib/store.ts';
import type { PuzzleKind } from '#lib/train/drills.ts';

export interface GroupStat {
	label: string;
	games: number;
	/** 평균 몫 (0~1). */
	rate: number;
	/** 공평한 몫 (1 / 인원). */
	fair: number;
}

/** 상대 구성별 승률. 되돌리기·다시 두기를 쓴 연습판은 뺀다. */
export function groupStats(games: GameRecord[]): { groups: GroupStat[]; practice: number } {
	const counted = games.filter((g) => !g.undo);
	const totals = new Map<string, { games: number; share: number; players: number }>();
	for (const g of counted) {
		const opponents = g.opponents.map(botName).join('·');
		const label = `${g.beginner ? '초보 · ' : ''}${g.players}인 · ${opponents}`;
		const total = totals.get(label) ?? { games: 0, share: 0, players: g.players };
		total.games++;
		total.share += g.share;
		totals.set(label, total);
	}
	return {
		practice: games.length - counted.length,
		groups: [...totals]
			.map(([label, t]) => ({
				label,
				games: t.games,
				rate: t.share / t.games,
				fair: 1 / t.players
			}))
			.sort((a, b) => b.games - a.games)
	};
}

export interface WeakRow {
	category: string;
	label: string;
	count: number;
	drill?: PuzzleKind;
}

export interface Weakness {
	reviewed: number;
	accuracy: number;
	/** 판당 확실한 손실 (0~1 합계). */
	lossPerGame: number;
	rows: WeakRow[];
}

/** 복기한 판을 모아 어떤 유형에서 실수가 많은지 본다. */
export function weakness(games: GameRecord[]): Weakness | null {
	const reviewed = games.flatMap((g) => (g.review ? [g.review] : []));
	if (!reviewed.length) return null;
	const counts = new Map<string, number>();
	let decisions = 0;
	let accurate = 0;
	let loss = 0;
	for (const review of reviewed) {
		decisions += review.decisions;
		accurate += review.accurate;
		loss += review.loss;
		for (const [category, n] of Object.entries(review.categories ?? {})) {
			counts.set(category, (counts.get(category) ?? 0) + n);
		}
	}
	return {
		reviewed: reviewed.length,
		accuracy: decisions ? accurate / decisions : 0,
		lossPerGame: loss / reviewed.length,
		rows: [...counts]
			.map(([category, count]) => ({
				category,
				label: CATEGORY[category as Category] ?? category,
				count,
				drill: DRILL_OF[category as Category]
			}))
			.sort((a, b) => b.count - a.count)
	};
}

export interface DayStat {
	date: string;
	/** "11/7" */
	label: string;
	n: number;
	correct: number;
}

/** 오늘까지 최근 며칠의 훈련 기록. 안 푼 날도 빈 칸으로 넣는다. 날짜 키는 훈련이 저장한 UTC 날짜다. */
export function trainingDays(
	days: Record<string, { n: number; correct: number }> | undefined,
	count = 14,
	now = new Date()
): DayStat[] {
	return Array.from({ length: count }, (_, i) => {
		const at = new Date(now);
		at.setUTCDate(at.getUTCDate() - (count - 1 - i));
		const date = at.toISOString().slice(0, 10);
		const day = days?.[date];
		return {
			date,
			label: `${at.getUTCMonth() + 1}/${at.getUTCDate()}`,
			n: day?.n ?? 0,
			correct: day?.correct ?? 0
		};
	});
}
