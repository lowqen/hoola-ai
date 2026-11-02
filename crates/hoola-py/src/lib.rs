//! hoola-core Python 바인딩 (`import hoola`).
//!
//! 카드는 `"7D"`, `"TS"` 같은 문자열, 행동은 리플레이 텍스트 형식(`"draw"`, `"discard KD"` 등)으로
//! 주고받는다.

use hoola_core::arena::{BOT_NAMES as CORE_BOT_NAMES, MatchConfig, NamedBot, run_match};
use hoola_core::{
    Action, Bot, CardSet, EndReason, Event, Game, MeldKind, Phase, Replay, Rules, preset,
};
use pyo3::exceptions::{PyIndexError, PyValueError};
use pyo3::prelude::*;
use pyo3::types::PyDict;

fn value_err(e: impl ToString) -> PyErr {
    PyValueError::new_err(e.to_string())
}

fn rules_from_toml(rules_toml: &str) -> PyResult<Rules> {
    preset::parse(rules_toml)
        .map(|p| p.rules)
        .map_err(value_err)
}

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

/// 훌라 한 판.
#[pyclass(name = "Game", module = "hoola")]
#[derive(Clone)]
struct PyGame {
    inner: Game,
}

impl PyGame {
    fn check_seat(&self, seat: usize) -> PyResult<()> {
        if seat < self.inner.num_players() {
            Ok(())
        } else {
            Err(PyIndexError::new_err(format!("seat {seat} out of range")))
        }
    }
}

#[pymethods]
impl PyGame {
    /// 새 판. `rules_toml`은 기본 프리셋(offline_casual) 위에 덮어쓸 하우스 룰 TOML.
    #[new]
    #[pyo3(signature = (players = 2, seed = 0, first_player = 0, rules_toml = ""))]
    fn new(players: usize, seed: u64, first_player: usize, rules_toml: &str) -> PyResult<Self> {
        let rules = rules_from_toml(rules_toml)?;
        let inner = Game::new(rules, players, seed, first_player).map_err(value_err)?;
        Ok(PyGame { inner })
    }

    #[getter]
    fn num_players(&self) -> usize {
        self.inner.num_players()
    }

    #[getter]
    fn current_player(&self) -> usize {
        self.inner.current_player()
    }

    #[getter]
    fn phase(&self) -> &'static str {
        phase_name(self.inner.phase())
    }

    #[getter]
    fn is_over(&self) -> bool {
        self.inner.is_over()
    }

    #[getter]
    fn turn(&self) -> u32 {
        self.inner.turn()
    }

    /// 지금 차례 플레이어의 합법 수 (텍스트).
    fn legal_actions(&self) -> Vec<String> {
        self.inner
            .legal_actions()
            .iter()
            .map(|a| a.to_string())
            .collect()
    }

    /// 행동을 적용한다. 불법이면 ValueError.
    fn apply(&mut self, action: &str) -> PyResult<()> {
        let action: Action = action.parse().map_err(value_err)?;
        self.inner.apply(action).map_err(value_err)
    }

    /// 내장 봇(`BOT_NAMES`)이 지금 차례에 고를 행동.
    #[pyo3(signature = (bot, seed = 0))]
    fn bot_action(&self, bot: &str, seed: u64) -> PyResult<String> {
        if self.inner.is_over() {
            return Err(value_err("game is over"));
        }
        let mut b =
            NamedBot::new(bot, seed).ok_or_else(|| value_err(format!("unknown bot {bot:?}")))?;
        let seat = self.inner.current_player();
        let legal = self.inner.legal_actions();
        Ok(b.act(&self.inner.observation(seat), &legal).to_string())
    }

    /// 손패 (완전정보, 분석·디버그용). AI 입력에는 `observation`을 쓴다.
    fn hand(&self, seat: usize) -> PyResult<Vec<String>> {
        self.check_seat(seat)?;
        Ok(cards(self.inner.hand(seat)))
    }

    fn hand_points(&self, seat: usize) -> PyResult<u32> {
        self.check_seat(seat)?;
        Ok(self.inner.hand_points(seat))
    }

    /// `seat`의 관측 (정보집합) dict.
    fn observation<'py>(&self, py: Python<'py>, seat: usize) -> PyResult<Bound<'py, PyDict>> {
        self.check_seat(seat)?;
        let o = self.inner.observation(seat);
        let d = PyDict::new(py);
        d.set_item("seat", o.seat)?;
        d.set_item("num_players", o.num_players)?;
        d.set_item("current_player", o.current_player)?;
        d.set_item("phase", phase_name(o.phase))?;
        d.set_item("turn", o.turn)?;
        d.set_item("hand", cards(o.hand))?;
        d.set_item("hand_points", o.hand_points())?;
        d.set_item("hand_counts", o.hand_counts.clone())?;
        d.set_item("registered", o.registered.clone())?;
        let melds = o
            .melds
            .iter()
            .map(|m| {
                let md = PyDict::new(py);
                md.set_item("owner", m.owner)?;
                md.set_item("kind", meld_kind_name(m.kind))?;
                md.set_item("cards", cards(m.cards))?;
                Ok(md)
            })
            .collect::<PyResult<Vec<_>>>()?;
        d.set_item("melds", melds)?;
        d.set_item("discard_top", o.discard_top.map(|c| c.to_string()))?;
        let pile = |cs: &[hoola_core::Card]| cs.iter().map(|c| c.to_string()).collect::<Vec<_>>();
        d.set_item("known_discards", pile(o.known_discards))?;
        d.set_item("visible_discards", pile(o.visible_discards))?;
        d.set_item("stock_len", o.stock_len)?;
        d.set_item(
            "thank_you_target",
            o.thank_you_target.map(|c| c.to_string()),
        )?;
        let events = o
            .events
            .iter()
            .map(|e| {
                let ed = PyDict::new(py);
                match e {
                    Event::Action { seat, action } => {
                        ed.set_item("seat", *seat)?;
                        ed.set_item("action", action.to_string())?;
                    }
                    Event::Reshuffle { stock } => {
                        ed.set_item("reshuffle", *stock)?;
                    }
                }
                Ok(ed)
            })
            .collect::<PyResult<Vec<_>>>()?;
        d.set_item("events", events)?;
        d.set_item(
            "revealed_hands",
            o.revealed_hands
                .as_ref()
                .map(|hs| hs.iter().map(|&h| cards(h)).collect::<Vec<_>>()),
        )?;
        Ok(d)
    }

    /// 판 결과 dict (진행 중이면 None).
    fn outcome<'py>(&self, py: Python<'py>) -> PyResult<Option<Bound<'py, PyDict>>> {
        let Some(o) = self.inner.outcome() else {
            return Ok(None);
        };
        let d = PyDict::new(py);
        d.set_item("reason", hoola_core::arena::end_reason_name(o.reason))?;
        match o.reason {
            EndReason::Out { player } => d.set_item("player", player)?,
            EndReason::Stop { caller, .. } => d.set_item("caller", caller)?,
            EndReason::NoCards | EndReason::TurnLimit => {}
        }
        d.set_item("winners", o.winners.clone())?;
        d.set_item("rewards", o.rewards.clone())?;
        Ok(Some(d))
    }

    /// 지금까지의 행동 (텍스트).
    fn actions(&self) -> Vec<String> {
        self.inner.actions().map(|a| a.to_string()).collect()
    }

    fn copy(&self) -> Self {
        self.clone()
    }

    fn __copy__(&self) -> Self {
        self.clone()
    }

    fn __repr__(&self) -> String {
        format!(
            "<hoola.Game players={} turn={} current={} phase={}>",
            self.inner.num_players(),
            self.inner.turn(),
            self.inner.current_player(),
            phase_name(self.inner.phase())
        )
    }
}

/// 리플레이 JSON을 재생한 판.
#[pyfunction]
fn replay(json: &str) -> PyResult<PyGame> {
    let r = Replay::from_json(json).map_err(value_err)?;
    let inner = r.replay().map_err(value_err)?;
    Ok(PyGame { inner })
}

/// 봇 대전. 결과 dict: games, deals, avg_turns, bots{name: {seats, mean, ci95}}, seat_rates, reasons.
#[pyfunction]
#[pyo3(signature = (bots, players = 2, deals = 1000, seed = 0, duplicate = true, rules_toml = ""))]
fn simulate<'py>(
    py: Python<'py>,
    bots: Vec<String>,
    players: usize,
    deals: u64,
    seed: u64,
    duplicate: bool,
    rules_toml: &str,
) -> PyResult<Bound<'py, PyDict>> {
    let cfg = MatchConfig {
        rules: rules_from_toml(rules_toml)?,
        players,
        deals,
        seed,
        bots,
        duplicate,
    };
    let report = py.allow_threads(|| run_match(&cfg)).map_err(value_err)?;
    let d = PyDict::new(py);
    d.set_item("games", report.games)?;
    d.set_item("deals", report.deals)?;
    d.set_item("avg_turns", report.avg_turns)?;
    let bd = PyDict::new(py);
    for b in &report.bots {
        let x = PyDict::new(py);
        x.set_item("seats", b.seats)?;
        x.set_item("mean", b.mean)?;
        x.set_item("ci95", b.ci95)?;
        bd.set_item(&b.name, x)?;
    }
    d.set_item("bots", bd)?;
    d.set_item("seat_rates", report.seat_rates.clone())?;
    d.set_item("reasons", report.reasons.clone())?;
    Ok(d)
}

#[pymodule]
fn _hoola(m: &Bound<'_, PyModule>) -> PyResult<()> {
    m.add_class::<PyGame>()?;
    m.add_function(wrap_pyfunction!(replay, m)?)?;
    m.add_function(wrap_pyfunction!(simulate, m)?)?;
    m.add("BOT_NAMES", CORE_BOT_NAMES.to_vec())?;
    m.add("__version__", env!("CARGO_PKG_VERSION"))?;
    Ok(())
}
