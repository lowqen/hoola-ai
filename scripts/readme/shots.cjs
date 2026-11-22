// README 쇼케이스: 배포된 연습장에서 화면 4개를 라이트·다크로 찍고, 휴대폰 틀에 나란히 넣어
// docs/readme/showcase-{light,dark}.png를 만든다.
//   node scripts/readme/shots.cjs web <임시 폴더> docs/readme
const { createRequire } = require('node:module');
const path = require('node:path');
const fs = require('node:fs');
const webDir = path.resolve(process.argv[2]);
const out = process.argv[3];
const dest = process.argv[4];
const req = createRequire(path.join(webDir, 'package.json'));
const { chromium } = req('@playwright/test');
const BASE = 'https://lowqen.github.io/hoola-ai/';

async function shoot(browser, scheme) {
	const ctx = await browser.newContext({
		viewport: { width: 390, height: 844 },
		deviceScaleFactor: 2,
		colorScheme: scheme,
		reducedMotion: 'reduce',
		serviceWorkers: 'block',
		locale: 'ko-KR'
	});
	const page = await ctx.newPage();
	const snap = async (name) => {
		await page.waitForTimeout(700);
		await page.screenshot({ path: path.join(out, `${name}-${scheme}.png`) });
		console.log('shot', name, scheme);
	};
	const skipCoach = async () => {
		const skip = page.getByTestId('coach-skip');
		if (await skip.isVisible().catch(() => false)) await skip.click();
	};

	// 1. 홈
	await page.goto(BASE, { waitUntil: 'networkidle' });
	await snap('1-home');

	// 2. 새 판 시트: 봇 이름·배지·레이팅
	await page.getByTestId('open-new-game').click();
	await page.waitForTimeout(500);
	const search = page.getByText('탐색', { exact: false }).first();
	if (await search.isVisible().catch(() => false)) await search.click().catch(() => {});
	await snap('2-bots');
	await page.keyboard.press('Escape');
	await page.waitForTimeout(400);

	// 3. 대전 화면: 몇 수 진행된 장면
	await page.goto(BASE, { waitUntil: 'networkidle' });
	await page.getByTestId('start').click();
	await page.getByTestId('hand').waitFor({ timeout: 30000 });
	await page.waitForTimeout(800);
	await skipCoach();
	for (let i = 0; i < 4; i++) {
		await page
			.getByTestId('turn')
			.filter({ hasText: /내 차례|판 종료/ })
			.waitFor({ timeout: 30000 });
		if ((await page.getByTestId('turn').textContent())?.includes('판 종료')) break;
		const choices = page.getByTestId('choices');
		if (await choices.isVisible().catch(() => false)) {
			await choices.getByRole('button').first().click();
		} else {
			// 받기 → 카드 하나 골라 버리기
			const draw = page.getByRole('button', { name: /받기/ }).first();
			if (await draw.isVisible().catch(() => false)) await draw.click();
			await page.waitForTimeout(500);
			const cards = page.getByTestId('hand').locator('[data-card]');
			await cards.last().click();
			const discard = page.getByRole('button', { name: /버리기/ }).first();
			if (await discard.isVisible().catch(() => false)) await discard.click();
		}
		await page.waitForTimeout(1500);
		await skipCoach();
	}
	await page
		.getByTestId('turn')
		.filter({ hasText: /내 차례|판 종료/ })
		.waitFor({ timeout: 30000 })
		.catch(() => {});
	await page.getByTestId('snackbar').waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {});
	await snap('3-play');

	// 4. 훈련 문제
	await page.goto(BASE + 'train/?drill=meld', { waitUntil: 'networkidle' });
	await page.getByTestId('t-question').waitFor({ timeout: 30000 });
	await page.waitForTimeout(800);
	await snap('4-train');
	await ctx.close();
}

const ORDER = ['3-play', '2-bots', '4-train', '1-home'];
const FRAME = {
	light: { border: '#d5e0d8', shadow: 'rgba(30, 60, 45, 0.18)' },
	dark: { border: '#2c3a32', shadow: 'rgba(0, 0, 0, 0.55)' }
};

async function showcase(browser, scheme) {
	const imgs = ORDER.map((n) => {
		const b64 = fs.readFileSync(path.join(out, `${n}-${scheme}.png`)).toString('base64');
		return `<img src="data:image/png;base64,${b64}">`;
	}).join('');
	const f = FRAME[scheme];
	const html = `<!doctype html><html><head><style>
		html, body { margin: 0; background: transparent; }
		.row { display: flex; gap: 40px; padding: 36px 44px 56px; width: max-content; }
		img { width: 330px; border-radius: 40px; border: 6px solid ${f.border};
			box-shadow: 0 18px 40px ${f.shadow}; display: block; }
	</style></head><body><div class="row">${imgs}</div></body></html>`;
	const page = await browser.newPage({ deviceScaleFactor: 2 });
	await page.setContent(html);
	await page.waitForTimeout(300);
	await page.locator('.row').screenshot({
		path: path.join(dest, `showcase-${scheme}.png`),
		omitBackground: true
	});
	await page.close();
	console.log('showcase', scheme);
}

(async () => {
	fs.mkdirSync(out, { recursive: true });
	const browser = await chromium.launch();
	for (const scheme of ['light', 'dark']) {
		if (!process.env.SKIP_SHOTS) await shoot(browser, scheme);
		if (dest) await showcase(browser, scheme);
	}
	await browser.close();
})().catch((e) => {
	console.error(e.message);
	process.exit(1);
});
