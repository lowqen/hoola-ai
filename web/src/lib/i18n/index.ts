// 화면 언어 (한국어 · English). 문구는 코드에 한국어로 두고 t('한국어')로 감싼다.
// - 영어 사전(en.json)은 English를 고른 사람만 받는다. 받은 사전은 localStorage에 두고, 다음부터는
//   모듈을 읽는 순간 동기로 꺼내 쓴다. 그래서 모듈 맨 위의 문구도, 첫 그리기도 바로 영어다.
// - 언어를 바꾸면 새로고침해 모든 문구를 한 번에 바꾼다.
// - 기본은 한국어다. 브라우저 언어가 한국어가 아니면 처음 한 번 English로 볼지 묻는다 (첫 화면을 늦추지 않는다).
// app.html의 인라인 스크립트가 같은 규칙으로 <html lang>을 정한다.

export type Lang = 'ko' | 'en';

const LANG_KEY = 'hoola-lang';
const DICT_KEY = 'hoola-lang-en';

function readStored(key: string): string | null {
	try {
		return typeof localStorage === 'undefined' ? null : localStorage.getItem(key);
	} catch {
		return null;
	}
}

function detect(): Lang {
	return readStored(LANG_KEY) === 'en' ? 'en' : 'ko';
}

/** 이번 화면의 언어. 바꾸려면 setLang (새로고침한다). */
export const lang: Lang = detect();

let dict: Record<string, string> | undefined;
if (lang === 'en') {
	try {
		dict = JSON.parse(readStored(DICT_KEY) ?? 'null') ?? undefined;
	} catch {
		dict = undefined;
	}
}

/** 첫 그리기를 보여도 되는가 (영어인데 사전이 아직 없으면 받아서 새로고침할 때까지 가린다). */
export const ready = lang === 'ko' || dict !== undefined;

/**
 * 한국어 문구를 지금 언어로. {이름} 자리는 vars로 채운다. 사전에 없으면 한국어 그대로.
 * 같은 한국어가 영어로 갈리면 '등록#seat'처럼 #문맥을 붙인다 (한국어로 보일 때는 떼어 낸다).
 */
export function t(ko: string, vars?: Record<string, string | number>): string {
	const s = dict?.[ko] ?? ko.replace(/#\w+$/, '');
	return vars ? s.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? '')) : s;
}

async function loadDict(): Promise<string> {
	const m = await import('./en.json');
	return JSON.stringify(m.default);
}

/** 언어를 바꾸고 새로고침한다. */
export async function setLang(next: Lang): Promise<void> {
	try {
		localStorage.setItem(LANG_KEY, next);
		if (next === 'en') localStorage.setItem(DICT_KEY, await loadDict());
	} catch {
		/* 저장하지 못하면 이번 화면만 그대로 둔다 */
		return;
	}
	location.reload();
}

/**
 * 첫 화면 뒤에 부른다. 영어면 사전을 최신으로 바꿔 둔다(앱이 업데이트되면 다음에 열 때 반영).
 * 한국어 기본인데 브라우저가 다른 언어이고 아직 묻지 않았으면 true: 부른 쪽이 English로 볼지 한 번 묻는다.
 * 이 모듈은 엔진 워커도 불러오므로 화면 모듈(스낵바 등)을 가져오지 않는다.
 */
export async function syncDict(): Promise<boolean> {
	if (lang === 'en') {
		const fresh = await loadDict();
		if (!dict) {
			await setLang('en');
			return false;
		}
		try {
			if (readStored(DICT_KEY) !== fresh) localStorage.setItem(DICT_KEY, fresh);
		} catch {
			/* 다음에 다시 시도한다 */
		}
		return false;
	}
	if (readStored(LANG_KEY) || /^ko/i.test(navigator.language)) return false;
	try {
		localStorage.setItem(LANG_KEY, 'ko');
	} catch {
		return false;
	}
	return true;
}
