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
	/** 변형 "1:1 스톱 5점" (2인 판에서만 적용). 예전 저장분에는 없어서 꺼짐으로 읽는다. */
	stop5?: boolean;
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
	/** 변형 "1:1 스톱 5점"으로 둔 판. 켜진 판에만 적는다. */
	stop5?: boolean;
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

// ---------- 진행 중인 판 ----------
// 전적 저장소와 키를 나눈다. 기존 앱과 같은 형식을 유지하고, 깨져도 전적에 영향이 없게 한다.
export const GAME_KEY = 'hoola-practice-game-v1';

export interface SavedGame {
	config: {
		players: number;
		opponents: string[];
		fullDiscards: boolean;
		seed: number;
		/** 예전 저장분에는 없다(꺼짐). 규칙 자체는 replay의 rules_toml에 있다. */
		stop5?: boolean;
	};
	/** 엔진 리플레이 JSON. 규칙·시드·행동이 모두 들어 있다. */
	replay: string;
	decisions: { index: number; action: string }[];
	usedBeginner: boolean;
	usedUndo: boolean;
	recorded: boolean;
}

export function loadGame(): SavedGame | null {
	try {
		const raw = localStorage.getItem(GAME_KEY);
		return raw ? (JSON.parse(raw) as SavedGame) : null;
	} catch {
		clearGame();
		return null;
	}
}

export function saveGame(game: SavedGame) {
	try {
		localStorage.setItem(GAME_KEY, JSON.stringify(game));
	} catch {
		// 저장 실패해도 게임은 계속한다
	}
}

export function clearGame() {
	try {
		localStorage.removeItem(GAME_KEY);
	} catch {
		// 저장소를 못 쓰면 지울 것도 없다
	}
}
