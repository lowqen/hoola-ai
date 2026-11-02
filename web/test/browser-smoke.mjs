// 헤드리스 Chromium으로 연습장을 열어 사람처럼 한 판을 끝까지 둔다.
// 실행: (web/test에서) node browser-smoke.mjs   — ../pkg 에 wasm-pack(web) 결과가 있어야 한다
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".wasm": "application/wasm" };
const server = http.createServer((req, res) => {
  const p = path.join(root, decodeURIComponent(new URL(req.url, "http://x").pathname));
  const file = p.endsWith(path.sep) ? path.join(p, "index.html") : p;
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "content-type": types[path.extname(file)] || "application/octet-stream" });
    res.end(data);
  });
});
await new Promise((r) => server.listen(0, r));
const url = `http://127.0.0.1:${server.address().port}/`;

const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
await page.addInitScript(() => {
  localStorage.setItem("hoola-practice-v1", JSON.stringify({
    settings: { players: 3, opponents: ["friendA", "friendB", "expert", "expert"], speed: 150, seed: "777" },
    games: [],
  }));
});
await page.goto(url);
await page.waitForSelector("#my-hand .card", { timeout: 30000 });

const fail = async (msg) => {
  console.error("FAIL:", msg, errors);
  await page.screenshot({ path: "failure.png", fullPage: true });
  await browser.close();
  server.close();
  process.exit(1);
};

// 내 차례가 올 때까지 기다리는 도우미
const waitMyTurn = async () => {
  await page.waitForFunction(() => document.querySelector("#status")?.classList.contains("my-turn") || document.querySelector("#result")?.open, null, { timeout: 30000 });
};

// 1) 힌트와 되돌리기
await waitMyTurn();
await page.click("#btn-hint");
await page.waitForSelector(".hint-list li", { timeout: 60000 });
const before = await page.textContent("#status");
await page.click("#actions button.primary"); // 받기
await waitMyTurn();
await page.click("#btn-undo");
await waitMyTurn();
const after = await page.textContent("#status");
if (before !== after) await fail(`undo did not restore turn start: ${before} / ${after}`);

// 2) 끝까지 두기
for (let i = 0; i < 600; i++) {
  if (await page.evaluate(() => document.querySelector("#result").open)) break;
  await waitMyTurn();
  if (await page.evaluate(() => document.querySelector("#result").open)) break;
  const primary = await page.$("#actions button.primary");
  const good = await page.$("#actions button.good");
  if (good && Math.random() < 0.7) await good.click();
  else if (primary) await primary.click();
  else {
    const card = await page.$("#my-hand button.card:not(:disabled)");
    if (!card) await fail("no action available on my turn");
    await card.click();
    const discard = await page.$("#actions button.primary");
    if (!discard) await fail("no discard button after selecting a card");
    await discard.click();
  }
  await page.waitForTimeout(30);
}
if (!(await page.evaluate(() => document.querySelector("#result").open))) await fail("game did not finish");
console.log("result:", await page.textContent("#result-title"), "-", await page.textContent("#result-reason"));

// 3) 복기
await page.click("#res-review");
await page.waitForFunction(() => {
  const t = document.querySelector("#review")?.textContent || "";
  return t.length > 0 && !t.startsWith("복기 중");
}, null, { timeout: 120000 });
console.log("review:", (await page.textContent("#review")).slice(0, 200));

// 4) 전적 저장
const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("hoola-practice-v1")).games.length);
if (saved !== 1) await fail(`expected 1 saved game, got ${saved}`);

await page.screenshot({ path: "screenshot.png", fullPage: true });
if (errors.length) await fail("console errors");
await browser.close();
server.close();
console.log("browser smoke ok");
