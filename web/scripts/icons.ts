// 아이콘 스프라이트 생성기: src/lib/ui/icons.ts의 목록 → src/lib/ui/icons.svg
//   node scripts/icons.ts          생성
//   node scripts/icons.ts --check  생성 결과가 커밋된 파일과 같은지 검사 (CI)
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ICON_NAMES } from '../src/lib/ui/icons.ts';

const OUT = fileURLToPath(new URL('../src/lib/ui/icons.svg', import.meta.url));
const source = (name: string) =>
	new URL(`../node_modules/@material-symbols/svg-500/rounded/${name}.svg`, import.meta.url);

const symbols = ICON_NAMES.map((name) => {
	const svg = readFileSync(source(name), 'utf8');
	const viewBox = /viewBox="([^"]+)"/.exec(svg)?.[1];
	const inner = /<svg[^>]*>([\s\S]*)<\/svg>/.exec(svg)?.[1].trim();
	if (!viewBox || !inner) throw new Error(`아이콘을 읽지 못했다: ${name}`);
	return `<symbol id="${name}" viewBox="${viewBox}">${inner}</symbol>`;
});
const sprite = `<svg xmlns="http://www.w3.org/2000/svg">\n${symbols.join('\n')}\n</svg>\n`;

if (process.argv.includes('--check')) {
	if (!existsSync(OUT) || readFileSync(OUT, 'utf8') !== sprite) {
		console.error('icons.svg가 목록과 다르다. npm run icons로 다시 만든다.');
		process.exit(1);
	}
	console.log('icons.svg 최신 상태');
} else {
	writeFileSync(OUT, sprite);
	console.log(`icons.svg ${ICON_NAMES.length}개, ${(sprite.length / 1024).toFixed(1)}KB`);
}
