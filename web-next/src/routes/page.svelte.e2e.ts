import { expect, test } from '@playwright/test';

test('엔진을 불러와 한 판을 끝까지 계산한다', async ({ page }) => {
	const errors: string[] = [];
	page.on('pageerror', (e) => errors.push(String(e)));
	page.on('console', (m) => {
		if (m.type() === 'error') errors.push(m.text());
	});
	await page.goto('./');
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('훌라 연습장');
	const status = page.getByTestId('engine-status');
	await expect(status).toHaveAttribute('data-status', 'ready', { timeout: 30_000 });
	await expect(status).toContainText('엔진 0.');
	await expect(status).toContainText('수 만에');
	expect(errors).toEqual([]);
});

test('지금 버전 연습장 링크는 상위 경로를 가리킨다', async ({ page }) => {
	await page.goto('./');
	await expect(page.getByRole('link', { name: /지금 버전 연습장/ })).toHaveAttribute('href', '../');
});
