//! 훌라 규칙 엔진 코어.
//!
//! 규칙 명세는 저장소 루트의 `RULES.md`(v1.0, `offline_casual` 프리셋)를 따른다.

pub mod card;
pub mod meld;
pub mod rng;

pub use card::{Card, CardSet, ParseCardError, PointTable, Suit, parse_cards};
pub use meld::{AceMode, MeldKind, MeldRules, classify_new_meld};
pub use rng::Rng;
