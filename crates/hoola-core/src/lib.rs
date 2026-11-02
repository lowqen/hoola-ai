//! 훌라 규칙 엔진 코어.
//!
//! 규칙 명세는 저장소 루트의 `RULES.md`(v1.0, `offline_casual` 프리셋)를 따른다.

pub mod card;
pub mod game;
pub mod meld;
pub mod preset;
pub mod rng;
pub mod rules;

pub use card::{Card, CardSet, ParseCardError, PointTable, Suit, parse_cards};
pub use game::{Action, EndReason, Game, IllegalAction, Outcome, Phase, PlayerState};
pub use meld::{AceMode, MeldKind, MeldRules, TableMeld, classify_new_meld};
pub use preset::{Preset, PresetError};
pub use rng::Rng;
pub use rules::{DiscardVisibility, FirstPlayer, Rules, StockEmpty, StopRules, ThankYouRules};
