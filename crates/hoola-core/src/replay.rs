//! 리플레이 포맷 (JSON).
//!
//! 판은 (규칙, 인원, 시드, 선)으로 완전히 결정되므로 행동 목록만 저장하면 재현할 수 있다.
//!
//! ```json
//! {
//!   "format": 1,
//!   "rules_toml": "",
//!   "num_players": 2,
//!   "seed": 42,
//!   "first_player": 0,
//!   "actions": ["draw", "discard KD", "stop"]
//! }
//! ```
//!
//! `rules_toml`은 기본 프리셋 위에 덮어쓸 하우스 룰 TOML이다 (빈 문자열이면 `offline_casual`).

use std::fmt;

use serde::{Deserialize, Serialize};

use crate::game::{Action, Game};
use crate::preset;

pub const REPLAY_FORMAT: u32 = 1;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Replay {
    pub format: u32,
    pub rules_toml: String,
    pub num_players: usize,
    pub seed: u64,
    pub first_player: usize,
    pub actions: Vec<String>,
}

/// 리플레이 오류.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ReplayError {
    Json(String),
    Format(u32),
    Rules(String),
    Setup(String),
    /// `index`번째 행동이 잘못됨.
    Action {
        index: usize,
        message: String,
    },
}

impl fmt::Display for ReplayError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ReplayError::Json(m) => write!(f, "replay json error: {m}"),
            ReplayError::Format(v) => write!(f, "unsupported replay format {v}"),
            ReplayError::Rules(m) => write!(f, "replay rules error: {m}"),
            ReplayError::Setup(m) => write!(f, "replay setup error: {m}"),
            ReplayError::Action { index, message } => {
                write!(f, "replay action #{index}: {message}")
            }
        }
    }
}

impl std::error::Error for ReplayError {}

impl Replay {
    /// 빈 리플레이. 행동은 [`Replay::push`]로 쌓거나 [`Replay::record`]로 한 번에 담는다.
    pub fn new(rules_toml: &str, num_players: usize, seed: u64, first_player: usize) -> Replay {
        Replay {
            format: REPLAY_FORMAT,
            rules_toml: rules_toml.to_string(),
            num_players,
            seed,
            first_player,
            actions: Vec::new(),
        }
    }

    /// 판을 처음 상태로 만든다.
    pub fn start(&self) -> Result<Game, ReplayError> {
        if self.format != REPLAY_FORMAT {
            return Err(ReplayError::Format(self.format));
        }
        let rules = preset::parse(&self.rules_toml)
            .map_err(|e| ReplayError::Rules(e.to_string()))?
            .rules;
        Game::new(rules, self.num_players, self.seed, self.first_player).map_err(ReplayError::Setup)
    }

    pub fn push(&mut self, action: Action) {
        self.actions.push(action.to_string());
    }

    /// `game`의 행동 전체를 담는다. `game`은 이 리플레이의 설정으로 시작한 판이어야 한다.
    pub fn record(&mut self, game: &Game) {
        self.actions = game.actions().map(|a| a.to_string()).collect();
    }

    /// 처음부터 모든 행동을 적용한 판. 각 행동의 합법성을 검증한다.
    pub fn replay(&self) -> Result<Game, ReplayError> {
        let mut game = self.start()?;
        for (index, text) in self.actions.iter().enumerate() {
            let action: Action = text.parse().map_err(|e| ReplayError::Action {
                index,
                message: format!("{e}"),
            })?;
            game.apply(action).map_err(|e| ReplayError::Action {
                index,
                message: e.to_string(),
            })?;
        }
        Ok(game)
    }

    pub fn to_json(&self) -> String {
        serde_json::to_string_pretty(self).expect("replay serializes")
    }

    pub fn from_json(text: &str) -> Result<Replay, ReplayError> {
        serde_json::from_str(text).map_err(|e| ReplayError::Json(e.to_string()))
    }
}
