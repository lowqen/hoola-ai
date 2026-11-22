import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { expect, test } from '@playwright/test';

// JS 용량 예산 (DESIGN_PLAN §7). 앱 JS를 gzip으로 잰다. WASM과 그 연결 코드(hoola_wasm)는 따로 본다.
// - 변경마다: 기준(CI가 받아 오는 마지막 성공한 main의 실측, BUDGET_BASELINE)보다 화면별로 GROWTH_KB 넘게 늘면 실패.
//   의존성 갱신·작은 기능은 손대지 않아도 통과하고, 한 번에 크게 무거워지는 변경은 잡는다.
// - 절대 천장: 조금씩 쌓여 무거워지는 것을 막는 안전망. 목표는 첫 로드 60KB 안팎이다.
// - 실측은 budget-result/에 남겨 CI가 다음 비교의 기준으로 올린다.
const GROWTH_KB = 1.5;
const CEILING_KB = 70;
const PLAY_CEILING_KB = 80;
const baseline: Record<string, number> = process.env.BUDGET_BASELINE
	? JSON.parse(readFileSync(process.env.BUDGET_BASELINE, 'utf8'))
	: {};
// /theme은 개발용 미리보기다. 색 계산 라이브러리를 첫 그리기 뒤에 불러오므로 그 묶음은 첫 로드 예산에서 뺀다.
const ROUTES = ['./', './train/', './records/', './gallery/', './motion/'];

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
			// 첫 판에는 코치마크도 받는다. networkidle은 이미 지난 상태면 바로 끝나므로 직접 기다린다
			await page.getByTestId('coach-skip').waitFor();
		} else {
			await page.goto(route, { waitUntil: 'networkidle' });
		}
		await Promise.all(reads);
		const kb = sizes.reduce((sum, s) => sum + s.gz, 0) / 1024;
		const ceiling = route === 'play' ? PLAY_CEILING_KB : CEILING_KB;
		const base = baseline[route];
		const delta =
			base === undefined
				? '기준 없음'
				: `기준 대비 ${(kb - base >= 0 ? '+' : '') + (kb - base).toFixed(2)}KB`;
		console.log(
			`JS 예산 ${route}: ${kb.toFixed(2)}KB (${sizes.length}개), ${delta}, 천장 ${ceiling}KB`
		);
		if (!existsSync('budget-result')) mkdirSync('budget-result', { recursive: true });
		writeFileSync(
			`budget-result/${route.replace(/\W+/g, '_') || 'home'}.json`,
			JSON.stringify({ [route]: kb })
		);
		expect(kb, '절대 천장').toBeLessThanOrEqual(ceiling);
		if (base !== undefined)
			expect(kb - base, `기준(main) ${base.toFixed(2)}KB 대비 증가`).toBeLessThanOrEqual(GROWTH_KB);
	});
}
