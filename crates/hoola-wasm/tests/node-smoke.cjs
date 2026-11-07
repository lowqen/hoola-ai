// WASM(nodejs 타깃) 바인딩 스모크 테스트: node crates/hoola-wasm/tests/node-smoke.cjs <pkg-node 경로>
const path = require("path");
const assert = require("assert");
const { WasmGame, version } = require(path.resolve(process.argv[2], "hoola_wasm.js"));

console.log("engine", version());
let share = 0;
const n = 60;
for (let seed = 0; seed < n; seed++) {
  const g = new WasmGame(3, seed, seed % 3, "");
  while (!g.isOver) {
    const legal = JSON.parse(g.legalActions());
    const spec = g.currentPlayer === 0 ? "expert" : "expert:stop=never";
    const a = g.botAction(spec, 0);
    assert(legal.includes(a), `bot chose illegal ${a}`);
    g.apply(a);
    const obs = JSON.parse(g.observation(0));
    assert.strictEqual(obs.hand.length, obs.hand_counts[0]);
    if (!g.isOver) assert.strictEqual(obs.revealed_hands, null);
  }
  const out = JSON.parse(g.outcome());
  assert(Math.abs(out.rewards.reduce((a, b) => a + b, 0) - 1) < 1e-9);
  share += out.rewards[0];
  const back = WasmGame.fromReplay(g.replayJson());
  assert.strictEqual(back.outcome(), g.outcome());
  const half = g.rewind(Math.floor(g.actionCount / 2));
  assert.strictEqual(half.actionCount, Math.floor(g.actionCount / 2));
  back.free();
  half.free();
  g.free();
}
console.log(`expert vs 친구 A x2: ${((share / n) * 100).toFixed(1)}% (${n}판)`);

const g = new WasmGame(2, 1, 0, '[visibility]\ndiscard_history = "full"\n');
const scored = JSON.parse(g.evaluate(8, 1));
assert.strictEqual(scored.length, JSON.parse(g.legalActions()).length);
assert.throws(() => g.apply("fly"));
assert.throws(() => new WasmGame(9, 0, 0, ""));
console.log("node smoke ok");
