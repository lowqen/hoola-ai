// 연습장 저장소. 기존 앱과 같은 localStorage 키·형식을 쓴다 (DESIGN_PLAN §8 저장 데이터).
// 모르는 필드도 그대로 보존한다. 저장 실패는 무시한다(비공개 창 등).
import type { DrillId, DrillStats, NotebookItem } from './train/drills.ts';

export const STORE_KEY = 'hoola-practice-v1';

export interface Settings {
	players: number;
	opponents: string[];
	fullDiscards: boolean;
	beginner: boolean;
	autoHint: boolean;
	speed: number;
	seed: string;
	/** 새 앱에서 추가: 손패 정렬. 기존 앱은 무시한다. */
	sort?: 'suit' | 'rank';
	/** 새 앱에서 추가: 코치마크를 봤는지. */
	coached?: boolean;
}

/** 판 복기 요약. 기록 화면의 약점 집계가 쓴다. */
export interface ReviewSummary {
	decisions: number;
	accurate: number;
	loss: number;
	counts: Record<string, number>;
	categories: Record<string, number>;
}

export interface GameRecord {
	at: string;
	players: number;
	opponents: string[];
	seed: number;
	reason: string;
	share: number;
	undo: boolean;
	beginner: boolean;
	replay: unknown;
	human_seat: number;
	review?: ReviewSummary;
}

export interface Store {
	settings: Partial<Settings> | null;
	games: GameRecord[];
	train?: Record<DrillId, DrillStats>;
	trainDays?: Record<string, { n: number; correct: number }>;
	notebook?: NotebookItem[];
	[key: string]: unknown;
}

let shared: Store | null = null;

function readStore(): Store {
	try {
		const raw = localStorage.getItem(STORE_KEY);
		if (raw) {
			const parsed = JSON.parse(raw) as Store;
			parsed.games ||= [];
			return parsed;
		}
	} catch {
		// 저장소를 못 읽으면 빈 상태로 시작한다
	}
	return { settings: null, games: [] };
}

/** 페이지당 하나의 객체를 돌려준다. 화면마다 따로 읽으면 나중에 저장한 쪽이 다른 화면의 기록을 덮어쓴다. */
export function loadStore(): Store {
	return (shared ??= readStore());
}

export function saveStore(store: Store) {
	try {
		localStorage.setItem(STORE_KEY, JSON.stringify(store));
	} catch {
		// 저장 실패해도 게임은 계속한다
	}
}
