import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
	await page.goto('./gallery/');
});

test('갤러리가 오류 없이 그려진다', async ({ page }) => {
	const errors: string[] = [];
	page.on('pageerror', (e) => errors.push(String(e)));
	await page.reload();
	for (const h of ['버튼', 'FAB', '선택 · 칩', '대화상자 · 시트 · 스낵바']) {
		await expect(page.getByRole('heading', { name: h, exact: true })).toBeVisible();
	}
	await page.screenshot({ path: 'test-results/gallery.png', fullPage: true });
	expect(errors).toEqual([]);
});

test('키보드 포커스가 보인다', async ({ page }) => {
	const btn = page.getByTestId('btn-filled');
	await btn.focus();
	await page.keyboard.press('Tab');
	await page.keyboard.press('Shift+Tab');
	await expect(btn).toBeFocused();
	const outline = await btn.evaluate((el) => getComputedStyle(el).outlineStyle);
	expect(outline).toBe('solid');
});

test('대화상자: Esc로 닫히고 포커스가 돌아온다', async ({ page }) => {
	const opener = page.getByTestId('open-dialog');
	await opener.click();
	const dlg = page.getByRole('dialog', { name: '스톱 기준표' });
	await expect(dlg).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(dlg).toBeHidden();
	await expect(opener).toBeFocused();
});

test('바텀 시트: 열고 시작 버튼으로 닫는다', async ({ page }) => {
	await page.getByTestId('open-sheet').click();
	const sheet = page.getByRole('dialog', { name: '새 판' });
	await expect(sheet).toBeVisible();
	await page.getByTestId('sheet-start').click();
	await expect(sheet).toBeHidden();
});

test('스낵바의 되돌리기가 동작한다', async ({ page }) => {
	await page.getByTestId('snack-undo').click();
	const snack = page.getByTestId('snackbar');
	await expect(snack).toContainText('K♦를 버렸다');
	await snack.getByRole('button', { name: '되돌리기' }).click();
	await expect(page.getByTestId('last-action')).toContainText('되돌림');
	await expect(page.getByTestId('last-action')).toContainText('버린 카드 0장');
});

test('세그먼트 버튼: 화살표로 이동하고 비활성 항목은 건너뛴다', async ({ page }) => {
	const group = page.getByTestId('seg-players');
	await group.getByRole('radio', { name: '2인' }).focus();
	await page.keyboard.press('ArrowRight');
	await expect(page.getByTestId('seg-value')).toHaveText('인원: 3');
	await page.keyboard.press('ArrowRight');
	await page.keyboard.press('ArrowRight'); // 5인은 비활성 → 2인으로
	await expect(page.getByTestId('seg-value')).toHaveText('인원: 2');
	await expect(group.getByRole('radio', { name: '2인' })).toBeFocused();
});

test('스위치는 스페이스로 켠다', async ({ page }) => {
	const sw = page.getByTestId('switch-beginner');
	await sw.focus();
	await page.keyboard.press('Space');
	await expect(sw).toBeChecked();
});

test('메뉴: 열고 항목을 고르면 닫힌다', async ({ page }) => {
	await page.getByRole('button', { name: '더보기' }).first().click();
	const menu = page.getByRole('menu', { name: '더보기' });
	await expect(menu).toBeVisible();
	await menu.getByRole('menuitem', { name: '기록 내보내기' }).click();
	await expect(menu).toBeHidden();
	await expect(page.getByTestId('menu-choice')).toHaveText('메뉴 선택: export');
});

test('행동 바: 단계와 선택이 바뀌어도 버튼 자리가 그대로다 (고정 슬롯)', async ({ page }) => {
	const device = page.getByTestId('device');
	await device.scrollIntoViewIfNeeded();
	// 행동 바 기준 상대 위치 (페이지 스크롤과 무관하게)
	const boxes = async () =>
		device.locator('[data-slot]').evaluateAll((els) =>
			els.map((e) => {
				const bar = e.closest('[role=toolbar]')!.getBoundingClientRect();
				const a = e.getBoundingClientRect();
				const r = { x: a.x - bar.x, y: a.y - bar.y, width: a.width, height: a.height };
				return [
					e.getAttribute('data-slot'),
					Math.round(r.x),
					Math.round(r.y),
					Math.round(r.width),
					Math.round(r.height)
				];
			})
		);
	const base = await boxes();
	expect(base.map((b) => b[0])).toEqual(['stop', 'thankyou', 'register', 'attach', 'primary']);
	const phase = page.getByTestId('seg-phase');
	for (const name of ['받은 뒤', '상대 차례', '차례 시작']) {
		await phase.getByRole('radio', { name }).click();
		expect(await boxes()).toEqual(base);
		if (name !== '상대 차례') {
			await device.getByRole('button', { name: '5♠' }).click();
			await device.getByRole('button', { name: '5♥' }).click();
			await expect(page.getByTestId('action-preview')).not.toBeEmpty();
			expect(await boxes()).toEqual(base);
			await device.getByRole('button', { name: '5♠' }).click();
			await device.getByRole('button', { name: '5♥' }).click();
		}
	}
	// 할 수 없는 행동은 사라지지 않고 비활성으로 남는다
	await phase.getByRole('radio', { name: '상대 차례' }).click();
	await expect(device.locator('[data-slot][aria-disabled="true"]')).toHaveCount(5);
});

test('행동 바의 모든 버튼은 터치 영역 48px 이상', async ({ page }) => {
	const sizes = await page
		.getByTestId('device')
		.locator('[data-slot]')
		.evaluateAll((els) =>
			els.map((e) => [e.getBoundingClientRect().width, e.getBoundingClientRect().height])
		);
	for (const [w, h] of sizes) {
		expect(w).toBeGreaterThanOrEqual(48);
		expect(h).toBeGreaterThanOrEqual(48);
	}
});

test('휴대폰 폭(360px)에서 가로 스크롤이 없다', async ({ page }) => {
	await page.setViewportSize({ width: 360, height: 780 });
	await page.reload();
	const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
	expect(overflow).toBeLessThanOrEqual(0);
	await page.getByTestId('device').scrollIntoViewIfNeeded();
	await page.screenshot({ path: 'test-results/gallery-phone.png' });
});
