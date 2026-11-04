// 훈련 문제 생성 워커: 봇끼리 실제로 두다가 문제 조건에 맞는 장면에서 멈추고, 엔진으로 정답을 계산한다.
import init, { WasmGame, bestPartition } from "./pkg/hoola_wasm.js";

const ready = init();
const OPPONENTS = [
  "expert:stop=t3:meld=dump:outs=1", // 친구 E (실전 친구 모델)
  "expert:stop=t3:meld=dump:outs=1",
  "expert",
  "expert:stop=never",
  "expert:stop=never:meld=allin",
];
const STOP_TABLE = [null, null, 4, 8, 10, 10, 10, 10];

const rand32 = () => crypto.getRandomValues(new Uint32Array(1))[0];
const chance = (p) => Math.random() < p;

// 스톱 문제는 "스톱"과 "기다림" 정답이 번갈아 나오게 균형을 맞춘다
let nextStopAnswer = true;

function tableOf(obs) {
  const fewest = Math.min(7, ...obs.hand_counts.filter((_, s) => s !== 0));
  const limit = STOP_TABLE[fewest];
  return { fewest, limit, stop: limit !== null && obs.hand_points <= limit };
}

/** 장면이 문제 조건에 맞으면 문제를 만들어 돌려준다. */
function tryMake(type, g, obs, legal) {
  switch (type) {
    case "meld": {
      if (obs.phase !== "meld" || !legal.some((a) => a.startsWith("register "))) return null;
      const bp = JSON.parse(bestPartition(obs.hand.join(" ")));
      if (!bp.melds.length) return null;
      // 조합 1개짜리 쉬운 문제는 덜, 2개 이상·7·순환 런 문제는 더 자주
      const rich = bp.melds.length >= 2 || bp.melds.some((m) => m.length === 1);
      if (!chance(rich ? 0.9 : 0.35)) return null;
      return { type, obs, answer: bp };
    }
    case "thankyou": {
      if (obs.phase !== "turn_start" || !obs.thank_you_target) return null;
      const options = legal.filter((a) => a.startsWith("thankyou "));
      if (options.length) {
        if (!chance(0.85)) return null;
      } else {
        // 정답이 "땡큐 불가"인 문제: 같은 숫자나 같은 무늬 근처 카드가 있어 헷갈리는 장면만
        const t = obs.thank_you_target;
        const tempting = obs.hand.some((c) => c.slice(0, -1) === t.slice(0, -1) || c.slice(-1) === t.slice(-1));
        if (!tempting || !chance(0.3)) return null;
      }
      return { type, obs, options };
    }
    case "stop": {
      if (obs.phase !== "turn_start" || !legal.includes("stop")) return null;
      const table = tableOf(obs);
      if (table.stop !== nextStopAnswer && !chance(0.08)) return null;
      nextStopAnswer = !nextStopAnswer;
      const seed = rand32();
      return {
        type,
        obs,
        table,
        truth: g.stopTruth(0),
        estimate: g.stopEstimate(0, 400, seed),
        points: Array.from(g.handPoints()),
      };
    }
    case "discard": {
      if (obs.phase !== "meld" || obs.hand.length < 4) return null;
      if (!legal.every((a) => a.startsWith("discard "))) return null;
      if (!chance(0.5)) return null;
      const scored = JSON.parse(g.evaluate(128, rand32()));
      // 뚜렷하게 나쁜 버림이 있는 장면만 (아무거나 버려도 되는 문제는 뺀다)
      const meaningful = scored.some((v) => v.gap > 2 * v.gap_se && v.gap >= 0.03);
      if (!meaningful) return null;
      return { type, obs, scored };
    }
    default:
      return null;
  }
}

function generate(type) {
  for (let attempt = 0; attempt < 200; attempt++) {
    const seed = rand32();
    const players = chance(0.75) ? 2 : 3;
    const opp = OPPONENTS[rand32() % OPPONENTS.length];
    const g = new WasmGame(players, seed, seed % players, "");
    try {
      let steps = 0;
      while (!g.isOver && steps++ < 500) {
        const seat = g.currentPlayer;
        if (seat === 0) {
          const legal = JSON.parse(g.legalActions());
          const obs = JSON.parse(g.observation(0));
          const p = tryMake(type, g, obs, legal);
          if (p) return { ...p, players, opponent: opp };
        }
        g.apply(g.botAction(seat === 0 ? "expert" : opp, seat));
      }
    } finally {
      g.free();
    }
  }
  throw new Error(`could not generate ${type}`);
}

self.onmessage = async (e) => {
  await ready;
  const { id, type } = e.data;
  try {
    self.postMessage({ id, puzzle: generate(type) });
  } catch (err) {
    self.postMessage({ id, error: String(err) });
  }
};
