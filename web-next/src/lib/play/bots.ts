// 봇 목록과 상대 프리셋. spec은 엔진 봇 사양이고, 저장된 전적의 opponents 키와 호환된다.
import type { Settings } from '#lib/store.ts';

export const BOTS: Record<string, { label: string; short: string; spec: string }> = {
	expert: { label: '전문가 (전략서 v1)', short: '전문가', spec: 'expert' },
	friendA: { label: '친구 A: 버티기 (스톱 안 함)', short: '버티기', spec: 'expert:stop=never' },
	friendB: {
		label: '친구 B: 한방 (스톱 안 함, 털 때만 등록)',
		short: '한방',
		spec: 'expert:stop=never:meld=allin'
	},
	friendC: {
		label: '친구 C: 늦은 스톱·보류',
		short: '늦은스톱',
		spec: 'expert:stop=t2:meld=hold'
	},
	friendE: {
		label: '친구 E: 실제 친구 모델 (몰아뒀다 한꺼번에, 땡큐 항상, 3점 이하만 스톱)',
		short: '실전친구',
		spec: 'expert:stop=t3:meld=dump:outs=1'
	},
	greedy: { label: 'Greedy (10점 이하 즉시 스톱)', short: 'Greedy', spec: 'greedy' },
	random: { label: 'Random', short: 'Random', spec: 'random' }
};

export const PRESETS = [
	{ id: 'friendE', label: '실전 친구' },
	{ id: 'expert', label: '전략서 봇' },
	{ id: 'greedy', label: '쉬운 상대' }
] as const;

export const DEFAULT_SETTINGS: Settings = {
	players: 3,
	opponents: ['friendA', 'friendB', 'expert', 'expert'],
	fullDiscards: false,
	beginner: false,
	autoHint: false,
	speed: 500,
	seed: '',
	sort: 'suit',
	coached: false
};

/** 없어진 봇은 가장 가까운 봇으로 바꾼다. */
const RENAMED: Record<string, string> = { friendD: 'friendE' };

export function normalizeSettings(saved: Partial<Settings> | null): Settings {
	const settings = { ...DEFAULT_SETTINGS, ...saved };
	const opponents = (settings.opponents ?? DEFAULT_SETTINGS.opponents).map((o) =>
		BOTS[o] ? o : BOTS[RENAMED[o]] ? RENAMED[o] : 'expert'
	);
	while (opponents.length < 4) opponents.push('expert');
	return { ...settings, opponents };
}

/** 지금 상대 구성이 프리셋이면 그 id, 아니면 null(직접 고르기). */
export function presetOf(settings: Settings): string | null {
	const used = settings.opponents.slice(0, settings.players - 1);
	return PRESETS.find((p) => used.every((o) => o === p.id))?.id ?? null;
}
