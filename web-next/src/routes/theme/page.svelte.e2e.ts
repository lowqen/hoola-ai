import { expect, test } from '@playwright/test';

test('6개 테마(라이트·다크 × 기본·중간·높은 대비) 모두 명암 대비 검사를 통과한다', async ({
	page
}) => {
	const errors: string[] = [];
	page.on('pageerror', (e) => errors.push(String(e)));
	await page.goto('./theme/');
	const fails = page.getByTestId('contrast-fail-count');
	for (const theme of ['light', 'dark'] as const) {
		await page.getByTestId(`theme-${theme}`).click();
		for (const contrast of ['standard', 'medium', 'high'] as const) {
			await page.getByTestId(`contrast-${contrast}`).click();
			await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
			await expect(page.locator('html')).toHaveAttribute('data-contrast', contrast);
			await expect(fails).toHaveAttribute('data-count', '0');
			// 실제로 적용된 배경색이 테마마다 다르다
			const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
			expect(bg).not.toBe('');
		}
	}
	await page.screenshot({ path: 'test-results/theme-dark-high.png', fullPage: true });
	await page.getByTestId('theme-light').click();
	await page.getByTestId('contrast-standard').click();
	await page.screenshot({ path: 'test-results/theme-light.png', fullPage: true });
	expect(errors).toEqual([]);
});

test('저장한 테마는 새로고침 직후 첫 그리기 전에 적용된다', async ({ page }) => {
	await page.goto('./theme/');
	await page.getByTestId('theme-dark').click();
	await page.getByTestId('contrast-medium').click();
	await page.goto('./');
	// 하이드레이션 전 인라인 스크립트가 설정한 값
	const attrs = await page.evaluate(() => [
		document.documentElement.dataset.theme,
		document.documentElement.dataset.contrast
	]);
	expect(attrs).toEqual(['dark', 'medium']);
	const surface = await page.evaluate(() =>
		getComputedStyle(document.documentElement).getPropertyValue('--md-sys-color-surface').trim()
	);
	expect(surface.toLowerCase()).toMatch(/^#[0-9a-f]{6}$/);
});

test('시드 색을 바꾸면 미리보기 색이 바뀐다', async ({ page }) => {
	await page.goto('./theme/');
	// 색 계산 모듈이 실린 뒤에 시드를 바꾼다
	await expect(page.getByTestId('contrast-fail-count')).toHaveAttribute('data-count', '0');
	const before = await page.evaluate(() =>
		getComputedStyle(document.querySelector('.page')!).getPropertyValue('--md-sys-color-primary')
	);
	await page.getByLabel('시드 색').fill('#3366cc');
	await expect(page.getByRole('button', { name: '되돌리기' })).toBeVisible();
	const after = await page.evaluate(() =>
		getComputedStyle(document.querySelector('.page')!).getPropertyValue('--md-sys-color-primary')
	);
	expect(after.trim()).not.toBe(before.trim());
	await page.getByRole('button', { name: '되돌리기' }).click();
	await expect(page.getByRole('button', { name: '되돌리기' })).toHaveCount(0);
});
