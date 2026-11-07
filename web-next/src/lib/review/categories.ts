// 실수 유형과 그 유형을 연습할 훈련. 복기와 기록 화면이 함께 쓴다.
import type { PuzzleKind } from '#lib/train/drills.ts';

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
