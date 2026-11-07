// 봇 목록과 상대 프리셋. 키는 저장된 전적의 opponents와 호환되므로 바꾸지 않고, spec은 엔진 봇 사양이다.
// 이름은 "1번 고수가 털었다"처럼 조사 '가'가 자연스럽게 모음으로 끝낸다.
import type { Settings } from '#lib/store.ts';

export const BOTS: Record<string, { name: string; desc: string; spec: string }> = {
	friendE: {
		name: '친구',
		desc: '실제 친구 모델. 모아서 한 번에 등록, 3점 이하 스톱',
		spec: 'expert:stop=t3:meld=dump:outs=1'
	},
	expert: { name: '고수', desc: '전략서대로 둔다', spec: 'expert' },
	greedy: { name: '초보', desc: '10점 이하면 바로 스톱', spec: 'greedy' },
	friendA: { name: '버티기', desc: '스톱 없이 털기만 노린다', spec: 'expert:stop=never' },
	friendB: {
		name: '승부사',
		desc: '스톱 없이 털 때만 등록',
		spec: 'expert:stop=never:meld=allin'
	},
	friendC: { name: '잠수', desc: '등록을 미루고 2점 이하 스톱', spec: 'expert:stop=t2:meld=hold' }
};

/** 새 판 시트의 빠른 선택. */
export const PRESETS = ['friendE', 'expert', 'greedy'];

export const DEFAULT_SETTINGS: Settings = {
	players: 3,
	opponents: ['friendE', 'friendE', 'friendE', 'friendE'],
	fullDiscards: false,
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
