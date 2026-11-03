//! 규칙 설정 전체. 기본값은 `offline_casual` 프리셋(RULES.md v1.0)이다.

use crate::card::PointTable;
use crate::meld::MeldRules;

/// 땡큐 설정 (`[thank_you]`, RULES.md §7). 정통훌라(앞사람 버림패만)만 지원한다.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ThankYouRules {
    /// 땡큐 카드와 합칠 손패 최소 장수.
    pub min_hand_cards: usize,
    /// 버려진 7 한 장만으로 단독 등록하는 땡큐 허용.
    pub allow_single_seven: bool,
    /// 가져온 카드를 바닥 등록패에 붙이기만 하는 땡큐 허용.
    pub allow_attach_only: bool,
    /// 선이 첫 차례에 첫 공개패를 땡큐할 수 있는지.
    pub on_initial_upcard: bool,
}

impl Default for ThankYouRules {
    fn default() -> Self {
        ThankYouRules {
            min_hand_cards: 2,
            allow_single_seven: false,
            allow_attach_only: false,
            on_initial_upcard: false,
        }
    }
}

/// 스톱 설정 (`[stop]`, RULES.md §8). 판정은 항상 "엄격 최저"다.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StopRules {
    /// 손패 점수가 이 값 이하일 때 선언 가능.
    pub limit: u32,
    pub requires_registration: bool,
    pub first_turn_allowed: bool,
}

impl Default for StopRules {
    fn default() -> Self {
        StopRules {
            limit: 10,
            requires_registration: false,
            first_turn_allowed: true,
        }
    }
}

/// 선 정하기 (`setup.first_player`). 엔진은 좌석을 직접 받고, 연속 대전 진행기가 이 값을 쓴다.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FirstPlayer {
    /// 판 시드로 정한다.
    Seed,
    /// 연속 대전에서 시계 방향으로 돌린다.
    Rotate,
    /// 항상 이 좌석.
    Seat(usize),
}

/// 받아야 하는데 더미가 비었을 때 (`end.on_stock_empty`, RULES.md §9).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StockEmpty {
    /// 버림패를 섞어 새 더미를 만든다. `limit`이 0이면 무제한.
    /// 섞을 카드가 없거나 횟수를 다 쓰면 최저 점수자가 승리한다.
    Reshuffle { keep_top: bool, limit: u32 },
    /// 즉시 최저 점수자 승리.
    LowestWins,
    /// 무승부.
    Draw,
}

/// 버림패 이력 공개 범위 (`visibility.discard_history`, RULES.md §11).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DiscardVisibility {
    /// 맨 위 1장만 보인다 (오프라인 방식).
    TopOnly,
    /// 전체 이력이 보인다.
    Full,
}

/// 엔진이 쓰는 규칙 묶음.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Rules {
    pub min_players: usize,
    pub max_players: usize,
    pub hand_size: usize,
    pub points: PointTable,
    pub meld: MeldRules,
    /// 등록(또는 땡큐)한 플레이어만 붙이기 가능.
    pub attach_requires_registration: bool,
    /// 다른 플레이어의 등록패에도 붙이기 가능.
    pub attach_to_others_melds: bool,
    pub thank_you: ThankYouRules,
    pub stop: StopRules,
    /// 시작 시 더미 맨 위 1장을 버림패로 공개.
    pub initial_upcard: bool,
    pub first_player: FirstPlayer,
    pub stock_empty: StockEmpty,
    pub discard_visibility: DiscardVisibility,
    /// 더미 잔여 장수 공개.
    pub stock_count_visible: bool,
    /// 이 턴 수를 넘기면 무승부 (시뮬레이션 보호용).
    pub max_turns: u32,
}

impl Default for Rules {
    fn default() -> Self {
        Rules {
            min_players: 2,
            max_players: 5,
            hand_size: 7,
            points: PointTable::default(),
            meld: MeldRules::default(),
            attach_requires_registration: true,
            attach_to_others_melds: true,
            thank_you: ThankYouRules::default(),
            stop: StopRules::default(),
            initial_upcard: true,
            first_player: FirstPlayer::Seed,
            stock_empty: StockEmpty::Reshuffle {
                keep_top: true,
                limit: 0,
            },
            discard_visibility: DiscardVisibility::TopOnly,
            stock_count_visible: true,
            max_turns: 1000,
        }
    }
}

impl Rules {
    /// 인원 수에 대해 판을 돌릴 수 있는 설정인지 검사한다.
    pub fn validate(&self, num_players: usize) -> Result<(), String> {
        if self.min_players < 2 || self.min_players > self.max_players {
            return Err(format!(
                "invalid player range {}..={}",
                self.min_players, self.max_players
            ));
        }
        if !(self.min_players..=self.max_players).contains(&num_players) {
            return Err(format!(
                "players must be {}..={}, got {num_players}",
                self.min_players, self.max_players
            ));
        }
        if let FirstPlayer::Seat(seat) = self.first_player
            && seat >= num_players
        {
            return Err(format!("first_player seat {seat} out of range"));
        }
        if self.hand_size == 0 {
            return Err("hand_size must be positive".into());
        }
        let needed = num_players * self.hand_size + usize::from(self.initial_upcard) + 1;
        if needed > 52 {
            return Err(format!("deck too small: need {needed} cards"));
        }
        if self.meld.min_set < 2 || self.meld.min_run < 2 {
            return Err("min_set and min_run must be at least 2".into());
        }
        Ok(())
    }
}
