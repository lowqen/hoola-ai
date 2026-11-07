import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

// 기록 화면 E2E. 저장소에는 기존 앱이 남긴 형식 그대로 넣는다.
const review = (categories: Record<string, number>, decisions = 10, accurate = 7, loss = 0.3) => ({
	decisions,
	accurate,
	loss,
	counts: {},
	categories
});
const game = (over: object) => ({
	at: '2026-11-01T00:00:00.000Z',
	players: 3,
	opponents: ['expert', 'expert'],
	seed: 1,
	reason: 'out',
	share: 0,
	undo: false,
	beginner: false,
	replay: {},
	human_seat: 0,
	...over
});
const today = new Date().toISOString().slice(0, 10);

async function seed(page: Page, store: object) {
	await page.addInitScript((value) => {
		localStorage.setItem('hoola-practice-v1', JSON.stringify(value));
	}, store);
}

const full = {
	settings: null,
	games: [
		game({ share: 1, review: review({ stop: 3, discard: 1, other: 1 }) }),
		game({ share: 0, review: review({ stop: 1 }) }),
		game({ share: 1, undo: true }),
		game({ players: 2, opponents: ['friendE'], share: 1, beginner: true })
	],
	trainDays: { [today]: { n: 10, correct: 7 } }
};

test('빈 상태: 첫 판과 첫 훈련으로 가는 버튼을 보여 준다', async ({ page }) => {
	await page.goto('./records/');
	await expect(page.getByTestId('rec-empty')).toContainText('아직 끝낸 판이 없다');
	await expect(page.getByTestId('rec-export')).toHaveCount(0);
	await expect(page.getByTestId('rec-weak-empty')).toBeVisible();
	await expect(page.getByTestId('rec-days-empty')).toBeVisible();
	await page.getByTestId('rec-first-train').click();
	await expect(page.getByTestId('t-start')).toBeVisible();
	await page.getByRole('link', { name: '기록' }).click();
	await page.getByTestId('rec-first-game').click();
	await expect(page.getByTestId('start')).toBeVisible();
});

test.describe('스크립트를 받기 전', () => {
	test.beforeEach(async ({ page }) => {
		await page.route('**/_app/immutable/**/*.js', (route) => route.abort());
	});

	test('처음 온 사람에게는 프리렌더한 빈 상태가 바로 보인다', async ({ page }) => {
		await page.goto('./records/');
		await expect(page.getByTestId('rec-empty')).toBeVisible();
		await expect(page.getByTestId('rec-first-game')).toBeDisabled();
	});

	test('기록이 있는 사람에게는 "기록 없음" 문구를 보여 주지 않는다', async ({ page }) => {
		await seed(page, full);
		await page.goto('./records/');
		await expect(page.getByTestId('rec-empty')).toBeHidden();
		await expect(page.getByTestId('rec-weak-empty')).toBeHidden();
		await expect(page.getByTestId('rec-days-empty')).toBeHidden();
	});
});

test('연습판만 있으면 전적에서 뺀다고 알려 준다', async ({ page }) => {
	await seed(page, { settings: null, games: [game({ undo: true })] });
	await page.goto('./records/');
	await expect(page.getByTestId('rec-empty')).toContainText('연습판 1판');
});

test('승률: 상대 구성별로 묶고 연습판은 뺀다', async ({ page }) => {
	await seed(page, full);
	await page.goto('./records/');
	const rows = page.getByTestId('rec-groups').locator('li');
	await expect(rows).toHaveCount(2);
	await expect(rows.nth(0)).toContainText('3인 · 전문가·전문가');
	await expect(rows.nth(0)).toContainText('50%');
	await expect(rows.nth(0)).toContainText('2판');
	await expect(rows.nth(0)).toContainText('공평한 몫 33%');
	await expect(rows.nth(1)).toContainText('초보 · 2인');
	await expect(rows.nth(1)).toContainText('공평한 몫 50%');
	await expect(page.getByTestId('rec-practice')).toContainText('연습판 1판');
});

test('약점: 집계를 보여 주고, 막대를 누르면 그 유형 훈련으로 간다', async ({ page }) => {
	await seed(page, full);
	await page.goto('./records/');
	await expect(page.getByTestId('rec-weak-summary')).toContainText(
		'복기 2판 · 정확도 70% · 판당 손실 30.0%p'
	);
	await expect(page.getByTestId('rec-weak-stop')).toContainText('4');
	// 훈련이 없는 유형은 링크가 아니다
	await expect(page.locator('a[data-testid="rec-weak-other"]')).toHaveCount(0);
	await expect(page.getByTestId('rec-weak-other')).toBeVisible();
	await page.getByTestId('rec-weak-stop').click();
	await expect(page).toHaveURL(/\/train\/\?drill=stop/);
	await expect(page.getByTestId('t-question')).toHaveAttribute('data-drill', 'stop', {
		timeout: 30_000
	});
});

test('훈련 기록: 최근 푼 날을 읽어 주고, 막대를 가리키면 그 날을 보여 준다', async ({ page }) => {
	await seed(page, full);
	await page.goto('./records/');
	await expect(page.getByTestId('rec-days-summary')).toContainText('10문제 · 정답률 70%');
	await expect(page.getByTestId('rec-days-chart').locator('button')).toHaveCount(14);
	await expect(page.getByTestId('rec-day-readout')).toContainText('10문제 · 정답률 70%');
	const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
	await page.getByTestId(`rec-day-${yesterday}`).hover();
	await expect(page.getByTestId('rec-day-readout')).toContainText('안 풀었다');
});

test('내보내기: 기존 앱과 같은 형식의 JSON을 받는다', async ({ page }) => {
	await seed(page, full);
	await page.goto('./records/');
	const [download] = await Promise.all([
		page.waitForEvent('download'),
		page.getByTestId('rec-export').click()
	]);
	expect(download.suggestedFilename()).toMatch(/^hoola-games-\d{4}-\d{2}-\d{2}\.json$/);
	const body = JSON.parse(readFileSync(await download.path(), 'utf8'));
	expect(body.format).toBe('hoola-practice-1');
	expect(body.games).toHaveLength(4);
});

test.describe('360×640', () => {
	test.use({ viewport: { width: 360, height: 640 }, hasTouch: true });

	test('가로로 넘치지 않고 막대를 탭할 수 있다', async ({ page }) => {
		await seed(page, full);
		await page.goto('./records/');
		await expect(page.getByTestId('rec-groups')).toBeVisible();
		await page.screenshot({ path: 'test-results/records-360.png', fullPage: true });
		const [scroll, client] = await page.evaluate(() => [
			document.documentElement.scrollWidth,
			document.documentElement.clientWidth
		]);
		expect(scroll).toBeLessThanOrEqual(client);
		const row = await page.getByTestId('rec-weak-stop').boundingBox();
		expect(row!.height).toBeGreaterThanOrEqual(48);
		const bar = await page.getByTestId(`rec-day-${today}`).boundingBox();
		expect(bar!.height).toBeGreaterThanOrEqual(48);
		// 손을 떼어도 탭한 날이 그대로 남는다
		const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
		await page.getByTestId(`rec-day-${yesterday}`).tap();
		await expect(page.getByTestId('rec-day-readout')).toContainText('안 풀었다');
		// 하단 바가 마지막 줄을 가리지 않는다
		await page.getByTestId('rec-day-readout').scrollIntoViewIfNeeded();
		await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
		const readout = await page.getByTestId('rec-day-readout').boundingBox();
		const nav = await page.getByRole('navigation').last().boundingBox();
		expect(readout!.y + readout!.height).toBeLessThanOrEqual(nav!.y);
	});
});
