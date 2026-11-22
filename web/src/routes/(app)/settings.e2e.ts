import { expect, test } from '@playwright/test';

const theme = (page: import('@playwright/test').Page) =>
	page.evaluate(() => document.documentElement.dataset.theme);

test('화면 설정: 다크를 고르면 바로 바뀌고, 다시 열어도 유지되며, 대전 탭에도 같은 값이 보인다', async ({
	page
}) => {
	await page.emulateMedia({ colorScheme: 'light' });
	await page.goto('./records/');
	expect(await theme(page)).toBe('light');

	await page.getByTestId('open-settings').click();
	const segmented = page.getByTestId('theme');
	await segmented.getByRole('radio', { name: '다크' }).click();
	expect(await theme(page)).toBe('dark');

	await page.reload();
	expect(await theme(page)).toBe('dark');

	await page.goto('./');
	await page.getByTestId('open-new-game').click();
	await page.getByText('세부 설정').click();
	await expect(page.getByTestId('theme').getByRole('radio', { name: '다크' })).toBeChecked();
	await page.getByTestId('theme').getByRole('radio', { name: '기기 설정' }).click();
	expect(await theme(page)).toBe('light');
	await page.emulateMedia({ colorScheme: 'dark' });
	await expect.poll(() => theme(page)).toBe('dark');
});

const lang = (page: import('@playwright/test').Page) =>
	page.evaluate(() => document.documentElement.lang);

test('언어 설정: English를 고르면 새로고침 뒤 영어로 바뀌고 유지되며, 한국어로 되돌릴 수 있다', async ({
	page
}) => {
	await page.goto('./records/');
	await expect(page.getByRole('heading', { name: '상대 구성별 승률' })).toBeVisible();

	await page.getByTestId('open-settings').click();
	await Promise.all([
		page.waitForEvent('load'),
		page.getByTestId('lang').getByRole('radio', { name: 'English' }).click()
	]);
	await expect(page.getByRole('heading', { name: 'Win rate by line-up' })).toBeVisible();
	expect(await lang(page)).toBe('en');
	await expect(page.getByRole('link', { name: 'Train' })).toBeVisible();

	// 다른 화면도, 다시 열어도 영어
	await page.goto('./');
	await expect(page.getByRole('button', { name: 'Start a game' })).toBeVisible();
	await page.reload();
	await expect(page.getByRole('button', { name: 'Start a game' })).toBeVisible();

	await page.getByTestId('open-new-game').click();
	await page.getByText('More settings').click();
	await Promise.all([
		page.waitForEvent('load'),
		page.getByTestId('lang').getByRole('radio', { name: '한국어' }).click()
	]);
	await expect(page.getByRole('button', { name: '새 판 시작' })).toBeVisible();
	expect(await lang(page)).toBe('ko');
});

test.describe('한국어가 아닌 브라우저', () => {
	test.use({ locale: 'en-US' });

	test('처음 한 번 English로 볼지 묻고, 누르면 영어로 바뀐다', async ({ page }) => {
		await page.goto('./');
		await expect(page.getByRole('button', { name: '새 판 시작' })).toBeVisible();
		const offer = page.getByText('View this app in English?');
		await expect(offer).toBeVisible();
		await Promise.all([
			page.waitForEvent('load'),
			page.getByRole('button', { name: 'English' }).click()
		]);
		await expect(page.getByRole('button', { name: 'Start a game' })).toBeVisible();

		// 한국어로 되돌린 뒤에는 다시 묻지 않는다
		await page.evaluate(() => localStorage.setItem('hoola-lang', 'ko'));
		await page.reload();
		await expect(page.getByRole('button', { name: '새 판 시작' })).toBeVisible();
		await expect(offer).toHaveCount(0);
	});
});
