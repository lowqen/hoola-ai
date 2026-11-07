// 훈련 문제 형식과 판단 도우미. 저장 형식은 기존 앱과 같다.
import type { CardId } from '#lib/game/cards.ts';
import type { IconName } from '#lib/ui/icons.ts';
import type { Observation } from '#lib/play/actions.ts';

export type PuzzleKind = 'meld' | 'thankyou' | 'stop' | 'discard';
export type DrillId = PuzzleKind | 'notebook';

export const PUZZLE_KINDS: PuzzleKind[] = ['meld', 'thankyou', 'stop', 'discard'];

export const DRILLS: Record<DrillId, { title: string; rule: string; icon: IconName }> = {
	meld: {
		title: '조합 찾기',
		rule: '같은 숫자 3장+ · 같은 무늬 연속 3장+ · 7 한 장',
		icon: 'layers'
	},
	thankyou: {
		title: '땡큐 찾기',
		rule: '앞사람이 막 버린 카드 + 내 카드 2장 → 바로 등록',
		icon: 'front_hand'
	},
	stop: { title: '스톱 판단', rule: '1금 2-4 3-8 4-10', icon: 'stop_circle' },
	discard: {
		title: '버릴 카드',
		rule: '점수 − 살려 줄 카드 수 × 3 이 가장 큰 카드',
		icon: 'delete'
	},
	notebook: { title: '오답 노트', rule: '복기·훈련에서 틀린 장면 다시 풀기', icon: 'history' }
};

/** 엔진 평가 한 수. gap은 1위와의 차이, gap_se는 그 표준오차다. */
export interface ScoredMove {
	action: string;
	value: number;
	gap: number;
	gap_se: number;
	stderr?: number;
}

interface PuzzleBase {
	obs: Observation;
	players: number;
	opponent: string;
}
export interface MeldPuzzle extends PuzzleBase {
	type: 'meld';
	answer: { melds: CardId[][]; covered: number; left: number };
}
export interface ThankYouPuzzle extends PuzzleBase {
	type: 'thankyou';
	options: string[];
}
export interface StopPuzzle extends PuzzleBase {
	type: 'stop';
	table: { fewest: number; limit: number | null; stop: boolean };
	truth: boolean;
	estimate: number;
	points: number[];
}
export interface DiscardPuzzle extends PuzzleBase {
	type: 'discard';
	scored: ScoredMove[];
}
export type Puzzle = MeldPuzzle | ThankYouPuzzle | StopPuzzle | DiscardPuzzle;

/** 오답 노트 한 항목. 복기에서 온 항목도 같은 형식이다. */
export interface NotebookItem {
	key: string;
	obs: Observation;
	scored: ScoredMove[];
	best: string;
	lines?: string[];
	category?: string;
	/** 복기에서 온 항목: 실제로 둔 수와 손실. */
	mine?: string;
	loss?: number;
	at: string;
	solved?: number;
}

export interface DrillStats {
	n: number;
	correct: number;
	streak: number;
	best: number;
	recent: number[];
}
