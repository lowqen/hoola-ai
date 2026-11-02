//! TOML 규칙 프리셋 로딩 (RULES.md §13).
//!
//! 기본 프리셋 `config/presets/offline_casual.toml`을 크레이트에 내장해 두고, 하우스 룰 파일은
//! 그 위에 덮어쓴다. 그래서 하우스 룰 파일에는 바꿀 키만 적어도 된다. 모르는 키(오타)와 엔진이
//! 아직 지원하지 않는 값은 오류로 거부한다.

use std::fmt;
use std::path::Path;

use serde::Deserialize;

use crate::card::PointTable;
use crate::meld::{AceMode, MeldRules};
use crate::rules::{DiscardVisibility, FirstPlayer, Rules, StockEmpty, StopRules, ThankYouRules};

/// 내장 기본 프리셋 원문.
pub const OFFLINE_CASUAL_TOML: &str = include_str!("../../../config/presets/offline_casual.toml");

/// 불러온 프리셋.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Preset {
    pub name: String,
    pub rules_version: String,
    pub description: String,
    pub rules: Rules,
}

/// 프리셋 오류.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PresetError {
    Io(String),
    Parse(String),
    Unsupported(String),
}

impl fmt::Display for PresetError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            PresetError::Io(m) => write!(f, "preset io error: {m}"),
            PresetError::Parse(m) => write!(f, "preset parse error: {m}"),
            PresetError::Unsupported(m) => write!(f, "unsupported preset value: {m}"),
        }
    }
}

impl std::error::Error for PresetError {}

/// 기본 프리셋 (`offline_casual`).
pub fn offline_casual() -> Preset {
    parse_full(OFFLINE_CASUAL_TOML).expect("built-in preset is valid")
}

/// 하우스 룰 TOML을 기본 프리셋 위에 덮어써서 불러온다.
pub fn parse(text: &str) -> Result<Preset, PresetError> {
    let mut base: toml::Table = OFFLINE_CASUAL_TOML
        .parse()
        .map_err(|e: toml::de::Error| PresetError::Parse(e.to_string()))?;
    let overrides: toml::Table = text
        .parse()
        .map_err(|e: toml::de::Error| PresetError::Parse(e.to_string()))?;
    merge(&mut base, overrides);
    from_table(base)
}

/// 파일에서 불러온다 ([`parse`]와 같이 기본 프리셋 위에 덮어쓴다).
pub fn load(path: impl AsRef<Path>) -> Result<Preset, PresetError> {
    let path = path.as_ref();
    let text = std::fs::read_to_string(path)
        .map_err(|e| PresetError::Io(format!("{}: {e}", path.display())))?;
    parse(&text)
}

/// 모든 키가 들어 있는 TOML만 받는다 (덮어쓰기 없음).
pub fn parse_full(text: &str) -> Result<Preset, PresetError> {
    let table: toml::Table = text
        .parse()
        .map_err(|e: toml::de::Error| PresetError::Parse(e.to_string()))?;
    from_table(table)
}

fn merge(base: &mut toml::Table, overrides: toml::Table) {
    for (key, value) in overrides {
        match (base.get_mut(&key), value) {
            (Some(toml::Value::Table(b)), toml::Value::Table(o)) => merge(b, o),
            (_, value) => {
                base.insert(key, value);
            }
        }
    }
}

fn from_table(table: toml::Table) -> Result<Preset, PresetError> {
    let raw: RawPreset = toml::Value::Table(table)
        .try_into()
        .map_err(|e: toml::de::Error| PresetError::Parse(e.to_string()))?;
    raw.into_preset()
}

fn unsupported(key: &str, value: impl fmt::Display) -> PresetError {
    PresetError::Unsupported(format!("{key} = {value}"))
}

// ---- TOML 구조 (offline_casual.toml과 1:1) ----

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct RawPreset {
    meta: RawMeta,
    players: RawPlayers,
    deck: RawDeck,
    card_points: RawCardPoints,
    setup: RawSetup,
    meld: RawMeld,
    attach: RawAttach,
    thank_you: RawThankYou,
    stop: RawStop,
    end: RawEnd,
    result: RawResult,
    visibility: RawVisibility,
    engine: RawEngine,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct RawMeta {
    name: String,
    rules_version: String,
    description: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct RawPlayers {
    min: usize,
    max: usize,
    hand_size: usize,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct RawDeck {
    jokers: u32,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct RawCardPoints {
    ace: u8,
    jack: u8,
    queen: u8,
    king: u8,
    seven: u8,
}

#[derive(Deserialize)]
#[serde(untagged)]
enum RawFirstPlayer {
    Seat(usize),
    Name(String),
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct RawSetup {
    initial_upcard: bool,
    first_player: RawFirstPlayer,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct RawMeld {
    min_set: usize,
    min_run: usize,
    run_ace_mode: String,
    single_seven: bool,
    seven_accepts_neighbors: bool,
    seven_accepts_sevens: bool,
    allow_rearrange: bool,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct RawAttach {
    requires_registration: bool,
    to_others_melds: bool,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct RawThankYou {
    mode: String,
    source: String,
    min_hand_cards: usize,
    must_meld_taken_card: bool,
    allow_single_seven: bool,
    allow_attach_only: bool,
    on_initial_upcard: bool,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct RawStop {
    timing: String,
    limit: u32,
    requires_registration: bool,
    first_turn_allowed: bool,
    win_rule: String,
    fallback_winner: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct RawEnd {
    on_stock_empty: String,
    reshuffle_keep_top: bool,
    reshuffle_limit: u32,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct RawResult {
    tie_reward: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct RawVisibility {
    discard_history: String,
    stock_count: bool,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct RawEngine {
    max_turns: u32,
}

impl RawPreset {
    fn into_preset(self) -> Result<Preset, PresetError> {
        if self.deck.jokers != 0 {
            return Err(unsupported("deck.jokers", self.deck.jokers));
        }
        if self.meld.allow_rearrange {
            return Err(unsupported("meld.allow_rearrange", true));
        }
        expect_str("thank_you.mode", &self.thank_you.mode, "orthodox")?;
        expect_str("thank_you.source", &self.thank_you.source, "previous_player")?;
        if !self.thank_you.must_meld_taken_card {
            return Err(unsupported("thank_you.must_meld_taken_card", false));
        }
        expect_str("stop.timing", &self.stop.timing, "before_acquire")?;
        expect_str("stop.win_rule", &self.stop.win_rule, "strictly_lowest")?;
        expect_str(
            "stop.fallback_winner",
            &self.stop.fallback_winner,
            "lowest_excluding_caller",
        )?;
        expect_str("result.tie_reward", &self.result.tie_reward, "split")?;

        let ace_mode = match self.meld.run_ace_mode.as_str() {
            "low" => AceMode::Low,
            "high_low" => AceMode::HighLow,
            "wrap" => AceMode::Wrap,
            other => return Err(unsupported("meld.run_ace_mode", other)),
        };
        let first_player = match self.setup.first_player {
            RawFirstPlayer::Seat(seat) => FirstPlayer::Seat(seat),
            RawFirstPlayer::Name(name) => match name.as_str() {
                "seed" => FirstPlayer::Seed,
                "rotate" => FirstPlayer::Rotate,
                other => return Err(unsupported("setup.first_player", other)),
            },
        };
        let stock_empty = match self.end.on_stock_empty.as_str() {
            "reshuffle" => StockEmpty::Reshuffle {
                keep_top: self.end.reshuffle_keep_top,
                limit: self.end.reshuffle_limit,
            },
            "lowest_wins" => StockEmpty::LowestWins,
            "draw" => StockEmpty::Draw,
            other => return Err(unsupported("end.on_stock_empty", other)),
        };
        let discard_visibility = match self.visibility.discard_history.as_str() {
            "top_only" => DiscardVisibility::TopOnly,
            "full" => DiscardVisibility::Full,
            other => return Err(unsupported("visibility.discard_history", other)),
        };
        let cp = &self.card_points;
        let points = PointTable::new([
            cp.ace, 2, 3, 4, 5, 6, cp.seven, 8, 9, 10, cp.jack, cp.queen, cp.king,
        ]);

        let rules = Rules {
            min_players: self.players.min,
            max_players: self.players.max,
            hand_size: self.players.hand_size,
            points,
            meld: MeldRules {
                min_set: self.meld.min_set,
                min_run: self.meld.min_run,
                ace_mode,
                single_seven: self.meld.single_seven,
                seven_accepts_neighbors: self.meld.seven_accepts_neighbors,
                seven_accepts_sevens: self.meld.seven_accepts_sevens,
            },
            attach_requires_registration: self.attach.requires_registration,
            attach_to_others_melds: self.attach.to_others_melds,
            thank_you: ThankYouRules {
                min_hand_cards: self.thank_you.min_hand_cards,
                allow_single_seven: self.thank_you.allow_single_seven,
                allow_attach_only: self.thank_you.allow_attach_only,
                on_initial_upcard: self.thank_you.on_initial_upcard,
            },
            stop: StopRules {
                limit: self.stop.limit,
                requires_registration: self.stop.requires_registration,
                first_turn_allowed: self.stop.first_turn_allowed,
            },
            initial_upcard: self.setup.initial_upcard,
            first_player,
            stock_empty,
            discard_visibility,
            stock_count_visible: self.visibility.stock_count,
            max_turns: self.engine.max_turns,
        };
        rules
            .validate(rules.min_players)
            .map_err(PresetError::Unsupported)?;
        Ok(Preset {
            name: self.meta.name,
            rules_version: self.meta.rules_version,
            description: self.meta.description,
            rules,
        })
    }
}

fn expect_str(key: &str, value: &str, expected: &str) -> Result<(), PresetError> {
    if value == expected {
        Ok(())
    } else {
        Err(unsupported(key, value))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn built_in_preset_matches_rules_default() {
        let p = offline_casual();
        assert_eq!(p.name, "offline_casual");
        assert_eq!(p.rules_version, "1.0");
        assert_eq!(p.rules, Rules::default());
    }

    #[test]
    fn empty_override_is_the_default() {
        assert_eq!(parse("").unwrap().rules, Rules::default());
    }

    #[test]
    fn partial_override() {
        let p = parse(
            r#"
            [meta]
            name = "house"

            [stop]
            limit = 5

            [meld]
            run_ace_mode = "high_low"

            [card_points]
            seven = 0

            [setup]
            first_player = 1
            "#,
        )
        .unwrap();
        assert_eq!(p.name, "house");
        assert_eq!(p.rules.stop.limit, 5);
        assert_eq!(p.rules.meld.ace_mode, AceMode::HighLow);
        assert_eq!(p.rules.points.points("7D".parse().unwrap()), 0);
        assert_eq!(p.rules.points.points("8D".parse().unwrap()), 8);
        assert_eq!(p.rules.first_player, FirstPlayer::Seat(1));
        assert_eq!(p.rules.hand_size, 7);
    }

    #[test]
    fn stock_empty_modes() {
        let p = parse("[end]\non_stock_empty = \"lowest_wins\"").unwrap();
        assert_eq!(p.rules.stock_empty, StockEmpty::LowestWins);
        let p = parse("[end]\nreshuffle_keep_top = false\nreshuffle_limit = 2").unwrap();
        assert_eq!(
            p.rules.stock_empty,
            StockEmpty::Reshuffle {
                keep_top: false,
                limit: 2
            }
        );
    }

    #[test]
    fn unknown_keys_are_rejected() {
        assert!(matches!(
            parse("[stop]\nlimt = 5"),
            Err(PresetError::Parse(_))
        ));
        assert!(matches!(
            parse("[stopp]\nlimit = 5"),
            Err(PresetError::Parse(_))
        ));
    }

    #[test]
    fn unsupported_values_are_rejected() {
        for text in [
            "[thank_you]\nmode = \"battle\"",
            "[thank_you]\nmust_meld_taken_card = false",
            "[meld]\nallow_rearrange = true",
            "[meld]\nrun_ace_mode = \"sideways\"",
            "[deck]\njokers = 2",
            "[result]\ntie_reward = \"none\"",
            "[players]\nmin = 1",
            "[setup]\nfirst_player = \"dealer\"",
        ] {
            assert!(
                matches!(parse(text), Err(PresetError::Unsupported(_))),
                "{text:?} should be unsupported"
            );
        }
    }

    #[test]
    fn wrong_types_are_parse_errors() {
        assert!(matches!(
            parse("[stop]\nlimit = \"ten\""),
            Err(PresetError::Parse(_))
        ));
        assert!(matches!(parse("not toml ="), Err(PresetError::Parse(_))));
    }
}
