import { expect, test } from '@playwright/test';

// 대체 글꼴과 Pretendard의 폭이 달라 빠듯한 문구는 글꼴이 바뀔 때 줄 수가 변하고 아래 요소를 민다.
// Lighthouse 폭(412px)에서는 잡히지 않아 좁은 화면에서 따로 잰다.
for (const route of ['./', './train/', './records/']) {
	test(`글꼴이 늦게 와도 360px에서 밀리지 않는다: ${route}`, async ({ page }) => {
		await page.setViewportSize({ width: 360, height: 640 });
		await page.route('**/*.woff2', async (r) => {
			await new Promise((resolve) => setTimeout(resolve, 300));
			await r.continue();
		});
		await page.addInitScript(() => {
			const shifts: number[] = [];
			(window as unknown as { shifts: number[] }).shifts = shifts;
			new PerformanceObserver((list) => {
				for (const e of list.getEntries()) shifts.push((e as unknown as { value: number }).value);
			}).observe({ type: 'layout-shift', buffered: true });
		});
		await page.goto(route, { waitUntil: 'networkidle' });
		await page.evaluate(() => document.fonts.ready);
		await page.waitForTimeout(300);
		const cls = await page.evaluate(() =>
			(window as unknown as { shifts: number[] }).shifts.reduce((sum, v) => sum + v, 0)
		);
		console.log(`360px CLS ${route}: ${cls.toFixed(4)}`);
		expect(cls).toBeLessThan(0.01);
	});
}
