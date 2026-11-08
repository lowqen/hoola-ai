//! 플레이어 관측 (정보집합). RULES.md §11.
//!
//! [`Observation`]에는 그 좌석이 알 수 있는 정보만 들어 있다. AI와 봇은 [`crate::Game`] 대신
//! 이것만 보고 행동해야 한다.

use crate::card::{Card, CardSet};
use crate::game::{Event, Game, Outcome, Phase};
use crate::meld::TableMeld;
use crate::rules::{DiscardVisibility, Rules};

/// 한 좌석의 관측.
#[derive(Debug, Clone, PartialEq)]
pub struct Observation<'a> {
    pub rules: &'a Rules,
    /// 관측하는 좌석.
    pub seat: usize,
    pub num_players: usize,
    pub current_player: usize,
    pub phase: Phase,
    pub turn: u32,
    /// 이 판의 실제 스톱 한도 (인원별 변형 반영, `StopRules::limit_for`).
    pub stop_limit: u32,
    /// 내 손패.
    pub hand: CardSet,
    /// 좌석별 손패 장수.
    pub hand_counts: Vec<usize>,
    /// 좌석별 등록 상태.
    pub registered: Vec<bool>,
    pub melds: &'a [TableMeld],
    pub discard_top: Option<Card>,
    /// 버림패 더미 전체 (맨 위가 끝). 공개 이벤트를 완벽히 기억하면 알 수 있는 정보다.
    pub known_discards: &'a [Card],
    /// 화면에 보이는 버림패 (`visibility.discard_history`). 사람용 UI가 쓴다.
    pub visible_discards: &'a [Card],
    /// 더미 잔여 장수 (`visibility.stock_count`가 꺼져 있으면 `None`).
    pub stock_len: Option<usize>,
    /// 지금 차례 플레이어가 땡큐할 수 있는 카드 (대상 조건만 검사).
    pub thank_you_target: Option<Card>,
    /// 버림패 맨 위를 버린 좌석 (첫 공개패면 `None`).
    pub top_discarder: Option<usize>,
    /// 좌석별로 지금까지 시작한 차례 수.
    pub turns_started: Vec<u32>,
    pub reshuffles: u32,
    /// 공개 이벤트 전체.
    pub events: &'a [Event],
    pub outcome: Option<&'a Outcome>,
    /// 판이 끝나면 전원의 손패가 공개된다.
    pub revealed_hands: Option<Vec<CardSet>>,
}

impl Observation<'_> {
    pub fn is_my_turn(&self) -> bool {
        self.current_player == self.seat && self.phase != Phase::Over
    }

    /// 내가 위치를 모르는 카드 = 다른 사람 손패 ∪ 더미.
    pub fn unseen(&self) -> CardSet {
        let mut seen = self.hand;
        for m in self.melds {
            seen = seen.union(m.cards);
        }
        for &c in self.known_discards {
            seen.insert(c);
        }
        CardSet::FULL.difference(seen)
    }

    pub fn hand_points(&self) -> u32 {
        self.hand.points(&self.rules.points)
    }
}

impl Game {
    /// `seat`의 관측을 만든다.
    pub fn observation(&self, seat: usize) -> Observation<'_> {
        assert!(seat < self.num_players(), "seat {seat} out of range");
        let rules = self.rules();
        let n = self.num_players();
        let pile = self.discard_pile();
        let visible = match rules.discard_visibility {
            DiscardVisibility::Full => pile,
            DiscardVisibility::TopOnly => &pile[pile.len().saturating_sub(1)..],
        };
        Observation {
            rules,
            seat,
            num_players: n,
            current_player: self.current_player(),
            phase: self.phase(),
            turn: self.turn(),
            stop_limit: rules.stop.limit_for(n),
            hand: self.hand(seat),
            hand_counts: (0..n).map(|s| self.hand(s).len()).collect(),
            registered: (0..n).map(|s| self.player(s).registered).collect(),
            melds: self.melds(),
            discard_top: self.discard_top(),
            known_discards: pile,
            visible_discards: visible,
            stock_len: rules.stock_count_visible.then(|| self.stock_len()),
            thank_you_target: self.thank_you_target(),
            top_discarder: self.top_discarder(),
            turns_started: (0..n).map(|s| self.player(s).turns_started).collect(),
            reshuffles: self.reshuffles(),
            events: self.events(),
            outcome: self.outcome(),
            revealed_hands: self
                .is_over()
                .then(|| (0..n).map(|s| self.hand(s)).collect()),
        }
    }
}
