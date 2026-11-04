// 테마 적용: <html data-theme="light|dark" data-contrast="standard|medium|high">.
// 첫 그리기 전에 app.html의 인라인 스크립트가 같은 규칙으로 먼저 설정한다(깜빡임 방지).
import type { ContrastName, ThemeName } from './spec.ts';

export type ThemePref = 'auto' | ThemeName;
export type ContrastPref = 'auto' | ContrastName;
export interface Prefs {
	theme: ThemePref;
	contrast: ContrastPref;
}

const KEY = 'hoola-theme';
const DEFAULT: Prefs = { theme: 'auto', contrast: 'auto' };

export function readPrefs(): Prefs {
	try {
		const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Prefs>;
		return {
			theme: raw.theme === 'light' || raw.theme === 'dark' ? raw.theme : 'auto',
			contrast:
				raw.contrast === 'standard' || raw.contrast === 'medium' || raw.contrast === 'high'
					? raw.contrast
					: 'auto'
		};
	} catch {
		return { ...DEFAULT };
	}
}

export function savePrefs(p: Prefs): void {
	try {
		localStorage.setItem(KEY, JSON.stringify(p));
	} catch {
		/* 저장 못 해도 이번 화면에는 적용된다 */
	}
}

export function resolvePrefs(p: Prefs): { theme: ThemeName; contrast: ContrastName } {
	const theme =
		p.theme === 'auto'
			? matchMedia('(prefers-color-scheme: dark)').matches
				? 'dark'
				: 'light'
			: p.theme;
	const contrast =
		p.contrast === 'auto'
			? matchMedia('(prefers-contrast: more)').matches
				? 'high'
				: 'standard'
			: p.contrast;
	return { theme, contrast };
}

/** 설정을 문서에 적용하고 저장한다. 적용된 실제 값을 돌려준다. */
export function applyPrefs(p: Prefs, save = true): { theme: ThemeName; contrast: ContrastName } {
	const r = resolvePrefs(p);
	const root = document.documentElement;
	root.dataset.theme = r.theme;
	root.dataset.contrast = r.contrast;
	if (save) savePrefs(p);
	return r;
}

/** 'auto' 설정일 때 시스템 설정 변화를 따라간다. 해제 함수를 돌려준다. */
export function followSystem(get: () => Prefs, onChange: () => void): () => void {
	const queries = [
		matchMedia('(prefers-color-scheme: dark)'),
		matchMedia('(prefers-contrast: more)')
	];
	const handler = () => {
		applyPrefs(get(), false);
		onChange();
	};
	queries.forEach((q) => q.addEventListener('change', handler));
	return () => queries.forEach((q) => q.removeEventListener('change', handler));
}
