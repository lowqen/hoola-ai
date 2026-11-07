import { readdirSync } from 'node:fs';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';

// 다른 테스트와 달리 여기서만 서비스 워커를 켠다 (playwright.config.ts)
test.use({ serviceWorkers: 'allow' });

const ROUTES = ['./', 'train/', 'records/', 'gallery/', 'motion/', 'about/', 'theme/'];
const FONT_COUNT = readdirSync('build/_app/immutable/assets').filter((f) =>
	f.endsWith('.woff2')
).length;

const cacheSize = (page: Page, name: string) =>
	page.evaluate(async (n) => (await (await caches.open(n)).keys()).length, name);

/** 첫 방문에서 설치·활성화를 거쳐 글꼴까지 다 받은 뒤 네트워크를 끊는다. */
async function installThenGoOffline(page: Page, context: BrowserContext) {
	await page.goto('./');
	await page.waitForFunction(() => navigator.serviceWorker.controller !== null, undefined, {
		timeout: 60_000
	});
	await expect.poll(() => cacheSize(page, 'hoola-fonts'), { timeout: 120_000 }).toBe(FONT_COUNT);
	await context.setOffline(true);
	// robots.txt는 미리 캐시하지 않으므로, 이 요청이 실패해야 정말 끊긴 것이다
	const reachable = await page.evaluate(() =>
		fetch('robots.txt', { cache: 'no-store' }).then(
			() => true,
			() => false
		)
	);
	expect(reachable).toBe(false);
}

test('매니페스트: 설치에 필요한 값과 규격대로의 아이콘', async ({ page, request }) => {
	await page.goto('./');
	const href = await page.locator('link[rel="manifest"]').getAttribute('href');
	const manifestUrl = new URL(href!, page.url());
	const response = await request.get(manifestUrl.href);
	expect(response.ok()).toBe(true);
	const manifest = await response.json();
	expect(manifest).toMatchObject({
		name: '훌라 연습장',
		short_name: '훌라',
		display: 'standalone',
		theme_color: '#1f6f50'
	});
	expect(new URL(manifest.start_url, manifestUrl).href).toBe(new URL('./', page.url()).href);

	const sizes: string[] = [];
	for (const icon of manifest.icons) {
		const png = await (await request.get(new URL(icon.src, manifestUrl).href)).body();
		// PNG IHDR: 16바이트부터 가로·세로
		expect(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`).toBe(icon.sizes);
		sizes.push(`${icon.sizes} ${icon.purpose}`);
	}
	expect(sizes).toEqual(expect.arrayContaining(['192x192 any', '512x512 any', '512x512 maskable']));
});

test('오프라인: 모든 화면이 캐시에서 뜨고 실패한 요청이 없다', async ({ page, context }) => {
	test.setTimeout(240_000);
	await installThenGoOffline(page, context);

	const failed: string[] = [];
	page.on('requestfailed', (r) => failed.push(`${r.failure()?.errorText} ${r.url()}`));
	for (const route of ROUTES) {
		const response = await page.goto(route);
		expect(response?.fromServiceWorker(), route).toBe(true);
		expect(response?.ok(), route).toBe(true);
		// 글꼴을 받는 도중에 이동하면 취소된 요청이 실패로 잡힌다
		await page.waitForLoadState('load');
		await page.evaluate(() => document.fonts.ready);
	}
	expect(failed).toEqual([]);
});

test('오프라인: 앱을 새로 열어 WASM 엔진으로 판을 시작한다', async ({ page, context }) => {
	test.setTimeout(240_000);
	await installThenGoOffline(page, context);

	await page.close();
	const reopened = await context.newPage();
	await reopened.goto('./');
	await reopened.getByTestId('start').click();
	await expect(reopened.getByTestId('hand')).toBeVisible({ timeout: 30_000 });
	await expect(reopened.getByTestId('hand').locator('[data-card]').first()).toBeVisible();
});

test('오프라인: 앱을 닫았다 다시 열면 두던 판이 이어진다', async ({ page, context }) => {
	test.setTimeout(240_000);
	await installThenGoOffline(page, context);
	await page.evaluate(() =>
		localStorage.setItem(
			'hoola-practice-v1',
			JSON.stringify({ settings: { coached: true }, games: [] })
		)
	);
	await page.goto('./');
	await page.getByTestId('start').click();
	const hand = page.getByTestId('hand').locator('[data-card]');
	await expect(page.getByTestId('turn')).toHaveText('내 차례', { timeout: 30_000 });
	const before = await hand.count();
	await page.locator('[data-slot="primary"]').click();
	await expect(hand).toHaveCount(before + 1);
	const ids = await hand.evaluateAll((els) => els.map((e) => e.getAttribute('data-card')));

	await page.close();
	const reopened = await context.newPage();
	await reopened.goto('./');
	const restored = reopened.getByTestId('hand').locator('[data-card]');
	await expect(restored).toHaveCount(before + 1, { timeout: 30_000 });
	expect(await restored.evaluateAll((els) => els.map((e) => e.getAttribute('data-card')))).toEqual(
		ids
	);
});

test('오프라인: 목록에 없는 주소는 첫 화면으로 받는다', async ({ page, context }) => {
	test.setTimeout(240_000);
	await installThenGoOffline(page, context);

	await page.goto('no-such-page/');
	await expect(page.getByTestId('start')).toBeVisible();
});

test('새 버전이 활성화되면 옛 캐시를 지운다', async ({ page }) => {
	// 서비스 워커가 등록되지 않는 파일에서 옛 버전이 남긴 캐시를 흉내 낸다
	await page.goto('robots.txt');
	await page.evaluate(async () => {
		await caches.open('hoola-shell-old');
		const fonts = await caches.open('hoola-fonts');
		await fonts.put('retired.woff2', new Response('x'));
	});

	await page.goto('./');
	await page.waitForFunction(() => navigator.serviceWorker.controller !== null, undefined, {
		timeout: 60_000
	});
	const names = await page.evaluate(() => caches.keys());
	expect(names).not.toContain('hoola-shell-old');
	expect(names.filter((n) => n.startsWith('hoola-shell-'))).toHaveLength(1);
	const fontUrls = await page.evaluate(async () =>
		(await (await caches.open('hoola-fonts')).keys()).map((r) => r.url)
	);
	expect(fontUrls.filter((u) => u.endsWith('retired.woff2'))).toEqual([]);
});
