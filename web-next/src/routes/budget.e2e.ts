import { gzipSync } from 'node:zlib';
import { expect, test } from '@playwright/test';

// 성능 예산 (DESIGN_PLAN §7): 앱 JS gzip 60KB 이하. WASM과 그 연결 코드(hoola_wasm)는 따로 본다.
const BUDGET_KB = 60;
// 판을 시작하면 판 화면을 더 받는다. 60KB를 넘는 값이므로 DESIGN_PLAN D4에 초과분을 기록해 둔다. 늘지 않게 막는 상한이다.
const PLAY_BUDGET_KB = 65;
// /theme은 개발용 미리보기다. 색 계산 라이브러리를 첫 그리기 뒤에 불러오므로 그 묶음은 첫 로드 예산에서 뺀다.
const ROUTES = ['./', './train/', './gallery/', './motion/'];

for (const route of [...ROUTES, 'play']) {
	test(`JS 예산: ${route}`, async ({ page }) => {
		const sizes: { name: string; gz: number }[] = [];
		const reads: Promise<void>[] = [];
		page.on('response', (r) => {
			if (r.request().resourceType() !== 'script' || /hoola_wasm/.test(r.url())) return;
			reads.push(
				r
					.body()
					.then((body) => {
						sizes.push({ name: r.url().split('/').pop()!, gz: gzipSync(body).length });
					})
					// 측정이 끝난 뒤 도착한 응답은 읽지 못해도 된다
					.catch(() => {})
			);
		});
		if (route === 'play') {
			// 대전은 첫 화면뿐 아니라 판을 시작한 뒤까지 합쳐 본다 (시트는 열 때 따로 받는다)
			await page.goto('./', { waitUntil: 'networkidle' });
			await page.getByTestId('start').click();
			await page.getByTestId('hand').waitFor();
			await page.waitForLoadState('networkidle');
		} else {
			await page.goto(route, { waitUntil: 'networkidle' });
		}
		await Promise.all(reads);
		const kb = sizes.reduce((sum, s) => sum + s.gz, 0) / 1024;
		const limit = route === 'play' ? PLAY_BUDGET_KB : BUDGET_KB;
		console.log(`JS 예산 ${route}: ${kb.toFixed(1)}KB / ${limit}KB (${sizes.length}개)`);
		expect(kb).toBeLessThanOrEqual(limit);
	});
}
