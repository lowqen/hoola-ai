import { expect, test, type Locator, type Page } from '@playwright/test';

// 대전 화면 E2E. 기존 앱의 browser-smoke.mjs와 같은 흐름에 과업 시나리오(DESIGN_PLAN §6.6)를 더한다.
// 시드는 엔진으로 찾아 고정했다 (사람이 선이 되는 3인전, 시드 % 3 = 0).
const SEED = {
	register: '12', // 받으면 등록 4H 4D 4C
	thankYou: '27', // 첫 차례 땡큐 AH 2H + KH
	attach: '30', // 받으면 등록 7S 뒤 붙이기 6S
	stop: '984' // 등록 먼저, 큰 카드부터 버리면 내 네 번째 행동에서 스톱 가능
};

interface StoreSeed {
	players?: number;
	seed?: string;
	beginner?: boolean;
	coached?: boolean;
	speed?: number;
	games?: unknown[];
	extra?: Record<string, unknown>;
}

async function seedStore(page: Page, opts: StoreSeed = {}) {
	await page.addInitScript((o) => {
		if (localStorage.getItem('hoola-practice-v1')) return; // 새로고침 때는 유지
		localStorage.setItem(
			'hoola-practice-v1',
			JSON.stringify({
				settings: {
					players: o.players ?? 3,
					opponents: ['friendA', 'friendB', 'expert', 'expert'],
					speed: o.speed ?? 60,
					seed: o.seed ?? '777',
					beginner: o.beginner ?? false,
					coached: o.coached ?? true
				},
				games: o.games ?? [],
				...o.extra
			})
		);
	}, opts);
}

const slot = (page: Page, id: string) => page.locator(`[data-slot="${id}"]`);
const handCard = (page: Page, id: string) =>
	page.getByTestId('hand').locator(`[data-card="${id}"]`);
const handCards = (page: Page) => page.getByTestId('hand').locator('[data-card]');
const snack = (page: Page) => page.getByTestId('snackbar');
const stored = (page: Page) =>
	page.evaluate(() => JSON.parse(localStorage.getItem('hoola-practice-v1')!));

/** 선택지 시트는 처음 열 때 불러오므로 잠시 기다린다. 선택지가 하나면 시트 없이 바로 둔다. */
async function pickFirstChoice(page: Page) {
	const choices = page.getByTestId('choices');
	const shown = await choices.waitFor({ timeout: 500 }).then(
		() => true,
		() => false
	);
	if (shown) await choices.getByRole('button').first().click();
}

async function start(page: Page) {
	await page.goto('./');
	await page.getByTestId('start').click();
	await expect(page.getByTestId('hand')).toBeVisible({ timeout: 30_000 });
}

const myTurn = (page: Page) => expect(page.getByTestId('turn')).toHaveText('내 차례');

/** 내 차례이거나 판이 끝날 때까지 기다린다. */
const waitTurnOrOver = (page: Page) =>
	expect(page.getByTestId('turn')).toHaveText(/내 차례|판 종료/, { timeout: 30_000 });

const pts = (card: string) => 'A23456789TJQK'.indexOf(card.slice(0, -1)) + 1;

async function handIds(page: Page) {
	return handCards(page).evaluateAll((els) => els.map((e) => e.getAttribute('data-card')!));
}

/** 탭 수를 세어 가며 누른다. */
function tapCounter() {
	const counter = {
		count: 0,
		async tap(locator: Locator) {
			counter.count++;
			await locator.click();
		}
	};
	return counter;
}

test('스모크: 힌트·되돌리기·끝까지 두기·전적 저장 (기존 앱과 같은 흐름)', async ({ page }) => {
	test.setTimeout(240_000);
	const errors: string[] = [];
	page.on('pageerror', (e) => errors.push(String(e)));
	page.on('console', (m) => {
		if (m.type() === 'error') errors.push(m.text());
	});
	await seedStore(page, { beginner: true });
	await start(page);
	await myTurn(page).catch(() => {});

	// 1) 힌트(워커)와 되돌리기
	await waitTurnOrOver(page);
	await page.getByTestId('hint').click();
	await expect(page.getByTestId('hint-list').locator('li').first()).toBeVisible({
		timeout: 60_000
	});
	await page.keyboard.press('Escape');
	await expect(page.locator('dialog[open]')).toHaveCount(0);
	const before = await handIds(page);
	await slot(page, 'primary').click(); // 받기
	await expect(handCards(page)).toHaveCount(before.length + 1);
	await page.getByTestId('undo').click();
	await expect(handCards(page)).toHaveCount(before.length);
	await expect(page.getByTestId('turn')).toHaveText('내 차례');

	// 2) 끝까지 두기: 받고, 등록할 수 있으면 등록하고, 가장 큰 카드를 버린다
	for (let i = 0; i < 300; i++) {
		await waitTurnOrOver(page);
		if ((await page.getByTestId('turn').textContent())?.includes('판 종료')) break;
		const primary = slot(page, 'primary');
		const label = await primary.textContent();
		if (label?.includes('받기')) {
			await primary.click();
		} else {
			const ids = await handIds(page);
			const pick = ids.sort((a, b) => pts(b) - pts(a))[0];
			await handCard(page, pick).click();
			await primary.click();
		}
		await page.waitForTimeout(20);
	}
	await expect(page.getByTestId('result-title')).toBeVisible({ timeout: 30_000 });
	console.log(
		'결과:',
		await page.getByTestId('result-title').textContent(),
		await page.getByTestId('result-reason').textContent()
	);
	await expect(page.getByTestId('result-hands').locator('li')).toHaveCount(3);

	// 3) 전적 저장: 기존 앱과 같은 형식이다
	const games = (await stored(page)).games;
	expect(games).toHaveLength(1);
	expect(games[0]).toMatchObject({
		players: 3,
		opponents: ['friendA', 'friendB'],
		seed: 777,
		undo: true,
		beginner: true,
		human_seat: 0
	});
	expect(games[0].replay).toBeTruthy();

	// 4) 같은 패 다시: 같은 시드로 다시 시작한다
	await page.getByTestId('same-game').click();
	await expect(page.locator('dialog[open]')).toHaveCount(0);
	await expect(page.getByTestId('hand')).toBeVisible();
	await waitTurnOrOver(page);
	expect(errors).toEqual([]);
});

test('셀프 모드: 고정 슬롯, 합법 여부를 미리 알려 주지 않고 누르면 거절한다', async ({ page }) => {
	await seedStore(page, { seed: SEED.register });
	await start(page);
	await myTurn(page);
	await expect(page.getByTestId('hint')).toHaveCount(0);

	// 스톱은 눌러 봐야 안다
	await expect(slot(page, 'stop')).toHaveAttribute('aria-disabled', 'false');
	await slot(page, 'stop').click({ force: true });
	await expect(snack(page)).toContainText('점 이하일 때만 스톱할 수 있다');
	await snack(page).getByRole('button', { name: '규칙 보기' }).click();
	await expect(page.getByRole('heading', { name: '규칙 30초 요약' })).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(page.locator('dialog[open]')).toHaveCount(0);

	// 받기 전에는 등록이 비활성이고, 눌러도 자리는 그대로이고 이유를 말한다
	const box = await slot(page, 'register').boundingBox();
	await slot(page, 'register').click({ force: true });
	await expect(snack(page)).toContainText('받은 뒤에 등록할 수 있다');

	await slot(page, 'primary').click(); // 받기
	await expect(handCards(page)).toHaveCount(8);
	expect(await slot(page, 'register').boundingBox()).toEqual(box);

	// 7이 아닌 카드 1장 등록 → 거절, 손패는 그대로
	const nonSeven = (await handIds(page)).find((c) => !c.startsWith('7'))!;
	await handCard(page, nonSeven).click();
	await expect(page.getByTestId('action-preview')).toContainText('버리기');
	await slot(page, 'register').click();
	await expect(snack(page)).toContainText('등록할 수 있다');
	await expect(handCards(page)).toHaveCount(8);

	// 고른 카드 버리기
	await slot(page, 'primary').click();
	await expect(page.getByTestId('log')).toContainText('나 · 버림');
	await expect(handCards(page)).toHaveCount(7);
});

test('초보자 모드: 할 수 있는 수만 켜지고, 고를 수가 여럿이면 시트로 묻는다', async ({ page }) => {
	await seedStore(page, { seed: SEED.register, beginner: true });
	await start(page);
	await myTurn(page);
	await expect(slot(page, 'stop')).toHaveAttribute('aria-disabled', 'true');
	await slot(page, 'primary').click();
	await expect(handCards(page)).toHaveCount(8);
	await expect(slot(page, 'register')).toHaveAttribute('aria-disabled', 'false');
	await slot(page, 'register').click();
	await pickFirstChoice(page);
	await expect(page.locator('[data-drop^="meld-"]')).toHaveCount(1);
	await expect(page.getByTestId('log')).toContainText('나 · 등록');
});

test('온보딩: 첫 판에 코치마크 3단계, 다시 열지 않고, ?에서 다시 볼 수 있다', async ({ page }) => {
	await seedStore(page, { coached: false, seed: SEED.register });
	await start(page);
	const coach = page.getByTestId('coach');
	await expect(coach).toContainText('내 손패와 점수');
	await page.getByTestId('coach-next').click();
	await expect(coach).toContainText('상대 장수');
	await page.getByTestId('coach-next').click();
	await expect(coach).toContainText('행동 바');
	await page.getByTestId('coach-next').click();
	await expect(coach).toHaveCount(0);
	expect((await stored(page)).settings.coached).toBe(true);

	await page.getByTestId('open-rules').click();
	await page.getByTestId('replay-coach').click();
	await expect(coach).toContainText('내 손패와 점수');
	await page.getByTestId('coach-skip').click();
	await expect(coach).toHaveCount(0);
});

test('저장 데이터 호환: 기존 전적·오답 노트·훈련 기록을 건드리지 않는다', async ({ page }) => {
	const notebook = [{ key: 'k1', solved: 2 }];
	const train = { meld: { n: 3 } };
	await seedStore(page, {
		seed: SEED.stop,
		games: [{ seed: 1, players: 3, opponents: ['friendD'], share: 1, undo: false }],
		extra: { notebook, train }
	});
	await start(page);
	await page.getByTestId('sort').click(); // 설정 저장을 일으킨다
	const saved = await stored(page);
	expect(saved.notebook).toEqual(notebook);
	expect(saved.train).toEqual(train);
	expect(saved.games).toHaveLength(1);
	expect(saved.settings.sort).toBe('rank');
	// 없어진 봇(친구 D)은 저장된 전적을 고치지 않는다
	expect(saved.games[0].opponents).toEqual(['friendD']);
});

test('키보드: D 받기, Enter 주 행동, R·T·S 슬롯', async ({ page }) => {
	await seedStore(page, { seed: SEED.register });
	await start(page);
	await myTurn(page);
	await page.keyboard.press('s');
	await expect(snack(page)).toContainText('스톱');
	await page.keyboard.press('d');
	await expect(handCards(page)).toHaveCount(8);
	const first = handCards(page).first();
	await first.focus();
	await page.keyboard.press('Space');
	await expect(first).toHaveAttribute('aria-pressed', 'true');
	await page.evaluate(() => (document.activeElement as HTMLElement).blur());
	await page.keyboard.press('Enter');
	await expect(handCards(page)).toHaveCount(7);
});

test.describe('휴대폰 360px', () => {
	test.use({ viewport: { width: 360, height: 640 }, hasTouch: true });

	test('8장 손패의 카드마다 탭 폭·높이 48px 이상, 행동 슬롯도 48px, 한 화면에 들어온다', async ({
		page
	}) => {
		await seedStore(page, { seed: SEED.register });
		await start(page);
		await myTurn(page);
		await slot(page, 'primary').click();
		await expect(handCards(page)).toHaveCount(8);
		await page.waitForTimeout(600);
		await page.screenshot({ path: 'test-results/play-360.png', fullPage: true });

		// 실제로 눌리는 영역을 잰다: 1px 간격으로 찍어 그 카드가 맨 위인 폭과 높이
		const exposed = await page.getByTestId('hand').evaluate((hand) => {
			const cards = [...hand.querySelectorAll<HTMLElement>('[data-card]')];
			return cards.map((card) => {
				const r = card.getBoundingClientRect();
				const hits = (x: number, y: number) => {
					const top = document.elementFromPoint(x, y);
					return !!top && (top === card || card.contains(top));
				};
				let w = 0;
				for (let x = r.left; x < r.right; x++) if (hits(x, r.top + 10)) w++;
				let h = 0;
				for (let y = r.top; y < r.bottom; y++) if (hits(r.left + r.width / 2, y)) h++;
				return { id: card.dataset.card, w, h };
			});
		});
		console.log('360px 탭 영역:', JSON.stringify(exposed));
		for (const c of exposed) {
			expect(c.w, `${c.id} 폭`).toBeGreaterThanOrEqual(48);
			expect(c.h, `${c.id} 높이`).toBeGreaterThanOrEqual(48);
		}

		for (const id of ['stop', 'thankyou', 'register', 'attach', 'primary']) {
			const box = (await slot(page, id).boundingBox())!;
			expect(box.width, `${id} 폭`).toBeGreaterThanOrEqual(48);
			expect(box.height, `${id} 높이`).toBeGreaterThanOrEqual(48);
		}

		// 가로 스크롤 없음
		const [scroll, client] = await page.evaluate(() => [
			document.documentElement.scrollWidth,
			document.documentElement.clientWidth
		]);
		expect(scroll).toBeLessThanOrEqual(client);

		// 엄지 영역: 스크롤 없이 행동 바까지 보이고, 하단 내비게이션에 가리지 않는다
		expect(await page.evaluate(() => window.scrollY)).toBe(0);
		const bar = (await slot(page, 'primary').boundingBox())!;
		expect(bar.y + bar.height).toBeLessThanOrEqual(640 - 64);

		// 탭으로 고르면 눌렸다는 표시가 난다
		const last = handCards(page).last();
		await last.tap();
		await expect(last).toHaveAttribute('aria-pressed', 'true');
	});

	test('5인전에서도 가로 스크롤 없이 좌석 장수가 모두 보인다', async ({ page }) => {
		await seedStore(page, { players: 5, seed: '5' });
		await start(page);
		await expect(page.locator('[data-zone^="seat-"]')).toHaveCount(4);
		for (const seat of [1, 2, 3, 4]) {
			await expect(page.getByTestId(`seat-count-${seat}`)).toBeVisible();
			const name = page.locator(`[data-zone="seat-${seat}"] .name`);
			const clipped = await name.evaluate((el) => el.scrollWidth > el.clientWidth);
			expect(clipped, `${seat}번 좌석 이름이 잘린다`).toBe(false);
		}
		await page.waitForTimeout(300);
		await page.screenshot({ path: 'test-results/play-360-5p.png' });
		const bar = await slot(page, 'primary').boundingBox();
		expect(bar!.y + bar!.height).toBeLessThanOrEqual(640 - 64);
		const [scroll, client] = await page.evaluate(() => [
			document.documentElement.scrollWidth,
			document.documentElement.clientWidth
		]);
		expect(scroll).toBeLessThanOrEqual(client);
	});

	test('손패가 줄어도 행동 바는 움직이지 않는다', async ({ page }) => {
		await seedStore(page, { seed: SEED.register });
		await start(page);
		await myTurn(page);
		await page.waitForTimeout(300);
		const at7 = await slot(page, 'primary').boundingBox();
		await slot(page, 'primary').tap();
		await expect(handCards(page)).toHaveCount(8);
		await page.waitForTimeout(600);
		expect(await slot(page, 'primary').boundingBox()).toEqual(at7);
		await handCard(page, '4H').tap();
		await handCard(page, '4D').tap();
		await handCard(page, '4C').tap();
		await slot(page, 'register').tap();
		await expect(handCards(page)).toHaveCount(5);
		await page.waitForTimeout(600);
		const at5 = await slot(page, 'primary').boundingBox();
		expect(at5?.x).toBe(at7?.x);
		expect(at5?.y).toBe(at7?.y);
	});

	test('스낵바가 손패와 행동 바를 가리지 않는다', async ({ page }) => {
		await seedStore(page, { seed: SEED.register });
		await start(page);
		await myTurn(page);
		await slot(page, 'primary').tap();
		await expect(handCards(page)).toHaveCount(8);
		await slot(page, 'stop').tap({ force: true });
		await expect(snack(page)).toBeVisible();
		const s = (await snack(page).boundingBox())!;
		const hand = (await page.getByTestId('hand').boundingBox())!;
		expect(s.y + s.height).toBeLessThanOrEqual(hand.y);
	});
});

// 과업 시나리오 (DESIGN_PLAN §6.6). 8·9번(복기)은 복기 화면을 옮길 때 추가한다.
test.describe('과업 시나리오: 목표 탭 수', () => {
	test('1. 앱 열고 새 판 시작 = 1탭', async ({ page }) => {
		await seedStore(page);
		await page.goto('./');
		const t = tapCounter();
		await t.tap(page.getByTestId('start'));
		await expect(page.getByTestId('hand')).toBeVisible({ timeout: 30_000 });
		expect(t.count).toBeLessThanOrEqual(1);
	});

	test('2. 받기 → 1장 버리기 = 3탭 이하', async ({ page }) => {
		await seedStore(page, { seed: SEED.register });
		await start(page);
		await myTurn(page);
		const t = tapCounter();
		await t.tap(slot(page, 'primary'));
		await expect(handCards(page)).toHaveCount(8);
		await t.tap(handCards(page).first());
		await t.tap(slot(page, 'primary'));
		await expect(handCards(page)).toHaveCount(7);
		expect(t.count).toBeLessThanOrEqual(3);
	});

	test('3. 손패의 조합 등록 = 카드 수 + 1탭', async ({ page }) => {
		await seedStore(page, { seed: SEED.register });
		await start(page);
		await myTurn(page);
		await slot(page, 'primary').click();
		await expect(handCards(page)).toHaveCount(8);
		const t = tapCounter();
		for (const id of ['4H', '4D', '4C']) await t.tap(handCard(page, id));
		await expect(page.getByTestId('action-preview')).toContainText('등록');
		await t.tap(slot(page, 'register'));
		await expect(page.locator('[data-drop="meld-0"]')).toBeVisible();
		await expect(handCards(page)).toHaveCount(5);
		expect(t.count).toBeLessThanOrEqual(4);
	});

	test('4. 바닥 조합에 붙이기 = 2탭', async ({ page }) => {
		await seedStore(page, { seed: SEED.attach });
		await start(page);
		await myTurn(page);
		await slot(page, 'primary').click();
		await handCard(page, '7S').click();
		await slot(page, 'register').click();
		await expect(page.locator('[data-drop="meld-0"]')).toBeVisible();
		const t = tapCounter();
		await t.tap(handCard(page, '6S'));
		await t.tap(page.getByTestId('attach-0'));
		await expect(page.locator('[data-drop="meld-0"] [data-card="6S"]')).toBeVisible();
		expect(t.count).toBeLessThanOrEqual(2);
	});

	test('5. 땡큐 = 카드 2장 + 1탭', async ({ page }) => {
		await seedStore(page, { seed: SEED.thankYou });
		await start(page);
		await myTurn(page);
		const t = tapCounter();
		await t.tap(handCard(page, 'AH'));
		await t.tap(handCard(page, '2H'));
		await expect(page.getByTestId('action-preview')).toContainText('땡큐');
		await t.tap(slot(page, 'thankyou'));
		await expect(page.locator('[data-drop="meld-0"] [data-card="KH"]')).toBeVisible();
		expect(t.count).toBeLessThanOrEqual(3);
	});

	test('6. 스톱 = 1탭', async ({ page }) => {
		await seedStore(page, { seed: SEED.stop, beginner: true });
		await start(page);
		// 등록 먼저, 큰 카드부터 버려 스톱이 켜질 때까지 간다
		for (let i = 0; i < 20; i++) {
			await myTurn(page);
			if ((await slot(page, 'stop').getAttribute('aria-disabled')) === 'false') break;
			const label = await slot(page, 'primary').textContent();
			if (label?.includes('받기')) {
				await slot(page, 'primary').click();
				continue;
			}
			if ((await slot(page, 'register').getAttribute('aria-disabled')) === 'false') {
				await slot(page, 'register').click();
				await pickFirstChoice(page);
				await page.waitForTimeout(50);
				continue;
			}
			const ids = await handIds(page);
			await handCard(page, ids.sort((a, b) => pts(b) - pts(a))[0]).click();
			await slot(page, 'primary').click();
		}
		const t = tapCounter();
		await t.tap(slot(page, 'stop'));
		await expect(page.getByTestId('result-reason')).toContainText('스톱');
		expect(t.count).toBeLessThanOrEqual(1);
	});

	test('7. 방금 수 되돌리기 = 1탭 (스낵바)', async ({ page }) => {
		await seedStore(page, { seed: SEED.register, speed: 900 });
		await start(page);
		await myTurn(page);
		await slot(page, 'primary').click();
		await handCards(page).first().click();
		await slot(page, 'primary').click();
		await expect(handCards(page)).toHaveCount(7);
		const t = tapCounter();
		await t.tap(snack(page).getByRole('button', { name: '되돌리기' }));
		await expect(handCards(page)).toHaveCount(8);
		await expect(page.getByTestId('turn')).toHaveText('내 차례');
		expect(t.count).toBeLessThanOrEqual(1);
		expect(await page.getByTestId('log').textContent()).toContain('되돌리기');
	});

	test('10. 상대를 "실전 친구"로 바꿔 새 판 = 3탭 이하', async ({ page }) => {
		await seedStore(page, { seed: SEED.register });
		await page.goto('./');
		const t = tapCounter();
		await t.tap(page.getByTestId('open-new-game'));
		await t.tap(page.getByTestId('presets').getByRole('button', { name: '실전 친구' }));
		await t.tap(page.getByTestId('start-game'));
		await expect(page.getByTestId('hand')).toBeVisible({ timeout: 30_000 });
		await expect(page.locator('[data-zone="seat-1"]')).toContainText('실전친구');
		expect(t.count).toBeLessThanOrEqual(3);
		expect((await stored(page)).settings.opponents[0]).toBe('friendE');
	});
});
