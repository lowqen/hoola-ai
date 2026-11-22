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
