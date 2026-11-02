//! 게임 상태기계. RULES.md §3–§10.
//!
//! 한 턴: `TurnStart`(스톱 또는 받기/땡큐) → `MeldPhase`(등록·붙이기 0회 이상, 버리기) → 다음 사람.

use std::fmt;
use std::str::FromStr;

use crate::card::{Card, CardSet};
use crate::meld::{MeldKind, TableMeld, classify_new_meld};
use crate::rng::Rng;
use crate::rules::{Rules, StockEmpty};

/// 플레이어 행동.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Action {
    /// 받기 전 스톱 선언 (§8).
    Stop,
    /// 더미에서 1장 받기. 더미가 비었으면 재섞기 후 받는다 (§9).
    Draw,
    /// 버림패 맨 위를 가져와 `meld`(가져온 카드 포함)로 즉시 등록 (§7).
    ThankYou { meld: CardSet },
    /// 버림패 맨 위를 가져와 바닥 등록패 `meld`에 붙이기 (`allow_attach_only`일 때만).
    ThankYouAttach { meld: usize },
    /// 손패로 새 조합 등록 (§5).
    Register { cards: CardSet },
    /// 손패 1장을 바닥 등록패에 붙이기 (§6).
    Attach { card: Card, meld: usize },
    /// 손패 1장 버리기.
    Discard { card: Card },
}

impl fmt::Display for Action {
    /// 리플레이용 텍스트 형식. [`Action::from_str`]으로 되돌릴 수 있다.
    ///
    /// `stop`, `draw`, `thankyou 4H 5H 6H`, `thankyou-attach 2`, `register 3H 4H 5H`,
    /// `attach 8D 2`, `discard KD`
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Action::Stop => write!(f, "stop"),
            Action::Draw => write!(f, "draw"),
            Action::ThankYou { meld } => write!(f, "thankyou {meld}"),
            Action::ThankYouAttach { meld } => write!(f, "thankyou-attach {meld}"),
            Action::Register { cards } => write!(f, "register {cards}"),
            Action::Attach { card, meld } => write!(f, "attach {card} {meld}"),
            Action::Discard { card } => write!(f, "discard {card}"),
        }
    }
}

/// 행동 텍스트 파싱 오류.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParseActionError(pub String);

impl fmt::Display for ParseActionError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "invalid action: {:?}", self.0)
    }
}

impl std::error::Error for ParseActionError {}

impl FromStr for Action {
    type Err = ParseActionError;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        let err = || ParseActionError(s.to_string());
        let mut words = s.split_whitespace();
        let verb = words.next().ok_or_else(err)?;
        let rest: Vec<&str> = words.collect();
        let card = |w: &str| w.parse::<Card>().map_err(|_| err());
        let cards = |ws: &[&str]| -> Result<CardSet, ParseActionError> {
            if ws.is_empty() {
                return Err(err());
            }
            ws.iter().map(|w| card(w)).collect()
        };
        let index = |w: &str| w.parse::<usize>().map_err(|_| err());
        let action = match (verb, rest.as_slice()) {
            ("stop", []) => Action::Stop,
            ("draw", []) => Action::Draw,
            ("thankyou", ws) => Action::ThankYou { meld: cards(ws)? },
            ("thankyou-attach", [m]) => Action::ThankYouAttach { meld: index(m)? },
            ("register", ws) => Action::Register { cards: cards(ws)? },
            ("attach", [c, m]) => Action::Attach {
                card: card(c)?,
                meld: index(m)?,
            },
            ("discard", [c]) => Action::Discard { card: card(c)? },
            _ => return Err(err()),
        };
        Ok(action)
    }
}

/// 진행 단계.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Phase {
    /// 차례 시작: 스톱, 받기, 땡큐 중 선택.
    TurnStart,
    /// 받은 뒤: 등록·붙이기를 하거나 버리기로 차례를 끝낸다.
    MeldPhase,
    /// 판 종료.
    Over,
}

/// 판이 끝난 이유.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EndReason {
    /// 손패 0장 (§10).
    Out { player: usize },
    /// 스톱 판정 (§8.2). `success`면 선언자 단독 승리.
    Stop { caller: usize, success: bool },
    /// 받을 카드가 없음 (§9 예외, 또는 `on_stock_empty` 설정). 승자가 없으면 무승부.
    NoCards,
    /// `max_turns` 초과. 규칙이 아닌 시뮬레이션 보호용 무승부.
    TurnLimit,
}

/// 판 결과.
#[derive(Debug, Clone, PartialEq)]
pub struct Outcome {
    pub reason: EndReason,
    /// 승자 좌석 (공동 승리면 여럿, 무승부면 비어 있음).
    pub winners: Vec<usize>,
    /// 좌석별 보상. 승자는 1/k, 나머지 0. 무승부는 전원 1/n.
    pub rewards: Vec<f64>,
}

impl Outcome {
    fn with_winners(reason: EndReason, winners: Vec<usize>, num_players: usize) -> Outcome {
        let mut rewards = vec![0.0; num_players];
        let share = 1.0 / winners.len() as f64;
        for &w in &winners {
            rewards[w] = share;
        }
        Outcome {
            reason,
            winners,
            rewards,
        }
    }

    fn draw(reason: EndReason, num_players: usize) -> Outcome {
        Outcome {
            reason,
            winners: Vec::new(),
            rewards: vec![1.0 / num_players as f64; num_players],
        }
    }
}

/// 잘못된 행동.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct IllegalAction {
    pub action: Action,
    pub reason: &'static str,
}

impl fmt::Display for IllegalAction {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "illegal action {}: {}", self.action, self.reason)
    }
}

impl std::error::Error for IllegalAction {}

/// 공개 이벤트. 모든 플레이어가 보는 판의 기록이다 (RULES.md §11).
///
/// 행동 자체가 공개 정보다: `Draw`에는 받은 카드가 들어 있지 않고, 땡큐·등록·붙이기·버리기의
/// 카드는 모두에게 보인다.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Event {
    Action {
        seat: usize,
        action: Action,
    },
    /// 버림패를 섞어 더미를 다시 만들었다. `stock`은 새 더미 장수.
    Reshuffle {
        stock: usize,
    },
}

/// 플레이어별 상태.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PlayerState {
    pub hand: CardSet,
    /// 이번 판에 등록 또는 땡큐를 한 번 이상 했는지.
    pub registered: bool,
    /// 지금까지 시작한 차례 수 (첫 차례 판정용).
    pub turns_started: u32,
}

/// 게임 전체 상태 (완전정보).
#[derive(Debug, Clone)]
pub struct Game {
    rules: Rules,
    rng: Rng,
    players: Vec<PlayerState>,
    /// 더미. 맨 위가 끝.
    stock: Vec<Card>,
    /// 버림패 더미. 맨 위가 끝.
    discard: Vec<Card>,
    /// 버림패 맨 위를 버린 좌석. 첫 공개패면 `None`.
    top_discarder: Option<usize>,
    melds: Vec<TableMeld>,
    current: usize,
    phase: Phase,
    /// 지금까지 시작된 차례 수 (전원 합계).
    turn: u32,
    reshuffles: u32,
    outcome: Option<Outcome>,
    events: Vec<Event>,
}

impl Game {
    /// 시드로 섞고 나눠 판을 시작한다. `first_player`가 선.
    pub fn new(
        rules: Rules,
        num_players: usize,
        seed: u64,
        first_player: usize,
    ) -> Result<Game, String> {
        rules.validate(num_players)?;
        if first_player >= num_players {
            return Err(format!("first_player {first_player} out of range"));
        }
        let mut rng = Rng::seed_from_u64(seed);
        let mut deck: Vec<Card> = Card::all().collect();
        rng.shuffle(&mut deck);
        Ok(Game::from_deck(rules, num_players, deck, first_player, rng))
    }

    /// 주어진 카드 순서로 판을 시작한다 (맨 위가 `deck`의 끝). 테스트·듀플리케이트용.
    ///
    /// 선부터 시계 방향으로 한 장씩 돌려 나누고, 이어서 첫 공개패를 뒤집는다.
    pub fn from_deck(
        rules: Rules,
        num_players: usize,
        mut deck: Vec<Card>,
        first_player: usize,
        rng: Rng,
    ) -> Game {
        let mut players = vec![
            PlayerState {
                hand: CardSet::EMPTY,
                registered: false,
                turns_started: 0,
            };
            num_players
        ];
        for _ in 0..rules.hand_size {
            for offset in 0..num_players {
                let seat = (first_player + offset) % num_players;
                let card = deck.pop().expect("deck too small");
                players[seat].hand.insert(card);
            }
        }
        let mut discard = Vec::new();
        if rules.initial_upcard {
            discard.push(deck.pop().expect("deck too small"));
        }
        let mut game = Game {
            rules,
            rng,
            players,
            stock: deck,
            discard,
            top_discarder: None,
            melds: Vec::new(),
            current: first_player,
            phase: Phase::TurnStart,
            turn: 0,
            reshuffles: 0,
            outcome: None,
            events: Vec::new(),
        };
        game.begin_turn();
        game
    }

    /// 손패를 직접 지정해 시작한다. 테스트·퍼즐용.
    ///
    /// 더미는 `stock_top`을 앞에서부터 차례로 받게 되고, 그 아래에 나머지 카드가 시드 순서로 깔린다.
    pub fn with_hands(
        rules: Rules,
        hands: &[CardSet],
        upcard: Option<Card>,
        stock_top: &[Card],
        first_player: usize,
        seed: u64,
    ) -> Game {
        let mut used = CardSet::EMPTY;
        for &h in hands {
            assert!(used.intersection(h).is_empty(), "hands overlap");
            used = used.union(h);
        }
        if let Some(u) = upcard {
            assert!(!used.contains(u), "upcard in a hand");
            used.insert(u);
        }
        let top: CardSet = stock_top.iter().copied().collect();
        assert!(used.intersection(top).is_empty(), "stock_top overlaps");
        assert_eq!(top.len(), stock_top.len(), "stock_top has duplicates");
        used = used.union(top);
        let mut rng = Rng::seed_from_u64(seed);
        let mut stock: Vec<Card> = CardSet::FULL.difference(used).iter().collect();
        rng.shuffle(&mut stock);
        stock.extend(stock_top.iter().rev());
        let players = hands
            .iter()
            .map(|&hand| PlayerState {
                hand,
                registered: false,
                turns_started: 0,
            })
            .collect();
        let mut game = Game {
            rules,
            rng,
            players,
            stock,
            discard: upcard.into_iter().collect(),
            top_discarder: None,
            melds: Vec::new(),
            current: first_player,
            phase: Phase::TurnStart,
            turn: 0,
            reshuffles: 0,
            outcome: None,
            events: Vec::new(),
        };
        game.begin_turn();
        game
    }

    // ---- 조회 ----

    pub fn rules(&self) -> &Rules {
        &self.rules
    }

    pub fn num_players(&self) -> usize {
        self.players.len()
    }

    pub fn current_player(&self) -> usize {
        self.current
    }

    pub fn phase(&self) -> Phase {
        self.phase
    }

    pub fn is_over(&self) -> bool {
        self.phase == Phase::Over
    }

    pub fn outcome(&self) -> Option<&Outcome> {
        self.outcome.as_ref()
    }

    pub fn player(&self, seat: usize) -> &PlayerState {
        &self.players[seat]
    }

    pub fn hand(&self, seat: usize) -> CardSet {
        self.players[seat].hand
    }

    pub fn hand_points(&self, seat: usize) -> u32 {
        self.players[seat].hand.points(&self.rules.points)
    }

    pub fn melds(&self) -> &[TableMeld] {
        &self.melds
    }

    pub fn stock_len(&self) -> usize {
        self.stock.len()
    }

    /// 버림패 더미 (맨 위가 끝).
    pub fn discard_pile(&self) -> &[Card] {
        &self.discard
    }

    pub fn discard_top(&self) -> Option<Card> {
        self.discard.last().copied()
    }

    pub fn turn(&self) -> u32 {
        self.turn
    }

    pub fn reshuffles(&self) -> u32 {
        self.reshuffles
    }

    /// 지금까지의 공개 이벤트.
    pub fn events(&self) -> &[Event] {
        &self.events
    }

    /// 지금까지 적용된 행동 (리플레이용).
    pub fn actions(&self) -> impl Iterator<Item = Action> + '_ {
        self.events.iter().filter_map(|e| match e {
            Event::Action { action, .. } => Some(*action),
            Event::Reshuffle { .. } => None,
        })
    }

    fn previous_player(&self) -> usize {
        (self.current + self.players.len() - 1) % self.players.len()
    }

    /// 지금 차례 플레이어가 땡큐할 수 있는 카드 (§7 대상 조건만, 조합 가능 여부는 별도).
    pub fn thank_you_target(&self) -> Option<Card> {
        if self.phase != Phase::TurnStart {
            return None;
        }
        let top = self.discard_top()?;
        let eligible = match self.top_discarder {
            Some(seat) => seat == self.previous_player(),
            None => self.rules.thank_you.on_initial_upcard && self.turn == 1,
        };
        eligible.then_some(top)
    }

    fn can_stop(&self) -> bool {
        let p = &self.players[self.current];
        let stop = &self.rules.stop;
        p.hand.points(&self.rules.points) <= stop.limit
            && (!stop.requires_registration || p.registered)
            && (stop.first_turn_allowed || p.turns_started > 1)
    }

    fn can_attach_to(&self, seat: usize, meld: &TableMeld) -> bool {
        self.rules.attach_to_others_melds || meld.owner == seat
    }

    // ---- 합법 수 ----

    /// 지금 차례 플레이어의 합법 수 전체. 판이 끝났으면 비어 있다.
    pub fn legal_actions(&self) -> Vec<Action> {
        let mut out = Vec::new();
        match self.phase {
            Phase::Over => {}
            Phase::TurnStart => {
                if self.can_stop() {
                    out.push(Action::Stop);
                }
                out.push(Action::Draw);
                if let Some(top) = self.thank_you_target() {
                    let hand = self.players[self.current].hand;
                    let ty = &self.rules.thank_you;
                    for meld in new_melds(hand.union(single(top)), &self.rules) {
                        if !meld.contains(top) {
                            continue;
                        }
                        let from_hand = meld.len() - 1;
                        let single_seven = meld.len() == 1;
                        let ok = if single_seven {
                            ty.allow_single_seven
                        } else {
                            from_hand >= ty.min_hand_cards
                        };
                        if ok {
                            out.push(Action::ThankYou { meld });
                        }
                    }
                    if ty.allow_attach_only {
                        for (i, m) in self.melds.iter().enumerate() {
                            if self.can_attach_to(self.current, m)
                                && m.can_attach(top, &self.rules.meld)
                            {
                                out.push(Action::ThankYouAttach { meld: i });
                            }
                        }
                    }
                }
            }
            Phase::MeldPhase => {
                let seat = self.current;
                let p = &self.players[seat];
                for cards in new_melds(p.hand, &self.rules) {
                    out.push(Action::Register { cards });
                }
                if p.registered || !self.rules.attach_requires_registration {
                    for card in p.hand {
                        for (i, m) in self.melds.iter().enumerate() {
                            if self.can_attach_to(seat, m) && m.can_attach(card, &self.rules.meld) {
                                out.push(Action::Attach { card, meld: i });
                            }
                        }
                    }
                }
                for card in p.hand {
                    out.push(Action::Discard { card });
                }
            }
        }
        out
    }

    pub fn is_legal(&self, action: Action) -> bool {
        self.legal_actions().contains(&action)
    }

    // ---- 진행 ----

    /// 행동을 적용한다. 불법이면 상태는 바뀌지 않는다.
    pub fn apply(&mut self, action: Action) -> Result<(), IllegalAction> {
        if !self.is_legal(action) {
            return Err(IllegalAction {
                action,
                reason: match self.phase {
                    Phase::Over => "game is over",
                    _ => "not a legal action in this state",
                },
            });
        }
        let seat = self.current;
        self.events.push(Event::Action { seat, action });
        match action {
            Action::Stop => self.resolve_stop(seat),
            Action::Draw => {
                if self.stock.is_empty() && !self.refill_stock() {
                    return Ok(());
                }
                let card = self.stock.pop().expect("stock refilled");
                self.players[seat].hand.insert(card);
                self.phase = Phase::MeldPhase;
            }
            Action::ThankYou { meld } => {
                let top = self.discard.pop().expect("thank-you target");
                let from_hand = meld.difference(single(top));
                let p = &mut self.players[seat];
                p.hand = p.hand.difference(from_hand);
                p.registered = true;
                let kind = classify_set(meld, &self.rules).expect("legal meld");
                self.melds.push(TableMeld::new(seat, kind, meld));
                self.phase = Phase::MeldPhase;
                self.check_out(seat);
            }
            Action::ThankYouAttach { meld } => {
                let top = self.discard.pop().expect("thank-you target");
                let attached = self.melds[meld].attach(top, &self.rules.meld);
                debug_assert!(attached);
                self.players[seat].registered = true;
                self.phase = Phase::MeldPhase;
            }
            Action::Register { cards } => {
                let kind = classify_set(cards, &self.rules).expect("legal meld");
                let p = &mut self.players[seat];
                p.hand = p.hand.difference(cards);
                p.registered = true;
                self.melds.push(TableMeld::new(seat, kind, cards));
                self.check_out(seat);
            }
            Action::Attach { card, meld } => {
                let attached = self.melds[meld].attach(card, &self.rules.meld);
                debug_assert!(attached);
                self.players[seat].hand.remove(card);
                self.check_out(seat);
            }
            Action::Discard { card } => {
                self.players[seat].hand.remove(card);
                self.discard.push(card);
                self.top_discarder = Some(seat);
                if !self.check_out(seat) {
                    self.current = (seat + 1) % self.players.len();
                    self.phase = Phase::TurnStart;
                    self.begin_turn();
                }
            }
        }
        Ok(())
    }

    fn begin_turn(&mut self) {
        if self.turn >= self.rules.max_turns {
            self.phase = Phase::Over;
            self.outcome = Some(Outcome::draw(EndReason::TurnLimit, self.players.len()));
            return;
        }
        self.turn += 1;
        self.players[self.current].turns_started += 1;
    }

    /// 손패 0장이면 털기 승리로 판을 끝내고 `true`.
    fn check_out(&mut self, seat: usize) -> bool {
        if !self.players[seat].hand.is_empty() {
            return false;
        }
        self.phase = Phase::Over;
        self.outcome = Some(Outcome::with_winners(
            EndReason::Out { player: seat },
            vec![seat],
            self.players.len(),
        ));
        true
    }

    /// 빈 더미를 설정에 따라 채운다. 판이 끝났으면 `false`.
    fn refill_stock(&mut self) -> bool {
        match self.rules.stock_empty {
            StockEmpty::Reshuffle { keep_top, limit } => {
                let allowed = limit == 0 || self.reshuffles < limit;
                if allowed && self.reshuffle(keep_top) {
                    return true;
                }
                self.finish_lowest(EndReason::NoCards);
            }
            StockEmpty::LowestWins => self.finish_lowest(EndReason::NoCards),
            StockEmpty::Draw => {
                self.phase = Phase::Over;
                self.outcome = Some(Outcome::draw(EndReason::NoCards, self.players.len()));
            }
        }
        false
    }

    /// 버림패를 섞어 더미로 만든다. `keep_top`이면 맨 위 1장은 남긴다 (계속 땡큐 대상).
    /// 섞을 카드가 없으면 `false`.
    fn reshuffle(&mut self, keep_top: bool) -> bool {
        let keep = usize::from(keep_top);
        if self.discard.len() <= keep {
            return false;
        }
        let top = if keep_top { self.discard.pop() } else { None };
        let mut cards = std::mem::take(&mut self.discard);
        self.rng.shuffle(&mut cards);
        self.stock = cards;
        self.discard.extend(top);
        if !keep_top {
            self.top_discarder = None;
        }
        self.reshuffles += 1;
        self.events.push(Event::Reshuffle {
            stock: self.stock.len(),
        });
        true
    }

    fn resolve_stop(&mut self, caller: usize) {
        let points: Vec<u32> = (0..self.players.len())
            .map(|s| self.hand_points(s))
            .collect();
        let mine = points[caller];
        let success = points
            .iter()
            .enumerate()
            .all(|(s, &p)| s == caller || p > mine);
        let winners = if success {
            vec![caller]
        } else {
            let best = points
                .iter()
                .enumerate()
                .filter(|&(s, _)| s != caller)
                .map(|(_, &p)| p)
                .min()
                .expect("at least two players");
            (0..self.players.len())
                .filter(|&s| s != caller && points[s] == best)
                .collect()
        };
        self.phase = Phase::Over;
        self.outcome = Some(Outcome::with_winners(
            EndReason::Stop { caller, success },
            winners,
            self.players.len(),
        ));
    }

    fn finish_lowest(&mut self, reason: EndReason) {
        let points: Vec<u32> = (0..self.players.len())
            .map(|s| self.hand_points(s))
            .collect();
        let best = *points.iter().min().expect("players");
        let winners = (0..self.players.len())
            .filter(|&s| points[s] == best)
            .collect();
        self.phase = Phase::Over;
        self.outcome = Some(Outcome::with_winners(reason, winners, self.players.len()));
    }
}

fn single(card: Card) -> CardSet {
    let mut s = CardSet::EMPTY;
    s.insert(card);
    s
}

/// 카드 집합이 새 조합이면 그 종류.
pub fn classify_set(cards: CardSet, rules: &Rules) -> Option<MeldKind> {
    let v: Vec<Card> = cards.iter().collect();
    classify_new_meld(&v, &rules.meld)
}

/// `pool`에서 새로 등록할 수 있는 모든 조합 (세트, 런, 7 단독).
pub fn new_melds(pool: CardSet, rules: &Rules) -> Vec<CardSet> {
    let mut out = Vec::new();
    // 같은 랭크끼리 → 세트 후보
    for rank in 1..=13u8 {
        let group: CardSet = pool.iter().filter(|c| c.rank() == rank).collect();
        push_valid_subsets(group, rules, rules.meld.min_set, &mut out);
    }
    // 같은 무늬끼리 → 런 후보
    for suit in crate::card::Suit::ALL {
        let group: CardSet = pool.iter().filter(|c| c.suit() == suit).collect();
        push_valid_subsets(group, rules, rules.meld.min_run, &mut out);
    }
    if rules.meld.single_seven {
        for card in pool.iter().filter(|c| c.rank() == 7) {
            out.push(single(card));
        }
    }
    out
}

fn push_valid_subsets(group: CardSet, rules: &Rules, min_len: usize, out: &mut Vec<CardSet>) {
    let cards: Vec<Card> = group.iter().collect();
    let n = cards.len();
    if n < min_len.max(2) {
        return;
    }
    for mask in 1u32..(1u32 << n) {
        if (mask.count_ones() as usize) < min_len.max(2) {
            continue;
        }
        let subset: Vec<Card> = (0..n)
            .filter(|i| mask & (1 << i) != 0)
            .map(|i| cards[i])
            .collect();
        if classify_new_meld(&subset, &rules.meld).is_some() {
            out.push(subset.into_iter().collect());
        }
    }
}
