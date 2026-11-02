//! 훌라 엔진 WebAssembly 바인딩. 연습 환경 웹앱(`web/`)이 쓴다.
//!
//! JS와는 JSON 문자열로 주고받는다. 카드는 `"7D"`, 행동은 리플레이 텍스트(`"discard KD"`).
//! 사람 좌석의 화면은 반드시 `observation(seat)`만으로 그린다 (숨은 정보 차단).

use hoola_core::arena::{NamedBot, end_reason_name};
use hoola_core::{
    Action, Bot, CardSet, EndReason, Event, Game, MeldKind, Observation, Phase, Replay, SearchBot,
    SearchConfig, preset,
};
use serde_json::{Value, json};
use wasm_bindgen::prelude::*;

fn cards(set: CardSet) -> Vec<String> {
    set.iter().map(|c| c.to_string()).collect()
}

fn phase_name(phase: Phase) -> &'static str {
    match phase {
        Phase::TurnStart => "turn_start",
        Phase::MeldPhase => "meld",
        Phase::Over => "over",
    }
}

fn meld_kind_name(kind: MeldKind) -> &'static str {
    match kind {
        MeldKind::Set => "set",
        MeldKind::Run => "run",
        MeldKind::SingleSeven => "seven",
    }
}

fn observation_json(o: &Observation<'_>) -> Value {
    let melds: Vec<Value> = o
        .melds
        .iter()
        .enumerate()
        .map(|(i, m)| {
            json!({
                "index": i,
                "owner": m.owner,
                "kind": meld_kind_name(m.kind),
                "cards": cards(m.cards),
            })
        })
        .collect();
    let events: Vec<Value> = o
        .events
        .iter()
        .map(|e| match e {
            Event::Action { seat, action } => json!({"seat": seat, "action": action.to_string()}),
            Event::Reshuffle { stock } => json!({"reshuffle": stock}),
        })
        .collect();
    let pile = |cs: &[hoola_core::Card]| cs.iter().map(|c| c.to_string()).collect::<Vec<_>>();
    json!({
        "seat": o.seat,
        "num_players": o.num_players,
        "current_player": o.current_player,
        "phase": phase_name(o.phase),
        "turn": o.turn,
        "hand": cards(o.hand),
        "hand_points": o.hand_points(),
        "hand_counts": o.hand_counts,
        "registered": o.registered,
        "melds": melds,
        "discard_top": o.discard_top.map(|c| c.to_string()),
        "discard_count": o.known_discards.len(),
        "visible_discards": pile(o.visible_discards),
        "stock_len": o.stock_len,
        "thank_you_target": o.thank_you_target.map(|c| c.to_string()),
        "top_discarder": o.top_discarder,
        "stop_limit": o.rules.stop.limit,
        "events": events,
        "revealed_hands": o.revealed_hands.as_ref().map(|hs| hs.iter().map(|&h| cards(h)).collect::<Vec<_>>()),
    })
}

fn outcome_json(game: &Game) -> Value {
    let Some(o) = game.outcome() else {
        return Value::Null;
    };
    let (player, caller) = match o.reason {
        EndReason::Out { player } => (Some(player), None),
        EndReason::Stop { caller, .. } => (None, Some(caller)),
        EndReason::NoCards | EndReason::TurnLimit => (None, None),
    };
    let points: Vec<u32> = (0..game.num_players())
        .map(|s| game.hand_points(s))
        .collect();
    json!({
        "reason": end_reason_name(o.reason),
        "player": player,
        "caller": caller,
        "winners": o.winners,
        "rewards": o.rewards,
        "points": points,
    })
}

/// 판 하나 (게임 상태 + 재현 정보).
#[wasm_bindgen]
#[derive(Clone)]
pub struct WasmGame {
    inner: Game,
    replay: Replay,
}

/// JS 오류로 바꾸기 전의 내부 구현 (네이티브 테스트용).
impl WasmGame {
    pub fn create(
        players: usize,
        seed: u32,
        first_player: usize,
        rules_toml: &str,
    ) -> Result<WasmGame, String> {
        let rules = preset::parse(rules_toml).map_err(|e| e.to_string())?.rules;
        let inner = Game::new(rules, players, u64::from(seed), first_player)?;
        Ok(WasmGame {
            inner,
            replay: Replay::new(rules_toml, players, u64::from(seed), first_player),
        })
    }

    pub fn try_apply(&mut self, action: &str) -> Result<(), String> {
        let a: Action = action.parse().map_err(|e| format!("{e}"))?;
        self.inner.apply(a).map_err(|e| e.to_string())?;
        self.replay.push(a);
        Ok(())
    }

    pub fn try_bot_action(&self, spec: &str, seed: u32) -> Result<String, String> {
        if self.inner.is_over() {
            return Err("game is over".into());
        }
        // 같은 상황이면 같은 수가 나오도록 판 시드·진행 수·호출 시드로 봇 시드를 정한다
        let bot_seed = self.replay.seed.wrapping_mul(0x9E37_79B9)
            ^ (self.replay.actions.len() as u64) << 20
            ^ u64::from(seed);
        let mut bot =
            NamedBot::new(spec, bot_seed).ok_or_else(|| format!("unknown bot {spec:?}"))?;
        let seat = self.inner.current_player();
        let legal = self.inner.legal_actions();
        Ok(bot.act(&self.inner.observation(seat), &legal).to_string())
    }

    pub fn try_evaluate(&self, k: usize, seed: u32) -> Result<Value, String> {
        if self.inner.is_over() {
            return Err("game is over".into());
        }
        let cfg = SearchConfig {
            k: k.max(1),
            ..SearchConfig::default()
        };
        let mut bot = SearchBot::new(cfg, u64::from(seed));
        let seat = self.inner.current_player();
        let legal = self.inner.legal_actions();
        let mut scored = bot.evaluate(&self.inner.observation(seat), &legal);
        scored.sort_by(|a, b| b.value.total_cmp(&a.value));
        Ok(Value::Array(
            scored
                .iter()
                .map(|v| json!({"action": v.action.to_string(), "value": v.value, "stderr": v.stderr, "gap": v.gap, "gap_se": v.gap_se}))
                .collect(),
        ))
    }

    pub fn from_replay_json(json: &str) -> Result<WasmGame, String> {
        let replay = Replay::from_json(json).map_err(|e| e.to_string())?;
        let inner = replay.replay().map_err(|e| e.to_string())?;
        Ok(WasmGame { inner, replay })
    }

    /// 처음 `n`개 행동까지만 적용한 판 (되돌리기용).
    pub fn rewound(&self, n: usize) -> Result<WasmGame, String> {
        let mut replay = self.replay.clone();
        replay.actions.truncate(n);
        let inner = replay.replay().map_err(|e| e.to_string())?;
        Ok(WasmGame { inner, replay })
    }
}

#[wasm_bindgen]
impl WasmGame {
    /// 새 판. `rules_toml`은 기본 프리셋(offline_casual) 위에 덮어쓸 TOML.
    #[wasm_bindgen(constructor)]
    pub fn new(
        players: usize,
        seed: u32,
        first_player: usize,
        rules_toml: &str,
    ) -> Result<WasmGame, JsError> {
        WasmGame::create(players, seed, first_player, rules_toml).map_err(|e| JsError::new(&e))
    }

    /// 리플레이 JSON에서 판을 되살린다.
    #[wasm_bindgen(js_name = fromReplay)]
    pub fn from_replay(json: &str) -> Result<WasmGame, JsError> {
        WasmGame::from_replay_json(json).map_err(|e| JsError::new(&e))
    }

    #[wasm_bindgen(getter, js_name = numPlayers)]
    pub fn num_players(&self) -> usize {
        self.inner.num_players()
    }

    #[wasm_bindgen(getter, js_name = currentPlayer)]
    pub fn current_player(&self) -> usize {
        self.inner.current_player()
    }

    #[wasm_bindgen(getter)]
    pub fn phase(&self) -> String {
        phase_name(self.inner.phase()).to_string()
    }

    #[wasm_bindgen(getter, js_name = isOver)]
    pub fn is_over(&self) -> bool {
        self.inner.is_over()
    }

    #[wasm_bindgen(getter)]
    pub fn seed(&self) -> u32 {
        self.replay.seed as u32
    }

    /// 지금까지 적용한 행동 수.
    #[wasm_bindgen(getter, js_name = actionCount)]
    pub fn action_count(&self) -> usize {
        self.replay.actions.len()
    }

    /// 지금 차례의 합법 수 (JSON 문자열 배열).
    #[wasm_bindgen(js_name = legalActions)]
    pub fn legal_actions(&self) -> String {
        let v: Vec<String> = self
            .inner
            .legal_actions()
            .iter()
            .map(|a| a.to_string())
            .collect();
        serde_json::to_string(&v).expect("json")
    }

    pub fn apply(&mut self, action: &str) -> Result<(), JsError> {
        self.try_apply(action).map_err(|e| JsError::new(&e))
    }

    /// 좌석의 관측 (JSON).
    pub fn observation(&self, seat: usize) -> Result<String, JsError> {
        if seat >= self.inner.num_players() {
            return Err(JsError::new("seat out of range"));
        }
        Ok(observation_json(&self.inner.observation(seat)).to_string())
    }

    /// 판 결과 (JSON, 진행 중이면 `null`).
    pub fn outcome(&self) -> String {
        outcome_json(&self.inner).to_string()
    }

    /// 내장 봇의 다음 수. `spec`은 `expert`, `greedy`, `random`, `expert:stop=never` 등.
    #[wasm_bindgen(js_name = botAction)]
    pub fn bot_action(&self, spec: &str, seed: u32) -> Result<String, JsError> {
        self.try_bot_action(spec, seed)
            .map_err(|e| JsError::new(&e))
    }

    /// L3 분석: 지금 차례 합법 수 전체의 추정 승률 (높은 순, JSON).
    pub fn evaluate(&self, k: usize, seed: u32) -> Result<String, JsError> {
        self.try_evaluate(k, seed)
            .map(|v| v.to_string())
            .map_err(|e| JsError::new(&e))
    }

    /// 처음 `n`개 행동까지만 적용한 새 판 (되돌리기).
    pub fn rewind(&self, n: usize) -> Result<WasmGame, JsError> {
        self.rewound(n).map_err(|e| JsError::new(&e))
    }

    /// 마지막으로 적용한 행동 (정규화된 텍스트, 없으면 `undefined`).
    #[wasm_bindgen(js_name = lastAction)]
    pub fn last_action(&self) -> Option<String> {
        self.replay.actions.last().cloned()
    }

    /// 리플레이 JSON.
    #[wasm_bindgen(js_name = replayJson)]
    pub fn replay_json(&self) -> String {
        self.replay.to_json()
    }

    #[wasm_bindgen(js_name = clone)]
    pub fn clone_game(&self) -> WasmGame {
        self.clone()
    }
}

/// 엔진 버전.
#[wasm_bindgen]
pub fn version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn play_a_game_with_bots_and_replay() {
        let mut g = WasmGame::create(3, 42, 0, "").unwrap();
        while !g.inner.is_over() {
            let spec = if g.inner.current_player() == 0 {
                "expert"
            } else {
                "expert:stop=never"
            };
            let a = g.try_bot_action(spec, 1).unwrap();
            g.try_apply(&a).unwrap();
        }
        let out: Value = serde_json::from_str(&outcome_json(&g.inner).to_string()).unwrap();
        assert!(out["winners"].is_array());
        let back = WasmGame::from_replay_json(&g.replay.to_json()).unwrap();
        assert_eq!(back.inner.outcome(), g.inner.outcome());
        let half = g.rewound(g.replay.actions.len() / 2).unwrap();
        assert_eq!(half.replay.actions.len(), g.replay.actions.len() / 2);
    }

    #[test]
    fn bot_actions_are_reproducible() {
        let g = WasmGame::create(2, 7, 0, "").unwrap();
        assert_eq!(
            g.try_bot_action("random", 3).unwrap(),
            g.try_bot_action("random", 3).unwrap()
        );
    }

    #[test]
    fn observation_json_hides_other_hands() {
        let g = WasmGame::create(2, 5, 0, "").unwrap();
        let o = observation_json(&g.inner.observation(0));
        assert_eq!(o["hand"].as_array().unwrap().len(), 7);
        assert!(o["revealed_hands"].is_null());
        assert_eq!(o["visible_discards"].as_array().unwrap().len(), 1);
    }

    #[test]
    fn evaluate_lists_all_legal_actions() {
        let g = WasmGame::create(2, 5, 0, "").unwrap();
        let v = g.try_evaluate(2, 1).unwrap();
        assert_eq!(v.as_array().unwrap().len(), g.inner.legal_actions().len());
    }

    #[test]
    fn bad_input_is_rejected() {
        assert!(WasmGame::create(9, 0, 0, "").is_err());
        assert!(WasmGame::create(2, 0, 0, "[stop]\nlimt = 1").is_err());
        let mut g = WasmGame::create(2, 0, 0, "").unwrap();
        assert!(g.try_apply("fly").is_err());
        assert!(g.try_bot_action("nobody", 0).is_err());
    }
}
