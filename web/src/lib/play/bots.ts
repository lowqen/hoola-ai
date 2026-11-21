// 봇 목록과 상대 프리셋. 키는 저장된 전적의 opponents와 호환되므로 바꾸지 않고, spec은 엔진 봇 사양이다.
// 이름은 봇이 하는 행동 그대로, 실력은 난이도 배지와 실측 레이팅으로 보여 준다.
// spec을 바꾸면 crates/hoola-lab/src/rating.rs의 WEB_BOTS도 같이 바꾸고 레이팅을 다시 잰다.
import type { Settings } from '#lib/store.ts';

export type Level = '입문' | '보통' | '상급' | '최상급';

export interface BotInfo {
	name: string;
	level: Level;
	desc: string;
	spec: string;
}

/** 강한 순. 선택 목록도 이 순서다. */
export const BOTS: Record<string, BotInfo> = {
	search: {
		name: '탐색',
		level: '최상급',
		desc: '숨은 패를 여러 번 추정해 수마다 끝까지 시뮬레이션하고, 전략서보다 확실히 나은 수만 바꾼다',
		spec: 'search:k=128'
	},
	expert: { name: '전략서', level: '상급', desc: '전략서대로 둔다', spec: 'expert' },
	greedy: { name: '즉시스톱', level: '상급', desc: '스톱할 수 있으면 바로 스톱', spec: 'greedy' },
	friendA: {
		name: '노스톱',
		level: '보통',
		desc: '스톱 없이 털기만 노린다',
		spec: 'expert:stop=never:outs=3'
	},
	friendC: {
		name: '늦은스톱',
		level: '보통',
		desc: '등록을 미루고 2점 이하 스톱',
		spec: 'expert:stop=t2:meld=hold:outs=3'
	},
	friendE: {
		name: '친구모델',
		level: '입문',
		desc: '실제 친구 모델. 모아서 한 번에 등록, 스톱할 수 있으면 바로 스톱',
		spec: 'expert:stop=t10:meld=dump:outs=1'
	},
	friendB: {
		name: '한방털기',
		level: '입문',
		desc: '스톱 없이 털 때만 등록',
		spec: 'expert:stop=never:meld=allin:outs=3'
	}
};

/**
 * 실측 레이팅 (2026-11-21 CI `hoola-lab --only R`, 기록: docs/lab/2026-11-21-bot-rating.md).
 * 시드 고정 교차 대국에서 둘 중 한쪽만 이긴 판으로 맞춘 Bradley–Terry 레이팅, 친구모델 = 1000.
 * 칸: 2인, 2인 스톱 5점, 3인, 4인, 5인. 배지는 다섯 칸 모두에서 같은 순위로 정했다
 * (1위 최상급, 2~3위 상급, 4~5위 보통, 6~7위 입문).
 */
export const RATINGS: Record<string, number[]> = {
	search: [1144, 1105, 1154, 1163, 1173],
	expert: [1135, 1091, 1148, 1155, 1172],
	greedy: [1104, 1052, 1107, 1114, 1136],
	friendA: [1027, 1009, 1063, 1085, 1106],
	friendC: [1041, 1022, 1050, 1050, 1045],
	friendE: [1000, 1000, 1000, 1000, 1000],
	friendB: [971, 981, 979, 980, 987]
};

/** 지금 규칙의 실측 레이팅 한 줄. 없으면 빈 문자열. */
export function ratingText(key: string, players: number, stop5: boolean): string {
	const s5 = players === 2 && stop5;
	const r = RATINGS[key]?.[s5 ? 1 : players === 2 ? 0 : players - 1];
	return r ? `레이팅 ${r} (${players}인${s5 ? ' 스톱 5점' : ''} 실측, 친구모델 = 1000)` : '';
}

/** 봇 상세 설명: 배지 · 행동 설명 · 지금 규칙의 실측 레이팅. */
export function botAbout(key: string, players: number, stop5: boolean): string | undefined {
	const bot = BOTS[key];
	if (!bot) return undefined;
	return [bot.level, bot.desc, ratingText(key, players, stop5)].filter(Boolean).join(' · ');
}

/** 새 판 시트의 빠른 선택. */
export const PRESETS = ['friendE', 'expert', 'greedy', 'search'];

export const DEFAULT_SETTINGS: Settings = {
	players: 3,
	opponents: ['friendE', 'friendE', 'friendE', 'friendE'],
	fullDiscards: false,
	stop5: false,
	beginner: false,
	autoHint: false,
	speed: 500,
	seed: '',
	sort: 'suit',
	coached: false
};

/** 없어진 봇: 설정은 가장 가까운 봇으로 바꾸고, 전적에는 옛 이름을 남긴다. */
const RETIRED: Record<string, { to: string; name: string }> = {
	friendD: { to: 'friendE', name: '옛 친구' },
	random: { to: 'greedy', name: '무작위' }
};

export const botName = (key: string) => BOTS[key]?.name ?? RETIRED[key]?.name ?? key;

/** 받침에 맞춰 주격 조사를 붙인다 ("1번 전략서가", "1번 노스톱이"). */
export function withSubject(word: string): string {
	const code = word.charCodeAt(word.length - 1) - 0xac00;
	const batchim = code >= 0 && code < 11172 && code % 28 !== 0;
	return `${word}${batchim ? '이' : '가'}`;
}

export function normalizeSettings(saved: Partial<Settings> | null): Settings {
	const settings = { ...DEFAULT_SETTINGS, ...saved };
	const opponents = (settings.opponents ?? DEFAULT_SETTINGS.opponents).map((o) =>
		BOTS[o] ? o : (RETIRED[o]?.to ?? 'expert')
	);
	while (opponents.length < 4) opponents.push('expert');
	return { ...settings, opponents };
}

/** 지금 상대 구성이 프리셋이면 그 키, 아니면 null(직접 고르기). */
export function presetOf(settings: Settings): string | null {
	const used = settings.opponents.slice(0, settings.players - 1);
	return PRESETS.find((p) => used.every((o) => o === p)) ?? null;
}
