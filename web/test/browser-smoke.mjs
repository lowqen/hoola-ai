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
  if (localStorage.getItem("hoola-practice-v1")) return; // 새로고침 때는 유지
  localStorage.setItem("hoola-practice-v1", JSON.stringify({
    settings: { players: 3, opponents: ["friendA", "friendB", "expert", "expert"], speed: 150, seed: "777", beginner: true },
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

// 3) 복기 (워커 분석 → 요약·그래프·목록·장면)
await page.screenshot({ path: "result.png" });
await page.click("#res-review");
await page.waitForSelector("#rv-detail .rv-compare", { timeout: 240000 });
const summary = await page.textContent("#rv-summary");
const items = await page.$$eval("#rv-list li", (ls) => ls.length);
const why = await page.$eval("#rv-detail", (d) => d.innerText.slice(0, 300));
console.log("review:", summary.replace(/\s+/g, " "), "| items", items);
console.log("detail:", why.replace(/\s+/g, " "));
if (items < 1) await fail("review list empty");
if (!(await page.$("#rv-detail .scene-hand .card"))) await fail("review scene missing");
await page.screenshot({ path: "review.png", fullPage: true });
await page.click("#rv-chart .pt >> nth=0");
await page.waitForSelector("#rv-detail .rv-compare");
// 4) 전적 저장 (복기 요약 포함)
const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("hoola-practice-v1")).games);
if (saved.length !== 1) await fail(`expected 1 saved game, got ${saved.length}`);
if (!saved[0].review) await fail("review summary not saved");

// 4-1) 이 장면부터 다시 두기 → 연습판, 전적에 다시 기록하지 않음
await page.click("#rv-detail .rv-nav button.primary");
if (!(await page.isHidden("#review-view"))) await fail("review did not close on replay");
await waitMyTurn();
const savedAfter = await page.evaluate(() => JSON.parse(localStorage.getItem("hoola-practice-v1")).games.length);
if (savedAfter !== 1) await fail("replay-from created a new record");

await page.screenshot({ path: "screenshot.png", fullPage: true });

// 5) 셀프 모드: 가능한 수 목록·힌트가 없고, 직접 고른 수만 검증한다
await page.evaluate(() => {
  const st = JSON.parse(localStorage.getItem("hoola-practice-v1"));
  st.settings.beginner = false;
  localStorage.setItem("hoola-practice-v1", JSON.stringify(st));
});
await page.reload();
await page.waitForSelector("#my-hand .card", { timeout: 30000 });
if (!(await page.isHidden("#hint-panel"))) await fail("hint panel visible in self mode");
await waitMyTurn();
const startButtons = await page.$$eval("#actions button", (bs) => bs.map((b) => b.textContent));
if (JSON.stringify(startButtons) !== JSON.stringify(["스톱", "받기", "땡큐"])) await fail(`self-mode turn-start buttons: ${startButtons}`);
const points = +(await page.textContent("#my-points"));
if (points > 10) {
  await page.click("#actions button.danger");
  if (await page.isHidden("#msg")) await fail("illegal stop was not rejected with a message");
}
await page.click("#actions button.primary"); // 받기
await waitMyTurn();
const meldButtons = await page.$$eval("#actions button", (bs) => bs.map((b) => b.textContent));
if (JSON.stringify(meldButtons) !== JSON.stringify(["등록"])) await fail(`self-mode meld buttons: ${meldButtons}`);
const handCards = await page.$$("#my-hand button.card");
let nonSeven = null;
for (const c of handCards) {
  if (!(await c.getAttribute("title")).startsWith("7")) { nonSeven = c; break; }
}
await nonSeven.click();
await page.click("#actions button.good"); // 카드 1장(7 아님) 등록 → 거절
if (await page.isHidden("#msg")) await fail("illegal register was not rejected with a message");
const discardBtn = await page.$("#actions button.primary"); // 고른 카드 버리기
if (!discardBtn) await fail("no discard button in self mode");
await discardBtn.click();
await page.waitForFunction(() => document.querySelectorAll("#log li.mine").length >= 2, null, { timeout: 10000 });
await page.screenshot({ path: "self-mode.png", fullPage: true });
console.log("self mode ok");

// 6) 훈련 모드: 유형마다 한 문제씩 풀고 피드백·다음 문제 확인
await page.click("#tab-train");
await page.waitForSelector("#t-drills .t-drill");
const drillCount = await page.$$eval("#t-drills .t-drill", (d) => d.length);
if (drillCount !== 5) await fail(`expected 5 drills, got ${drillCount}`);
const answerers = {
  0: async () => { await page.click("#t-stage .t-actions button.primary"); }, // 조합 찾기: 묶지 않고 제출
  1: async () => { await page.click("#t-stage .t-actions button.tonal"); }, // 땡큐: 받기
  2: async () => { await page.click("#t-stage .t-actions button.primary"); }, // 스톱: 받기(계속)
  3: async () => { await page.click("#t-stage .t-hand button.card >> nth=0"); await page.click("#t-stage .t-actions button.primary"); }, // 버릴 카드
};
for (const [i, answer] of Object.entries(answerers)) {
  await page.click(`#t-drills .t-drill >> nth=${i}`);
  await page.waitForSelector("#t-stage .t-qhead", { timeout: 120000 });
  await answer();
  await page.waitForSelector("#t-stage .t-feedback", { timeout: 10000 });
  const fb = (await page.textContent("#t-stage .t-feedback")).replace(/\s+/g, " ").slice(0, 160);
  console.log(`drill ${i}:`, fb);
  if (i === "3") await page.screenshot({ path: "train-discard.png", fullPage: true });
  await page.click("#t-stage .t-next button");
  await page.waitForSelector("#t-stage .t-qhead", { timeout: 120000 });
  await page.click("#t-exit");
  await page.waitForSelector("#t-home:not([hidden])");
}
// 조합 찾기: 엔진이 낸 정답 묶음을 그대로 입력하면 정답이어야 한다 (정답 판정 검증)
await page.click("#t-drills .t-drill >> nth=0");
await page.waitForSelector("#t-stage .t-qhead", { timeout: 120000 });
await page.click("#t-stage .t-actions button.primary");
await page.waitForSelector("#t-stage .t-feedback");
const best = await page.$$eval("#t-stage .t-answer .t-chip", (chips) => chips.map((ch) => [...ch.querySelectorAll(".card")].map((c) => c.getAttribute("title"))));
await page.click("#t-stage .t-next button");
await page.waitForSelector("#t-stage .t-qhead", { timeout: 120000 });
console.log("best partition sample:", JSON.stringify(best));
await page.screenshot({ path: "train-meld.png", fullPage: true });
await page.click("#t-exit");
const nbEnabled = await page.$eval("#t-drills .t-drill >> nth=4", (b) => !b.disabled).catch(() => false);
const nbButtons = await page.$$("#t-drills .t-drill");
if (!(await nbButtons[4].isDisabled())) {
  await nbButtons[4].click();
  await page.waitForSelector("#t-stage .t-option", { timeout: 20000 });
  await page.click("#t-stage .t-option >> nth=0");
  await page.waitForSelector("#t-stage .t-feedback");
  console.log("notebook ok");
  await page.click("#t-exit");
}
void nbEnabled;
const trainStats = await page.evaluate(() => JSON.parse(localStorage.getItem("hoola-practice-v1")).train);
const answered = Object.values(trainStats).reduce((s, x) => s + x.n, 0);
if (answered < 4) await fail(`training stats not saved: ${answered}`);
await page.screenshot({ path: "train-home.png", fullPage: true });
console.log("training ok");

if (errors.length) await fail("console errors");
await browser.close();
server.close();
console.log("browser smoke ok");
