//! 훌라 규칙 엔진 코어.
//!
//! 규칙 명세는 저장소 루트의 `RULES.md`(v1.0, `offline_casual` 프리셋)를 따른다.

pub mod arena;
pub mod belief;
pub mod bot;
pub mod card;
pub mod expert;
pub mod game;
pub mod meld;
pub mod observation;
pub mod preset;
pub mod replay;
pub mod rng;
pub mod rules;
pub mod search;

pub use belief::{Belief, RankWeights};
pub use bot::{Bot, GreedyBot, RandomBot, play_out};
pub use card::{Card, CardSet, ParseCardError, PointTable, Suit, parse_cards};
pub use expert::{ExpertBot, ExpertConfig, MeldMode, StopPolicy};
pub use game::{
    Action, EndReason, Event, Game, IllegalAction, Outcome, ParseActionError, Phase, PlayerState,
};
pub use meld::{AceMode, MeldKind, MeldRules, TableMeld, classify_new_meld};
pub use observation::Observation;
pub use preset::{Preset, PresetError};
pub use replay::{Replay, ReplayError};
pub use rng::Rng;
pub use rules::{DiscardVisibility, FirstPlayer, Rules, StockEmpty, StopRules, ThankYouRules};
pub use search::{ActionValue, SearchBot, SearchConfig};
