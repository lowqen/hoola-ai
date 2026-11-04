// M3 동적 색 스킴(2025 스펙, TonalSpot + 금색 tertiary)과 훌라 게임 색, 명암 대비 계산.
import {
	DynamicScheme,
	Hct,
	MaterialDynamicColors,
	SchemeTonalSpot,
	TonalPalette,
	Variant,
	argbFromHex,
	hexFromArgb
} from '@material/material-color-utilities';
import { CONTRAST_LEVELS, FIXED, TERTIARY, type ContrastName, type ThemeName } from './spec.ts';

export function buildScheme(
	seedHex: string,
	theme: ThemeName,
	contrast: ContrastName
): DynamicScheme {
	const isDark = theme === 'dark';
	const level = CONTRAST_LEVELS[contrast];
	const base = new SchemeTonalSpot(Hct.fromInt(argbFromHex(seedHex)), isDark, level, '2025');
	return new DynamicScheme({
		sourceColorHct: Hct.fromInt(base.sourceColorArgb),
		variant: Variant.TONAL_SPOT,
		contrastLevel: level,
		isDark,
		specVersion: '2025',
		primaryPalette: base.primaryPalette,
		secondaryPalette: base.secondaryPalette,
		tertiaryPalette: TonalPalette.fromHueAndChroma(TERTIARY.hue, TERTIARY.chroma),
		neutralPalette: base.neutralPalette,
		neutralVariantPalette: base.neutralVariantPalette
	});
}

const kebab = (s: string) => s.replace(/_/g, '-');

/** 색 역할 이름 → #rrggbb (예: `primary`, `on-primary-container`, `surface-container-high`). */
export function colorRoles(scheme: DynamicScheme): Record<string, string> {
	const roles: Record<string, string> = {};
	const mdc = new MaterialDynamicColors();
	// 2025 스펙의 allColors에는 shadow·scrim·surface-variant·surface-tint가 빠져 있어 직접 더한다
	const extra = [mdc.shadow(), mdc.scrim(), mdc.surfaceVariant(), mdc.surfaceTint()];
	for (const c of [...mdc.allColors, ...extra]) {
		if (!c || c.name.includes('palette_key_color')) continue;
		roles[kebab(c.name)] = hexFromArgb(c.getArgb(scheme));
	}
	return roles;
}

/** 펠트 테이블 등 훌라 전용 색. 기본 팔레트의 톤에서 뽑아 테마·대비와 함께 바뀐다. */
export function gameColors(scheme: DynamicScheme, contrast: ContrastName): Record<string, string> {
	const p = scheme.primaryPalette;
	const nv = scheme.neutralVariantPalette;
	const t = scheme.tertiaryPalette;
	const high = contrast === 'high';
	const tone = (pal: TonalPalette, n: number) => hexFromArgb(pal.tone(n));
	return {
		'felt-1': tone(p, scheme.isDark ? (high ? 18 : 24) : high ? 22 : 32),
		'felt-2': tone(p, scheme.isDark ? (high ? 6 : 12) : high ? 10 : 20),
		'on-felt': tone(nv, scheme.isDark ? 96 : 98),
		'on-felt-variant': tone(nv, high ? 92 : scheme.isDark ? 82 : 86),
		'felt-highlight': tone(t, scheme.isDark ? 80 : 82),
		...FIXED
	};
}

function luminance(hex: string): number {
	const n = parseInt(hex.slice(1), 16);
	const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
		const s = v / 255;
		return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
	});
	return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

/** WCAG 명암 대비 (1..21). */
export function contrastRatio(a: string, b: string): number {
	const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
	return (l1 + 0.05) / (l2 + 0.05);
}

/** 검사할 [전경, 배경, 최소 대비, 용도]. 글자 4.5:1, 테두리·아이콘 등 UI 3:1 (WCAG). */
export const CONTRAST_PAIRS: [string, string, number, string][] = [
	['on-primary', 'primary', 4.5, '주 버튼 글자'],
	['on-primary-container', 'primary-container', 4.5, '토널 버튼 글자'],
	['on-secondary', 'secondary', 4.5, '보조 색 글자'],
	['on-secondary-container', 'secondary-container', 4.5, '보조 컨테이너 글자'],
	['on-tertiary', 'tertiary', 4.5, '강조(금색) 글자'],
	['on-tertiary-container', 'tertiary-container', 4.5, '강조 컨테이너 글자'],
	['on-error', 'error', 4.5, '스톱 버튼 글자'],
	['on-error-container', 'error-container', 4.5, '오류 안내 글자'],
	['on-surface', 'surface', 4.5, '본문'],
	['on-surface', 'surface-container-highest', 4.5, '가장 높은 패널 본문'],
	['on-surface-variant', 'surface', 4.5, '보조 글자'],
	['on-surface-variant', 'surface-container-highest', 4.5, '패널 보조 글자'],
	['primary', 'surface', 4.5, '링크·강조 글자'],
	['inverse-on-surface', 'inverse-surface', 4.5, '스낵바 글자'],
	['outline', 'surface', 3, '테두리'],
	['on-felt', 'felt-1', 4.5, '테이블 글자(밝은 곳)'],
	['on-felt', 'felt-2', 4.5, '테이블 글자(어두운 곳)'],
	['on-felt-variant', 'felt-1', 4.5, '테이블 보조 글자'],
	['felt-highlight', 'felt-2', 3, '테이블 강조 테두리'],
	['card-ink', 'card-face', 4.5, '카드 숫자(검정)'],
	['card-red', 'card-face', 4.5, '카드 숫자(빨강)']
];

export interface ContrastResult {
	fg: string;
	bg: string;
	min: number;
	use: string;
	ratio: number;
	ok: boolean;
}

export function checkContrast(colors: Record<string, string>): ContrastResult[] {
	return CONTRAST_PAIRS.map(([fg, bg, min, use]) => {
		const ratio = contrastRatio(colors[fg], colors[bg]);
		return { fg, bg, min, use, ratio, ok: ratio >= min };
	});
}

/** 테마 하나의 전체 색 (M3 역할 + 게임 색). */
export function themeColors(
	seedHex: string,
	theme: ThemeName,
	contrast: ContrastName
): Record<string, string> {
	const scheme = buildScheme(seedHex, theme, contrast);
	return { ...colorRoles(scheme), ...gameColors(scheme, contrast) };
}
