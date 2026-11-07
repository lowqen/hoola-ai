import { expect, test, type Page } from '@playwright/test';

// 훈련 화면 E2E. 문제는 엔진이 무작위로 만들므로, 채점 결과는 피드백과 저장 기록이 일치하는지로 확인한다.
const stored = (page: Page) =>
	page.evaluate(() => JSON.parse(localStorage.getItem('hoola-practice-v1') ?? '{}'));
const feedback = (page: Page) => page.getByTestId('feedback');

async function openDrill(page: Page, drill: string) {
	await page.goto(`./train/?drill=${drill}`);
	await expect(page.getByTestId('t-question')).toHaveAttribute('data-drill', drill, {
		timeout: 30_000
	});
}

const handCards = (page: Page) => page.getByTestId('hand').locator('[data-card]');
const handKey = async (page: Page) =>
	(await handCards(page).evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.card)))
		.sort()
		.join(' ');

// 예전 앱이 저장한 오답 노트 형식 그대로다
const NOTE = {
	key: 'old-1',
	obs: {
		num_players: 2,
		current_player: 0,
		phase: 'meld',
		hand: ['KS', '2H', '5D', '9C'],
		hand_points: 29,
		hand_counts: [4, 6],
		registered: [false, false],
		melds: [],
		discard_top: '3S',
		visible_discards: ['3S'],
		stock_len: 30,
		discard_count: 1,
		known_discards: ['3S'],
		thank_you_target: null,
		stop_limit: 10,
		events: [],
		revealed_hands: null
	},
	scored: [
		{ action: 'discard KS', value: 0.6, gap: 0, gap_se: 0.01 },
		{ action: 'discard 2H', value: 0.3, gap: 0.3, gap_se: 0.01 }
	],
	best: 'discard KS',
	lines: ['복기에서 틀린 장면'],
	category: 'discard',
	at: '2026-11-01T00:00:00.000Z',
	solved: 0
};

test('홈: 유형 카드와 빈 오답 노트 안내가 보인다', async ({ page }) => {
	await page.goto('./train/');
	await expect(page.getByTestId('t-start')).toBeVisible();
	for (const drill of ['meld', 'thankyou', 'stop', 'discard']) {
		await expect(page.getByTestId(`t-drill-${drill}`)).toBeVisible();
	}
	await expect(page.getByTestId('t-notebook-empty')).toBeVisible();
	await expect(page.getByTestId('t-today')).toContainText('오늘은 아직 안 풀었다');
});

test('스톱 판단: 답하면 피드백이 뜨고 기록이 저장된다', async ({ page }) => {
	await openDrill(page, 'stop');
	await page.getByTestId('t-draw').click();
	await expect(feedback(page)).toBeVisible();
	await expect(feedback(page)).toContainText('기준표');
	const ok = (await feedback(page).getAttribute('data-ok')) === 'true';
	const store = await stored(page);
	expect(store.train.stop.n).toBe(1);
	expect(store.train.stop.correct).toBe(ok ? 1 : 0);
	expect(Object.values<{ n: number }>(store.trainDays)[0].n).toBe(1);
	// 틀린 스톱 문제는 예전 형식 그대로 오답 노트에 들어간다
	expect(store.notebook?.length ?? 0).toBe(ok ? 0 : 1);
	if (!ok) expect(store.notebook[0].category).toBe('stop');
	await expect(page.getByTestId('t-next')).toBeFocused();
});

test('땡큐 찾기: 카드를 덜 고르면 안내만 나오고 채점하지 않는다', async ({ page }) => {
	await openDrill(page, 'thankyou');
	await page.getByTestId('t-thankyou').click();
	await expect(page.getByTestId('t-message')).toContainText('2장 이상');
	await expect(feedback(page)).toHaveCount(0);
	await page.getByTestId('t-draw').click();
	await expect(feedback(page)).toBeVisible();
});

test('버릴 카드: 규칙 점수표와 승률 막대를 보여 준다', async ({ page }) => {
	await openDrill(page, 'discard');
	await page.getByTestId('t-submit').click();
	await expect(page.getByTestId('t-message')).toContainText('버릴 카드를 고르세요');
	await handCards(page).first().click();
	await page.getByTestId('t-submit').click();
	await expect(page.getByTestId('rule-table')).toBeVisible();
	await expect(page.getByTestId('bars')).toBeVisible();
	await expect(feedback(page).getByText('내 답').first()).toBeVisible();
});

test('조합 찾기: 틀린 문제는 3문제 뒤에 다시 나오고, 최선의 묶음으로 풀면 맞는다', async ({
	page
}) => {
	test.setTimeout(120_000);
	await openDrill(page, 'meld');

	// 조합이 아닌 카드를 묶으면 안내만 나온다
	await handCards(page).nth(0).click();
	await handCards(page).nth(1).click();
	await page.getByTestId('t-bind').click();
	await expect(page.getByTestId('t-message')).toContainText('조합이 아니다');
	await expect(page.getByTestId('t-group')).toHaveCount(0);
	await handCards(page).nth(0).click();
	await handCards(page).nth(1).click();

	// 처음 나온 문제는 일부러 비워서 틀리고, 정답을 외운다
	const answers = new Map<string, string[]>();
	let retried = 0;
	for (let step = 0; step < 24; step++) {
		const summary = page.getByTestId('t-summary');
		const question = page.getByTestId('t-question');
		await expect(summary.or(question).first()).toBeVisible({ timeout: 30_000 });
		if (await summary.isVisible()) break;
		const retry = await page.getByTestId('t-retry').isVisible();
		const key = await handKey(page);
		const known = answers.get(key);
		if (retry) {
			expect(known, '다시 푸는 문제는 앞서 나온 장면이다').toBeDefined();
			retried++;
			for (const meld of known!) {
				for (const card of meld.split(' ')) {
					await page.getByTestId('hand').locator(`[data-card="${card}"]`).click();
				}
				await page.getByTestId('t-bind').click();
				await expect(page.getByTestId('t-group').last()).toBeVisible();
			}
		}
		await page.getByTestId('t-submit').click();
		await expect(feedback(page)).toBeVisible();
		if (retry) {
			await expect(feedback(page)).toHaveAttribute('data-ok', 'true');
		} else {
			await expect(feedback(page)).toHaveAttribute('data-ok', 'false');
			const melds = await page
				.getByTestId('best-meld')
				.evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.cards!));
			answers.set(key, melds);
		}
		await page.getByTestId('t-next').click();
	}
	expect(retried).toBe(10);
	// 첫 시도만 정답률에 든다
	await expect(page.getByTestId('t-score')).toHaveText('0 / 10');
	const store = await stored(page);
	expect(store.train.meld.n).toBe(10);
	expect(store.train.meld.correct).toBe(0);
	expect(store.train.meld.best).toBeGreaterThanOrEqual(1);
});

test('오답 노트: 예전 형식 항목을 숫자 키로 풀고, 두 번 맞히면 빠진다', async ({ page }) => {
	await page.addInitScript((note) => {
		if (localStorage.getItem('hoola-practice-v1')) return;
		localStorage.setItem(
			'hoola-practice-v1',
			JSON.stringify({ settings: null, games: [], notebook: [note], custom: 'keep' })
		);
	}, NOTE);
	await page.goto('./train/');
	await expect(page.getByTestId('t-drill-notebook')).toContainText('1개 대기');

	for (const solved of [1, 2]) {
		await page.getByTestId('t-drill-notebook').click();
		const options = page.getByTestId('t-option');
		await expect(options).toHaveCount(2);
		const texts = await options.allTextContents();
		const best = texts.findIndex((t) => t.includes('K♠'));
		await page.keyboard.press(String(best + 1));
		await expect(feedback(page)).toHaveAttribute('data-ok', 'true');
		await expect(feedback(page)).toContainText('복기에서 틀린 장면');
		const store = await stored(page);
		expect(store.custom).toBe('keep');
		if (solved === 1) expect(store.notebook[0].solved).toBe(1);
		else expect(store.notebook).toHaveLength(0);
		await page.keyboard.press('Enter');
		await expect(page.getByTestId('t-summary')).toBeVisible();
		await page.getByTestId('t-home').click();
	}
	await expect(page.getByTestId('t-notebook-empty')).toBeVisible();
});

test('Esc로 그만두고, 탭을 옮겨도 세션이 이어진다', async ({ page }) => {
	await openDrill(page, 'stop');
	await page.getByRole('link', { name: '대전' }).click();
	await expect(page.getByTestId('start')).toBeVisible();
	await page.getByRole('link', { name: '훈련' }).click();
	await expect(page.getByTestId('t-question')).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(page.getByTestId('t-start')).toBeVisible();
});

test('훈련 기록과 대전 설정이 서로 덮어쓰지 않는다', async ({ page }) => {
	await page.goto('./');
	await expect(page.getByTestId('start')).toBeVisible();
	await page.getByRole('link', { name: '훈련' }).click();
	await page.getByTestId('t-drill-stop').click();
	await expect(page.getByTestId('t-question')).toBeVisible({ timeout: 30_000 });
	await page.getByTestId('t-draw').click();
	await expect(feedback(page)).toBeVisible();
	await page.getByRole('link', { name: '대전' }).click();
	await page.getByTestId('open-new-game').click();
	await page.getByText('세부 설정').click();
	await page.getByTestId('seed').fill('123');
	await page.getByTestId('start-game').click();
	await expect(page.getByTestId('hand')).toBeVisible({ timeout: 30_000 });
	const store = await stored(page);
	expect(store.train.stop.n).toBe(1);
	expect(store.settings.seed).toBe('123');
});

test.describe('360×640', () => {
	test.use({ viewport: { width: 360, height: 640 }, hasTouch: true });

	test('행동 바와 다음 버튼이 탭 안에 보이고 가로 스크롤이 없다', async ({ page }) => {
		await openDrill(page, 'discard');
		await page.waitForTimeout(300);
		await page.screenshot({ path: 'test-results/train-360.png' });
		const submit = await page.getByTestId('t-submit').boundingBox();
		expect(submit!.y + submit!.height).toBeLessThanOrEqual(640 - 64);
		expect(submit!.height).toBeGreaterThanOrEqual(48);
		// 손패가 스크롤 없이 행동 바 위에 전부 보인다
		for (const card of await handCards(page).all()) {
			const box = await card.boundingBox();
			expect(box!.y + box!.height).toBeLessThanOrEqual(submit!.y);
		}
		await handCards(page).first().tap();
		await page.getByTestId('t-submit').tap();
		await expect(feedback(page)).toBeVisible();
		await page.waitForTimeout(600);
		await page.screenshot({ path: 'test-results/train-360-feedback.png' });
		const next = await page.getByTestId('t-next').boundingBox();
		expect(next!.y + next!.height).toBeLessThanOrEqual(640 - 64);
		const [scroll, client] = await page.evaluate(() => [
			document.documentElement.scrollWidth,
			document.documentElement.clientWidth
		]);
		expect(scroll).toBeLessThanOrEqual(client);
		const box = await feedback(page).boundingBox();
		expect(box!.height).toBeLessThanOrEqual(640 * 0.6 + 1);
	});

	test('홈 화면', async ({ page }) => {
		await page.goto('./train/');
		await expect(page.getByTestId('t-start')).toBeVisible();
		await page.screenshot({ path: 'test-results/train-home-360.png' });
		const [scroll, client] = await page.evaluate(() => [
			document.documentElement.scrollWidth,
			document.documentElement.clientWidth
		]);
		expect(scroll).toBeLessThanOrEqual(client);
	});
});
