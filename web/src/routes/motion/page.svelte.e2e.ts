import { expect, test, type Page } from '@playwright/test';

const card = (page: Page, id: string) => page.getByTestId('hand').locator(`[data-card="${id}"]`);
const handCount = (page: Page) => page.getByTestId('hand').locator('[data-card]').count();
const slot = (page: Page, id: string) => page.locator(`[data-slot="${id}"]`);

async function center(page: Page, selector: string) {
	const box = await page.locator(selector).first().boundingBox();
	if (!box) throw new Error(`no box: ${selector}`);
	return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** 카드를 끌어 놓는다 (실제 포인터 경로). */
async function drag(page: Page, id: string, target: string) {
	const from = await center(page, `[data-testid="hand"] [data-card="${id}"]`);
	const to = await center(page, target);
	await page.mouse.move(from.x, from.y);
	await page.mouse.down();
	await page.mouse.move(from.x + 10, from.y - 10);
	await page.mouse.move(to.x, to.y, { steps: 8 });
	await page.mouse.up();
}

/** 무한 반복(차례 펄스)을 뺀 애니메이션이 모두 끝났는지. */
const settled = () =>
	document
		.getAnimations()
		.every(
			(a) => a.playState !== 'running' || a.effect?.getComputedTiming().iterations === Infinity
		);

test.beforeEach(async ({ page }) => {
	await page.goto('./motion/');
	await expect(page.getByTestId('turn')).toHaveText('내 차례');
});

// 예전에는 수화 뒤 폭을 재서 한 줄 → 두 줄로 바꿔 CLS 0.099가 났다 (Lighthouse 모바일 폭 412px)
for (const [width, height, rows] of [
	[412, 823, 2],
	[1350, 940, 1]
] as const) {
	test(`손패는 프리렌더부터 ${rows}줄이고 ${width}px에서 레이아웃이 밀리지 않는다`, async ({
		page
	}) => {
		await page.setViewportSize({ width, height });
		await page.addInitScript(() => {
			const shifts: number[] = [];
			(window as unknown as { shifts: number[] }).shifts = shifts;
			new PerformanceObserver((list) => {
				for (const e of list.getEntries()) shifts.push((e as unknown as { value: number }).value);
			}).observe({ type: 'layout-shift', buffered: true });
		});
		await page.goto('./motion/', { waitUntil: 'networkidle' });
		await expect(page.getByTestId('turn')).toHaveText('내 차례');
		const tops = await page
			.getByTestId('hand')
			.locator('[data-card]')
			.evaluateAll(
				(cards) => new Set(cards.map((c) => c.closest('.slot')!.getBoundingClientRect().top)).size
			);
		expect(tops).toBe(rows);
		const cls = await page.evaluate(() =>
			(window as unknown as { shifts: number[] }).shifts.reduce((sum, v) => sum + v, 0)
		);
		expect(cls).toBeLessThan(0.01);
	});
}

test('오류 없이 그려지고 360px에서 가로 스크롤이 없다', async ({ page }) => {
	const errors: string[] = [];
	page.on('pageerror', (e) => errors.push(String(e)));
	await page.setViewportSize({ width: 360, height: 800 });
	await page.reload();
	await page.getByRole('button', { name: '받기', exact: true }).click();
	await expect.poll(() => handCount(page)).toBe(8);
	await page.screenshot({ path: 'test-results/motion-360.png', fullPage: true });
	const scroll = await page.evaluate(() => [
		document.documentElement.scrollWidth,
		document.documentElement.clientWidth
	]);
	expect(scroll[0]).toBeLessThanOrEqual(scroll[1]);
	expect(errors).toEqual([]);
});

test('아이콘 스프라이트가 배포 경로에서 실제로 그려진다', async ({ page }) => {
	const icon = page.locator('[data-slot="stop"] svg use');
	const href = await icon.getAttribute('href');
	expect(href).toContain('#stop_circle');
	const status = await page.evaluate(async (url) => (await fetch(url)).status, href!.split('#')[0]);
	expect(status).toBe(200);
	// 스프라이트를 못 읽으면 use의 크기가 0이다
	await expect
		.poll(() => icon.evaluate((el) => (el as SVGGraphicsElement).getBBox().width))
		.toBeGreaterThan(0);
});

test('카드는 "하트 10"처럼 읽힌다', async ({ page }) => {
	await expect(page.getByTestId('sizes').getByRole('img', { name: '하트 10' })).toHaveCount(4);
	await expect(page.getByTestId('hand').getByRole('button', { name: '스페이드 10' })).toBeVisible();
});

test('키보드: ←/→로 이동하고 Space로 고른다', async ({ page }) => {
	const first = page.getByTestId('hand').locator('[data-card]').first();
	await first.focus();
	await page.keyboard.press('ArrowRight');
	const focused = page.locator(':focus');
	const id = await focused.getAttribute('data-card');
	expect(id).not.toBe(await first.getAttribute('data-card'));
	await page.keyboard.press('Space');
	await expect(focused).toHaveAttribute('aria-pressed', 'true');
	await page.keyboard.press('Space');
	await expect(focused).toHaveAttribute('aria-pressed', 'false');
	// 탭 순서에는 한 장만 든다
	await expect(page.getByTestId('hand').locator('[tabindex="0"]')).toHaveCount(1);
});

test('받기: 더미에서 날아오는 동안 transform 애니메이션이 돈다', async ({ page }) => {
	await page.locator('[data-zone="stock"] button').click();
	const running = await page.evaluate(() => {
		const el = document.querySelector('[data-testid="hand"] [data-card="5D"]')?.closest('.slot');
		return el?.getAnimations().length ?? -1;
	});
	expect(running).toBeGreaterThan(0);
	await expect(card(page, '5D')).toBeVisible();
	await expect.poll(() => handCount(page)).toBe(8);
});

test('등록 → 끌어서 붙이기 → 끌어서 버리기', async ({ page }) => {
	await page.locator('[data-slot="primary"]').click();

	// 등록 전에는 붙일 수 없고, 고른 카드 미리보기가 뜬다
	await card(page, '7C').click();
	await expect(page.getByTestId('action-preview')).toHaveText('등록 7♣');
	await slot(page, 'register').click();
	await expect(page.locator('[data-drop="meld-1"]')).toBeVisible();
	await expect.poll(() => handCount(page)).toBe(7);

	// 6♣를 7♣ 조합으로 끌어 놓는다
	await drag(page, '6C', '[data-drop="meld-1"]');
	await expect(page.locator('[data-drop="meld-1"] [data-card="6C"]')).toBeVisible();
	await expect.poll(() => handCount(page)).toBe(6);

	// 아무 데도 아닌 곳에 놓으면 제자리로 돌아온다
	await drag(page, '2D', '[data-zone="seat-1"]');
	await expect.poll(() => handCount(page)).toBe(6);
	await expect(card(page, '2D')).toHaveAttribute('aria-pressed', 'false');
	await page.waitForFunction(settled);

	// 버림패로 끌어 놓으면 봇 차례가 된다
	await drag(page, '2D', '[data-zone="discard"]');
	await expect(page.locator('[data-zone="discard"] [data-card="2D"]')).toBeVisible();
	await expect(page.getByTestId('turn')).toHaveText('상대 차례');
});

test('두 번 탭으로 버리고, 한 바퀴 뒤 땡큐를 한다', async ({ page }) => {
	await page.locator('[data-slot="primary"]').click();
	await expect.poll(() => handCount(page)).toBe(8);
	await card(page, '2D').dblclick();
	await expect(page.locator('[data-zone="discard"] [data-card="2D"]')).toBeVisible();

	// 봇 둘이 받고 버린다: 좌석 장수는 그대로, 버림패는 8♠
	await expect(page.getByTestId('turn')).toHaveText('내 차례', { timeout: 15_000 });
	await expect(page.locator('[data-zone="discard"] [data-card="8S"]')).toBeVisible();
	await expect(page.getByTestId('seat-count-1')).toHaveText('7');

	await card(page, '9S').click();
	await card(page, 'TS').click();
	await expect(page.getByTestId('action-preview')).toHaveText('땡큐 8♠ 9♠ 10♠');
	await slot(page, 'thankyou').click();
	await expect(page.locator('[data-drop="meld-1"] [data-card="8S"]')).toBeVisible();
	await expect(page.locator('[data-zone="discard"] [data-card="8S"]')).toHaveCount(0);
});

test('되돌리기: 스낵바 한 번에 버린 카드가 손패로 돌아오고 봇이 멈춘다', async ({ page }) => {
	await page.locator('[data-slot="primary"]').click();
	await expect.poll(() => handCount(page)).toBe(8);
	await card(page, '2D').click();
	await page.locator('[data-slot="primary"]').click();
	await expect(page.getByTestId('turn')).toHaveText('상대 차례');
	await page.getByRole('button', { name: '되돌리기' }).click();
	await expect(card(page, '2D')).toBeVisible();
	await expect.poll(() => handCount(page)).toBe(8);
	await expect(page.getByTestId('turn')).toHaveText('내 차례');
	await expect(page.locator('[data-zone="discard"] [data-card="2D"]')).toHaveCount(0);
});

test('고정 슬롯: 단계가 바뀌어도 행동 바 위치가 같다', async ({ page }) => {
	const positions = async () => {
		const out: number[] = [];
		for (const id of ['stop', 'thankyou', 'register', 'attach', 'primary']) {
			out.push((await slot(page, id).boundingBox())!.x);
		}
		return out;
	};
	const before = await positions();
	await page.locator('[data-slot="primary"]').click();
	await expect(slot(page, 'primary')).toContainText('버리기');
	expect(await positions()).toEqual(before);
});

test('모션 줄이기: 카드가 즉시 자리에 가고 고스트가 없다', async ({ page }) => {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await page.reload();
	await page.locator('[data-slot="primary"]').click();
	await expect(card(page, '5D')).toBeVisible();
	const running = () =>
		page.evaluate(
			() =>
				[...document.querySelectorAll('[data-testid="hand"] .slot')].filter((el) =>
					el.getAnimations().some((a) => a.playState === 'running')
				).length
		);
	expect(await running()).toBe(0);
	await card(page, '2D').dblclick();
	await expect(page.getByTestId('turn')).toHaveText('내 차례', { timeout: 15_000 });
	await expect(page.locator('.ghost')).toHaveCount(0);
});

/** 한 판 흐름을 돌리는 동안 프레임 간격을 잰다. 받기·버리기와 봇 두 차례(고스트 포함)를 포함한다. */
async function measure(page: Page) {
	await page.evaluate(() => {
		const w = window as unknown as { __frames: number[]; __stop: boolean };
		w.__frames = [];
		w.__stop = false;
		let last = performance.now();
		const tick = (now: number) => {
			w.__frames.push(now - last);
			last = now;
			if (!w.__stop) requestAnimationFrame(tick);
		};
		requestAnimationFrame(tick);
	});
	await page.locator('[data-slot="primary"]').click();
	await expect.poll(() => handCount(page)).toBe(8);
	await card(page, '2D').dblclick();
	await expect(page.getByTestId('turn')).toHaveText('내 차례', { timeout: 15_000 });
	const frames = await page.evaluate(() => {
		const w = window as unknown as { __frames: number[]; __stop: boolean };
		w.__stop = true;
		return w.__frames.slice(1).sort((a, b) => a - b);
	});
	const total = frames.reduce((s, f) => s + f, 0);
	return {
		count: frames.length,
		fps: (frames.length / total) * 1000,
		p95: frames[Math.floor(frames.length * 0.95)],
		worst: frames[frames.length - 1]
	};
}

test('프레임: 일반 CPU에서 60fps에 가깝다 (트레이스를 보고서에 첨부)', async ({
	page,
	browser
}, info) => {
	const path = info.outputPath('motion-trace.json');
	await browser.startTracing(page, {
		path,
		categories: ['devtools.timeline', 'blink.user_timing']
	});
	const m = await measure(page);
	await browser.stopTracing();
	await info.attach('motion-trace.json', { path, contentType: 'application/json' });
	console.log(
		`프레임 일반: ${m.fps.toFixed(1)}fps p95 ${m.p95.toFixed(1)}ms 최악 ${m.worst.toFixed(1)}ms (${m.count})`
	);
	expect(m.fps).toBeGreaterThanOrEqual(50);
});

test('프레임: CPU 4배 저하에서 30fps 이상', async ({ page }) => {
	const cdp = await page.context().newCDPSession(page);
	await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
	const m = await measure(page);
	console.log(
		`프레임 4x: ${m.fps.toFixed(1)}fps p95 ${m.p95.toFixed(1)}ms 최악 ${m.worst.toFixed(1)}ms (${m.count})`
	);
	expect(m.fps).toBeGreaterThanOrEqual(30);
});

test.describe('터치', () => {
	test.use({ hasTouch: true, viewport: { width: 360, height: 800 } });

	test('탭으로 고르고, 두 번 탭으로 버린다', async ({ page }) => {
		await page.locator('[data-slot="primary"]').tap();
		await expect.poll(() => handCount(page)).toBe(8);
		const c = card(page, '9S');
		await page.waitForFunction(settled);
		const at = await center(page, '[data-testid="hand"] [data-card="9S"]');
		// 한 번 탭하면 고른다
		await page.touchscreen.tap(at.x, at.y);
		await expect(c).toHaveAttribute('aria-pressed', 'true');
		await page.waitForTimeout(400);
		await page.touchscreen.tap(at.x, at.y);
		await expect(c).toHaveAttribute('aria-pressed', 'false');
		await page.waitForTimeout(400);
		// 빠르게 두 번 탭하면 버린다 (올라오는 중에도 같은 자리를 누른다)
		await page.touchscreen.tap(at.x, at.y);
		await page.touchscreen.tap(at.x, at.y);
		await expect(page.locator('[data-zone="discard"] [data-card="9S"]')).toBeVisible();
	});

	test('끌어서 버린다 (브라우저가 스크롤로 가로채지 않는다)', async ({ page }) => {
		await page.locator('[data-slot="primary"]').tap();
		await expect.poll(() => handCount(page)).toBe(8);
		await page.waitForFunction(settled);
		const from = await center(page, '[data-testid="hand"] [data-card="9S"]');
		const to = await center(page, '[data-zone="discard"]');
		const cdp = await page.context().newCDPSession(page);
		const touch = (type: string, x?: number, y?: number) =>
			cdp.send('Input.dispatchTouchEvent', {
				type: type as 'touchStart',
				touchPoints: x === undefined ? [] : [{ x, y: y! }]
			});
		await touch('touchStart', from.x, from.y);
		for (let i = 1; i <= 8; i++) {
			await touch(
				'touchMove',
				from.x + ((to.x - from.x) * i) / 8,
				from.y + ((to.y - from.y) * i) / 8
			);
		}
		await page.waitForTimeout(50);
		await touch('touchEnd');
		await expect(page.locator('[data-zone="discard"] [data-card="9S"]')).toBeVisible();
		await expect.poll(() => handCount(page)).toBe(7);
	});
});
