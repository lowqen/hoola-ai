// 디자인 토큰의 원본 정의 (Material 3 Expressive + 훌라 전용). tokens.css는 이 파일에서 생성된다.

/** 시드 색: 테이블 펠트 그린. */
export const SEED = '#1f6f50';

/** 제3색(tertiary)은 금색으로 고정: 내 차례·선택 카드·장수 경고 강조. TonalSpot 기본(파랑 계열) 대신. */
export const TERTIARY = { hue: 85, chroma: 44 } as const;

export const CONTRAST_LEVELS = { standard: 0, medium: 0.5, high: 1 } as const;
export type ContrastName = keyof typeof CONTRAST_LEVELS;
export type ThemeName = 'light' | 'dark';

/** M3 타입 스케일 (크기·줄 높이 px, 굵기). 한글 가독성을 위해 자간은 0 이하로 둔다(M3 기본 영문 자간 대신). */
export const TYPE_SCALE = {
	display: {
		large: [57, 64, 400, -0.02],
		medium: [45, 52, 400, -0.015],
		small: [36, 44, 400, -0.01]
	},
	headline: {
		large: [32, 40, 400, -0.01],
		medium: [28, 36, 400, -0.01],
		small: [24, 32, 400, -0.005]
	},
	title: { large: [22, 28, 500, 0], medium: [16, 24, 600, 0], small: [14, 20, 600, 0] },
	body: { large: [16, 24, 400, 0], medium: [14, 20, 400, 0], small: [12, 16, 400, 0] },
	label: { large: [14, 20, 600, 0], medium: [12, 16, 600, 0], small: [11, 16, 600, 0] }
} as const satisfies Record<string, Record<string, readonly [number, number, number, number]>>;

/** M3 Expressive 강조 스타일: 같은 크기에서 굵기만 올린다. */
export const EMPHASIZED_WEIGHT_DELTA = 200;

/**
 * 정보 위계(DESIGN_PLAN §6.1-5)를 타입 스케일에 매핑한 의미 토큰.
 * [이름, 역할, 크기, 강조, 숫자 고정폭]
 */
export const HIERARCHY = [
	['my-score', 'display', 'small', true, true],
	['turn', 'title', 'large', true, false],
	['opp-count', 'headline', 'medium', true, true],
	['seat-name', 'title', 'small', false, false],
	['action', 'label', 'large', false, false],
	['meld-label', 'label', 'small', false, false],
	['log', 'body', 'small', false, false],
	['stat', 'headline', 'small', true, true]
] as const;

/** M3 모양(코너) 스케일, px. Expressive의 increased 단계 포함. */
export const SHAPE = {
	none: 0,
	'extra-small': 4,
	small: 8,
	medium: 12,
	large: 16,
	'large-increased': 20,
	'extra-large': 28,
	'extra-large-increased': 32,
	'extra-extra-large': 48,
	full: 9999
} as const;

/** M3 높이 단계별 그림자 (두 겹: 그림자색 30% + 15%). */
export const ELEVATION = [
	'none',
	'0 1px 2px 0 rgb(var(--md-sys-color-shadow-rgb) / 0.3), 0 1px 3px 1px rgb(var(--md-sys-color-shadow-rgb) / 0.15)',
	'0 1px 2px 0 rgb(var(--md-sys-color-shadow-rgb) / 0.3), 0 2px 6px 2px rgb(var(--md-sys-color-shadow-rgb) / 0.15)',
	'0 1px 3px 0 rgb(var(--md-sys-color-shadow-rgb) / 0.3), 0 4px 8px 3px rgb(var(--md-sys-color-shadow-rgb) / 0.15)',
	'0 2px 3px 0 rgb(var(--md-sys-color-shadow-rgb) / 0.3), 0 6px 10px 4px rgb(var(--md-sys-color-shadow-rgb) / 0.15)',
	'0 4px 4px 0 rgb(var(--md-sys-color-shadow-rgb) / 0.3), 0 8px 12px 6px rgb(var(--md-sys-color-shadow-rgb) / 0.15)'
] as const;

export { SPRINGS } from './springs.ts';

/** 스프링을 못 쓰는 곳(트랜지션 단축 등)을 위한 M3 이징·길이. */
export const EASING = {
	emphasized: 'cubic-bezier(0.2, 0, 0, 1)',
	'emphasized-decelerate': 'cubic-bezier(0.05, 0.7, 0.1, 1)',
	'emphasized-accelerate': 'cubic-bezier(0.3, 0, 0.8, 0.15)',
	standard: 'cubic-bezier(0.2, 0, 0, 1)',
	'standard-decelerate': 'cubic-bezier(0, 0, 0, 1)',
	'standard-accelerate': 'cubic-bezier(0.3, 0, 1, 1)'
} as const;
export const DURATION = {
	short1: 50,
	short2: 100,
	short3: 150,
	short4: 200,
	medium1: 250,
	medium2: 300,
	medium3: 350,
	medium4: 400,
	long1: 450,
	long2: 500,
	long3: 550,
	long4: 600
} as const;

/** 상태 레이어 불투명도. */
export const STATE_LAYER = { hover: 0.08, focus: 0.1, pressed: 0.1, dragged: 0.16 } as const;

/** 테마를 따르지 않는 게임 고정 색 (카드 판독성 우선). */
export const FIXED = {
	'card-face': '#fffdf7',
	'card-ink': '#1d1d1b',
	'card-red': '#b8291f',
	'card-edge': 'rgb(0 0 0 / 0.18)',
	'card-back-1': '#29457f',
	'card-back-2': '#35589c',
	'grade-best': '#0a7d2a',
	'grade-inaccuracy': '#fab219',
	'grade-mistake': '#b4521f',
	'grade-blunder': '#d03b3b',
	/** 등급 배지 글자: 부정확(노랑)만 검정, 나머지는 흰색 */
	'grade-on': '#ffffff',
	'grade-on-inaccuracy': '#0b0b0b'
} as const;
