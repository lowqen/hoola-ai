// 영어 사전 검사: 코드의 t('…') 문구가 en.json에 모두 있고, 쓰지 않는 항목이 없으며, {이름} 자리가 같은지 본다.
// 코드의 한국어 '…' 문자열은 모두 사전 키로 보고, 문자열 밖에 남은 한국어(감싸지 않은 문구)도 찾는다.
// 내부 페이지·주석·로그·예외 메시지는 뺀다.
// npm run lint에서 돈다. 결과 요약과 문제만 출력한다.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SRC = join(ROOT, 'src');
/** 번역하지 않는 내부 페이지·모듈. */
const SKIP = [
	'routes/gallery',
	'routes/theme',
	'routes/motion',
	'routes/about',
	'lib/theme/scheme.ts',
	'lib/i18n',
	'service-worker'
];
const HANGUL = /[가-힣]/;
/** 사전 키가 아닌 한국어 문자열: 언어 이름, 조사. */
const ALLOWED = new Set(['한국어', '이', '가']);

function walk(dir: string, out: string[] = []): string[] {
	for (const name of readdirSync(dir)) {
		const p = join(dir, name);
		if (statSync(p).isDirectory()) walk(p, out);
		else if (/\.(ts|svelte)$/.test(name) && !/\.e2e\.ts$/.test(name)) out.push(p);
	}
	return out;
}

const dict = JSON.parse(readFileSync(join(SRC, 'lib/i18n/en.json'), 'utf8')) as Record<
	string,
	string
>;
const used = new Set<string>();
const problems: string[] = [];
const slots = (s: string) =>
	[...s.matchAll(/\{(\w+)\}/g)]
		.map((m) => m[1])
		.sort()
		.join(',');

for (const file of walk(SRC)) {
	const rel = relative(SRC, file).replaceAll('\\', '/');
	if (SKIP.some((s) => rel.startsWith(s))) continue;
	const text = readFileSync(file, 'utf8')
		.replace(/\/\*[\s\S]*?\*\//g, '')
		.replace(/<!--[\s\S]*?-->/g, '')
		.split('\n')
		.map((l) => (/console\.|new Error\(|throw /.test(l) ? '' : l.replace(/(^|\s)\/\/\s.*$/, '')))
		.join('\n');
	// 한국어가 든 '…' 문자열은 모두 사전 키다 (t( 안이든, t(조건 ? 'a' : 'b') 꼴이든)
	for (const m of text.matchAll(/'((?:[^'\\\n]|\\.)*)'/g)) {
		const key = m[1].replace(/\\'/g, "'");
		if (!HANGUL.test(key) || ALLOWED.has(key)) continue;
		used.add(key);
		if (!(key in dict)) problems.push(`사전에 없음: ${rel}: ${key}`);
		else if (slots(key) !== slots(dict[key])) problems.push(`자리 불일치: ${key} → ${dict[key]}`);
	}
	// 문자열을 지우고도 한국어가 남으면 t()로 감싸지 않은 문구다 (템플릿 리터럴, 마크업)
	const rest = text.replace(/'(?:[^'\\\n]|\\.)*'/g, "''");
	rest.split('\n').forEach((line) => {
		if (HANGUL.test(line)) problems.push(`감싸지 않은 한국어: ${rel}: ${line.trim().slice(0, 80)}`);
	});
}
for (const key of Object.keys(dict)) if (!used.has(key)) problems.push(`쓰지 않는 항목: ${key}`);

for (const p of problems) console.log(p);
console.log(
	`i18n: 문구 ${used.size}개, 사전 ${Object.keys(dict).length}개, 문제 ${problems.length}개`
);
if (problems.length) process.exit(1);
