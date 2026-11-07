// 오프라인 지원 (DESIGN_PLAN §7). 앱 셸·WASM 엔진은 설치 때 한꺼번에 받고, 글꼴(약 3MB)은 활성화 뒤 백그라운드로 받는다.
//
// 업데이트: skipWaiting을 쓰지 않는다. 열린 페이지가 옛 지연 로드 묶음을 찾지 못해 판 도중에 깨질 수 있어서,
// 새 버전은 앱을 모두 닫았다 다시 열 때 적용한다.
import { version } from '$app/env';
import { assets, immutable, prerendered } from '$app/manifest';

const sw = self as unknown as ServiceWorkerGlobalScope;

const SHELL_PREFIX = 'hoola-shell-';
const SHELL = `${SHELL_PREFIX}${version}`;
/** 글꼴은 파일명에 해시가 있어 버전이 바뀌어도 다시 받지 않는다. */
const FONTS = 'hoola-fonts';

const toPathname = (path: string) =>
	new URL(path.replace(/^\//, ''), sw.registration.scope).pathname;
const isFont = (pathname: string) => pathname.endsWith('.woff2');

const built = immutable.map((f) => toPathname(f.path));
const FONT_PATHS = built.filter(isFont);
// 타입 선언과 robots.txt는 앱 실행에 필요 없다
const staticFiles = assets
	.map((f) => f.path as string)
	.filter((p) => !/(\.d\.ts|robots\.txt)$/.test(p));
const SHELL_PATHS = new Set([
	...built.filter((p) => !isFont(p)),
	...staticFiles.map(toPathname),
	...prerendered.map((p) => toPathname(p.path))
]);
const START_PAGE = toPathname('');

sw.addEventListener('install', (event) => {
	// HTML·WASM은 파일명에 해시가 없다. HTTP 캐시의 옛 파일이 새 버전에 섞이지 않게 서버에 재검증한다
	const requests = [...SHELL_PATHS].map((p) => new Request(p, { cache: 'no-cache' }));
	event.waitUntil(caches.open(SHELL).then((cache) => cache.addAll(requests)));
});

sw.addEventListener('activate', (event) => {
	event.waitUntil(
		(async () => {
			for (const name of await caches.keys()) {
				if (name.startsWith(SHELL_PREFIX) && name !== SHELL) await caches.delete(name);
			}
			const fonts = await caches.open(FONTS);
			for (const request of await fonts.keys()) {
				if (!FONT_PATHS.includes(new URL(request.url).pathname)) await fonts.delete(request);
			}
			await sw.clients.claim();
		})()
	);
	// activate를 기다리게 하면 그동안 모든 요청이 멈추므로 따로 받는다
	void cacheFonts();
});

let fontsTask: Promise<void> | undefined;

/** 아직 없는 글꼴을 받는다. 끊겨도 다음 페이지 이동 때 이어 받는다. 데이터 절약 모드면 쓰는 글꼴만 그때그때 저장한다. */
function cacheFonts() {
	return (fontsTask ??= (async () => {
		const { connection } = navigator as Navigator & { connection?: { saveData?: boolean } };
		if (connection?.saveData) return;
		const cache = await caches.open(FONTS);
		const have = new Set((await cache.keys()).map((r) => new URL(r.url).pathname));
		await Promise.allSettled(FONT_PATHS.filter((p) => !have.has(p)).map((p) => cache.add(p)));
	})().finally(() => {
		fontsTask = undefined;
	}));
}

async function fromShell(request: Request, pathname: string) {
	const cache = await caches.open(SHELL);
	return (await cache.match(pathname)) ?? fetch(request);
}

async function fromFonts(request: Request) {
	const cache = await caches.open(FONTS);
	// 미리 받을 때와 글꼴 로더의 요청 헤더가 달라 Vary가 있으면 빗나간다. 파일명에 해시가 있어 무시해도 안전하다
	const cached = await cache.match(request, { ignoreVary: true });
	if (cached) return cached;
	const response = await fetch(request);
	if (response.ok) await cache.put(request, response.clone());
	return response;
}

/** 목록에 없는 주소로 들어오면 온라인은 그대로 보내고, 오프라인은 첫 화면을 보여 준다. */
async function navigateElsewhere(request: Request) {
	try {
		return await fetch(request);
	} catch {
		return (await caches.match(START_PAGE, { cacheName: SHELL })) ?? Response.error();
	}
}

sw.addEventListener('fetch', (event) => {
	const { request } = event;
	if (request.method !== 'GET') return;
	const url = new URL(request.url);
	if (url.origin !== location.origin) return;
	const { pathname } = url;

	if (isFont(pathname)) {
		event.respondWith(fromFonts(request));
	} else if (SHELL_PATHS.has(pathname)) {
		event.respondWith(fromShell(request, pathname));
	} else if (request.mode === 'navigate') {
		event.respondWith(navigateElsewhere(request));
	}
	if (request.mode === 'navigate') event.waitUntil(cacheFonts());
});
