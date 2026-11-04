// 디자인 토큰 생성기: src/lib/theme/spec.ts → src/lib/theme/tokens.css
//   node scripts/tokens.ts          생성 (+ 6개 테마 명암 대비 검사)
//   node scripts/tokens.ts --check  생성 결과가 커밋된 파일과 같은지 검사 (CI)
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { linearEasing, springCurve } from '../src/lib/theme/motion.ts';
import { checkContrast, themeColors } from '../src/lib/theme/scheme.ts';
import {
	CONTRAST_LEVELS,
	DURATION,
	EASING,
	ELEVATION,
	EMPHASIZED_WEIGHT_DELTA,
	HIERARCHY,
	SEED,
	SHAPE,
	SPRINGS,
	STATE_LAYER,
	TYPE_SCALE,
	type ContrastName,
	type ThemeName
} from '../src/lib/theme/spec.ts';

const OUT = fileURLToPath(new URL('../src/lib/theme/tokens.css', import.meta.url));
const FONT =
	"'Pretendard Variable', Pretendard, -apple-system, BlinkMacSystemFont, system-ui, 'Apple SD Gothic Neo', 'Malgun Gothic', 'Noto Sans KR', sans-serif";

const lines: string[] = [];
const out = (s = '') => lines.push(s);
const px = (n: number) => `${n}px`;

function rgbTriplet(hex: string): string {
	const n = parseInt(hex.slice(1), 16);
	return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}

function colorBlock(selector: string, colors: Record<string, string>, indent = '') {
	out(`${indent}${selector} {`);
	for (const [k, v] of Object.entries(colors)) {
		const name =
			k.startsWith('felt') ||
			k.startsWith('on-felt') ||
			k.startsWith('card') ||
			k.startsWith('grade')
				? `--hoola-color-${k}`
				: `--md-sys-color-${k}`;
		out(`${indent}\t${name}: ${v};`);
	}
	out(`${indent}\t--md-sys-color-shadow-rgb: ${rgbTriplet(colors['shadow'])};`);
	out(
		`${indent}\tcolor-scheme: ${colors['surface'] && parseInt(colors['surface'].slice(1, 3), 16) < 128 ? 'dark' : 'light'};`
	);
	out(`${indent}}`);
}

out(
	'/* 자동 생성 — `npm run tokens` (scripts/tokens.ts). 직접 고치지 말 것. 원본: src/lib/theme/spec.ts */'
);
out(
	`/* 시드 ${SEED} · M3 TonalSpot (2025 스펙) · tertiary 금색 · 라이트/다크 × 기본/중간/높은 대비 */`
);
out();
out(':root {');
out(`\t--md-ref-typeface-brand: ${FONT};`);
out(`\t--md-ref-typeface-plain: ${FONT};`);
for (const [role, sizes] of Object.entries(TYPE_SCALE)) {
	for (const [size, [fs, lh, w, tr]] of Object.entries(sizes)) {
		const p = `--md-sys-typescale-${role}-${size}`;
		out(`\t${p}-size: ${px(fs)};`);
		out(`\t${p}-line-height: ${px(lh)};`);
		out(`\t${p}-weight: ${w};`);
		out(`\t${p}-tracking: ${tr}em;`);
	}
}
for (const [k, v] of Object.entries(SHAPE)) out(`\t--md-sys-shape-corner-${k}: ${px(v)};`);
ELEVATION.forEach((v, i) => out(`\t--md-sys-elevation-level${i}: ${v};`));
for (const [scheme, springs] of Object.entries(SPRINGS)) {
	for (const [name, [damping, stiffness]] of Object.entries(springs)) {
		const curve = springCurve(damping, stiffness);
		out(`\t--md-sys-motion-spring-${scheme}-${name}-duration: ${curve.duration}ms;`);
		out(`\t--md-sys-motion-spring-${scheme}-${name}: ${linearEasing(curve)};`);
	}
}
for (const [k, v] of Object.entries(EASING)) out(`\t--md-sys-motion-easing-${k}: ${v};`);
for (const [k, v] of Object.entries(DURATION)) out(`\t--md-sys-motion-duration-${k}: ${v}ms;`);
for (const [k, v] of Object.entries(STATE_LAYER))
	out(`\t--md-sys-state-${k}-state-layer-opacity: ${v};`);
out('}');
out();

// ---- 색: 문서 기본(JS 없이도) → 라이트·기본 대비, 시스템 다크면 다크·기본 대비 ----
const themes: ThemeName[] = ['light', 'dark'];
const contrasts = Object.keys(CONTRAST_LEVELS) as ContrastName[];
const failures: string[] = [];
const all: Record<string, Record<string, string>> = {};
for (const theme of themes) {
	for (const contrast of contrasts) {
		const colors = themeColors(SEED, theme, contrast);
		all[`${theme}-${contrast}`] = colors;
		for (const r of checkContrast(colors)) {
			if (!r.ok)
				failures.push(
					`${theme}/${contrast}: ${r.fg} on ${r.bg} = ${r.ratio.toFixed(2)} < ${r.min} (${r.use})`
				);
		}
	}
}
colorBlock(':root', all['light-standard']);
out();
out('@media (prefers-color-scheme: dark) {');
colorBlock(':root:not([data-theme])', all['dark-standard'], '\t');
out('}');
for (const theme of themes) {
	for (const contrast of contrasts) {
		out();
		colorBlock(
			`:root[data-theme='${theme}'][data-contrast='${contrast}']`,
			all[`${theme}-${contrast}`]
		);
	}
}
out();

// ---- 글자 클래스: M3 역할 + 강조 + 정보 위계 ----
for (const [role, sizes] of Object.entries(TYPE_SCALE)) {
	for (const size of Object.keys(sizes)) {
		const p = `--md-sys-typescale-${role}-${size}`;
		const body = `font-family: var(--md-ref-typeface-plain); font-size: var(${p}-size); line-height: var(${p}-line-height); letter-spacing: var(${p}-tracking);`;
		out(`.md-typescale-${role}-${size} { ${body} font-weight: var(${p}-weight); }`);
		out(
			`.md-typescale-${role}-${size}-emphasized { ${body} font-weight: calc(var(${p}-weight) + ${EMPHASIZED_WEIGHT_DELTA}); }`
		);
	}
}
out();
out('/* 정보 위계 (DESIGN_PLAN §6.1-5) */');
for (const [name, role, size, emph, tabular] of HIERARCHY) {
	const p = `--md-sys-typescale-${role}-${size}`;
	const weight = emph ? `calc(var(${p}-weight) + ${EMPHASIZED_WEIGHT_DELTA})` : `var(${p}-weight)`;
	out(
		`.hoola-type-${name} { font-family: var(--md-ref-typeface-plain); font-size: var(${p}-size); line-height: var(${p}-line-height); letter-spacing: var(${p}-tracking); font-weight: ${weight};${tabular ? ' font-variant-numeric: tabular-nums;' : ''} }`
	);
}
out();
out('@media (prefers-reduced-motion: reduce) {');
out('\t:root {');
for (const scheme of Object.keys(SPRINGS)) {
	for (const name of Object.keys(SPRINGS[scheme as keyof typeof SPRINGS])) {
		out(`\t\t--md-sys-motion-spring-${scheme}-${name}-duration: 0ms;`);
	}
}
out('\t}');
out('}');

const css = lines.join('\n') + '\n';

if (failures.length) {
	console.error('명암 대비 검사 실패:\n' + failures.map((f) => '  ✕ ' + f).join('\n'));
	process.exit(1);
}
console.log(`명암 대비: 6개 테마 × ${checkContrast(all['light-standard']).length}쌍 모두 통과`);

if (process.argv.includes('--check')) {
	const current = readFileSync(OUT, 'utf8');
	if (current !== css) {
		console.error('tokens.css가 spec.ts와 다르다. `npm run tokens`를 실행해 다시 생성하세요.');
		process.exit(1);
	}
	console.log('tokens.css 최신 상태');
} else {
	writeFileSync(OUT, css);
	console.log(`생성: ${OUT} (${css.length.toLocaleString()}자)`);
}
