// 새 버전 적용 (서비스 워커). 새 워커는 설치 뒤 대기하고, 이 모듈이 적용 시점을 정한다.
// - 앱을 연 직후(아직 아무것도 누르지 않았을 때) 새 버전이 준비돼 있거나 곧 준비되면 바로 새로고침한다.
// - 쓰는 도중에 준비되면 스낵바로 알리고, 누르면 새로고침한다. 진행 중인 판은 행동마다 저장되어 이어진다.
// - 화면으로 돌아올 때와 한 시간마다 새 버전을 확인한다 (설치형 앱은 탭이 닫히지 않아 이게 없으면 계속 옛 버전이다).
import { snackbar } from '#lib/ui/snackbar.svelte.ts';

const STARTUP_MS = 8000;
const CHECK_EVERY_MS = 60 * 60 * 1000;
const RECHECK_GAP_MS = 60 * 1000;

export async function watchUpdates(): Promise<void> {
	if (!('serviceWorker' in navigator)) return;
	const sw = navigator.serviceWorker;
	const started = performance.now();
	let touched = false;
	addEventListener('pointerdown', () => (touched = true), { once: true, capture: true });
	addEventListener('keydown', () => (touched = true), { once: true, capture: true });

	let applying = false;
	sw.addEventListener('controllerchange', () => {
		// 처음 설치할 때의 clients.claim()으로도 일어나므로, 직접 요청했을 때만 새로고침한다
		if (applying) location.reload();
	});
	const apply = (worker: ServiceWorker) => {
		applying = true;
		worker.postMessage('skip-waiting');
	};

	let offered = false;
	const offer = (worker: ServiceWorker) => {
		// 컨트롤러가 없으면 첫 설치라 옛 버전이 없다
		if (!sw.controller || offered) return;
		offered = true;
		if (!touched && performance.now() - started < STARTUP_MS) {
			apply(worker);
			return;
		}
		snackbar.show({
			message: '새 버전이 나왔다',
			actionLabel: '새로고침',
			onAction: () => apply(worker),
			duration: 0,
			closable: true
		});
	};

	const reg = await sw.ready;
	const track = (worker: ServiceWorker | null) => {
		if (!worker) return;
		if (worker.state === 'installed') offer(worker);
		else
			worker.addEventListener('statechange', () => worker.state === 'installed' && offer(worker));
	};
	track(reg.waiting);
	track(reg.installing);
	reg.addEventListener('updatefound', () => track(reg.installing));

	let lastCheck = performance.now();
	const check = () => {
		if (performance.now() - lastCheck < RECHECK_GAP_MS) return;
		lastCheck = performance.now();
		reg.update().catch(() => {});
	};
	document.addEventListener(
		'visibilitychange',
		() => document.visibilityState === 'visible' && check()
	);
	setInterval(check, CHECK_EVERY_MS);
}
