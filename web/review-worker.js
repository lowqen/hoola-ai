// 복기 분석 워커: 화면을 멈추지 않고 결정마다 L3 평가를 돌린다.
import init, { WasmGame } from "./pkg/hoola_wasm.js";

const ready = init();

self.onmessage = async (e) => {
  await ready;
  const { replay, decisions, k, seat, jobId } = e.data;
  const game = WasmGame.fromReplay(replay);
  try {
    for (let i = 0; i < decisions.length; i++) {
      const d = decisions[i];
      const g = game.rewind(d.index);
      try {
        const legal = JSON.parse(g.legalActions());
        const obs = JSON.parse(g.observation(seat));
        if (legal.length < 2) {
          self.postMessage({ jobId, type: "item", i, obs, forced: true });
        } else {
          const scored = JSON.parse(g.evaluate(k, d.index * 7 + 11));
          self.postMessage({ jobId, type: "item", i, obs, scored });
        }
      } finally {
        g.free();
      }
    }
    self.postMessage({ jobId, type: "done" });
  } catch (err) {
    self.postMessage({ jobId, type: "error", message: String(err) });
  } finally {
    game.free();
  }
};
