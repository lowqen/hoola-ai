// 앱 아이콘 생성기: 파비콘(SVG)과 PWA·iOS 아이콘(PNG)을 한 도안에서 만든다. 결과물은 커밋한다.
//   npm run app-icons
// PNG는 Playwright의 Chromium으로 그린다 (이미지 라이브러리 의존성 없이).
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const path = (relative: string) => fileURLToPath(new URL(relative, import.meta.url));

// 색은 src/lib/theme/spec.ts의 시드·카드 고정 색과 같다
const FELT = '#1f6f50';
const FACE = '#fffdf7';
const BACK = '#29457f';
const RED = '#b8291f';
const CARD = 'x="-92" y="-130" width="184" height="260" rx="22"';
const HEART = 'M0 38C-52 2-50-38-22-38-8-38 0-26 0-18 0-26 8-38 22-38 50-38 52 2 0 38Z';

/** 512 칸 안의 도안. 카드 두 장이 펠트 위에 부채꼴로 놓인다. */
const icon = (corner: number, scale: number) =>
	`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="${corner}" fill="${FELT}"/><g transform="translate(256 256) scale(${scale})"><g transform="rotate(-14) translate(-60 -8)"><rect ${CARD} fill="${BACK}" stroke="${FACE}" stroke-width="10"/></g><g transform="rotate(10) translate(42 6)"><rect ${CARD} fill="${FACE}"/><path d="${HEART}" transform="scale(1.9)" fill="${RED}"/></g></g></svg>`;

// 일반 아이콘은 모서리가 둥글다. maskable과 iOS는 OS가 모양을 잘라 내므로 꽉 채우고,
// 도안은 maskable 안전 영역(가운데 지름 80%, 반지름 204.8) 안에 둔다.
const ROUNDED = icon(112, 0.95);
const FULL = icon(0, 0.8);

const OUTPUTS = [
	{ file: 'icon-192.png', size: 192, svg: ROUNDED },
	{ file: 'icon-512.png', size: 512, svg: ROUNDED },
	{ file: 'icon-maskable-192.png', size: 192, svg: FULL },
	{ file: 'icon-maskable-512.png', size: 512, svg: FULL },
	{ file: 'apple-touch-icon.png', size: 180, svg: FULL }
];

writeFileSync(path('../src/lib/assets/favicon.svg'), `${ROUNDED}\n`);
mkdirSync(path('../static/icons/'), { recursive: true });

const browser = await chromium.launch();
for (const { file, size, svg } of OUTPUTS) {
	const page = await browser.newPage({ viewport: { width: size, height: size } });
	await page.setContent(`<!doctype html><body style="margin:0;background:transparent">${svg}`);
	await page.screenshot({ path: path(`../static/icons/${file}`), omitBackground: true });
	await page.close();
}
await browser.close();
console.log(`아이콘 ${OUTPUTS.length}개와 파비콘을 만들었다`);
