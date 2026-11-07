// 옛 미리보기(/hoola-ai/next/)의 서비스 워커를 이 파일로 바꿔 스스로 등록을 지운다.
// 브라우저는 /next/를 열 때 이 주소의 워커가 바뀌었는지 확인하고, 바뀌었으면 새로 설치한다.
// 캐시는 지우지 않는다. 이름(hoola-shell-*, hoola-fonts)을 정식 앱 워커와 같이 쓰므로
// 옛 셸 캐시는 정식 앱 워커가 활성화될 때 정리한다.
//
// 되돌리기가 필요할 때 같은 내용을 정식 앱 워커 주소(/hoola-ai/service-worker.js)에 두면 kill switch가 된다.
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
	event.waitUntil(
		(async () => {
			await self.registration.unregister();
			const windows = await self.clients.matchAll({ type: 'window' });
			// 열린 페이지는 옛 앱 캐시에서 떴을 수 있다. 등록을 지운 뒤 안내 페이지를 다시 받게 한다
			await Promise.all(windows.map((c) => c.navigate(self.registration.scope).catch(() => {})));
		})()
	);
});
