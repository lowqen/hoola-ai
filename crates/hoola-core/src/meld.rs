//! 등록(멜드) 판정. RULES.md §5.

use crate::card::{Card, CardSet};

/// 런에서 A를 어떻게 다루는지 (`meld.run_ace_mode`).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AceMode {
    /// A는 1로만: A-2-3 가능, Q-K-A·K-A-2 불가. (`offline_casual` 기본값)
    Low,
    /// 양 끝 가능, 순환 불가: A-2-3, Q-K-A 가능, K-A-2 불가.
    HighLow,
    /// 순환: K-A-2도 가능.
    Wrap,
}

/// 등록 규칙 설정 (`[meld]` 섹션).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MeldRules {
    pub min_set: usize,
    pub min_run: usize,
    pub ace_mode: AceMode,
    pub single_seven: bool,
    /// 7 단독에 같은 무늬 6/8을 붙여 런으로 키울 수 있는지.
    pub seven_accepts_neighbors: bool,
    /// 7 단독에 다른 무늬 7을 붙여 세트로 키울 수 있는지.
    pub seven_accepts_sevens: bool,
}

impl Default for MeldRules {
    /// `offline_casual` 프리셋 값.
    fn default() -> Self {
        MeldRules {
            min_set: 3,
            min_run: 3,
            ace_mode: AceMode::Low,
            single_seven: true,
            seven_accepts_neighbors: true,
            seven_accepts_sevens: true,
        }
    }
}

/// 손패에서 새로 등록하는 조합의 종류.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MeldKind {
    /// 같은 랭크 3장 이상.
    Set,
    /// 같은 무늬 연속 3장 이상.
    Run,
    /// 7 한 장 단독.
    SingleSeven,
}

/// 손패에서 새로 등록하려는 카드 묶음이 유효한 조합이면 그 종류를 돌려준다.
pub fn classify_new_meld(cards: &[Card], rules: &MeldRules) -> Option<MeldKind> {
    let n = cards.len();
    if n == 0 {
        return None;
    }
    let distinct: CardSet = cards.iter().copied().collect();
    if distinct.len() != n {
        return None;
    }
    if n == 1 {
        return (rules.single_seven && cards[0].rank() == 7).then_some(MeldKind::SingleSeven);
    }
    let first = cards[0];
    if n >= rules.min_set && cards.iter().all(|c| c.rank() == first.rank()) {
        return Some(MeldKind::Set);
    }
    if n >= rules.min_run && cards.iter().all(|c| c.suit() == first.suit()) {
        let mask = rank_mask(cards);
        if ranks_form_run(mask, rules.ace_mode) {
            return Some(MeldKind::Run);
        }
    }
    None
}

/// 바닥에 놓인 등록패 하나. RULES.md §6.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct TableMeld {
    /// 처음 등록한 플레이어 좌석.
    pub owner: usize,
    /// 현재 성격. 7 단독은 첫 붙이기로 세트나 런이 된다.
    pub kind: MeldKind,
    pub cards: CardSet,
}

impl TableMeld {
    pub fn new(owner: usize, kind: MeldKind, cards: CardSet) -> TableMeld {
        TableMeld { owner, kind, cards }
    }

    /// `card`를 붙일 수 있으면 붙인 뒤의 성격을 돌려준다.
    pub fn attach_result(&self, card: Card, rules: &MeldRules) -> Option<MeldKind> {
        if self.cards.contains(card) {
            return None;
        }
        let first = self.cards.iter().next()?;
        match self.kind {
            MeldKind::Set => (card.rank() == first.rank() && self.cards.len() < 4)
                .then_some(MeldKind::Set),
            MeldKind::Run => {
                if card.suit() != first.suit() {
                    return None;
                }
                let mask = set_rank_mask(self.cards) | (1u16 << (card.rank() - 1));
                ranks_form_run(mask, rules.ace_mode).then_some(MeldKind::Run)
            }
            MeldKind::SingleSeven => {
                if card.rank() == 7 {
                    rules.seven_accepts_sevens.then_some(MeldKind::Set)
                } else if card.suit() == first.suit() && (card.rank() == 6 || card.rank() == 8) {
                    rules.seven_accepts_neighbors.then_some(MeldKind::Run)
                } else {
                    None
                }
            }
        }
    }

    pub fn can_attach(&self, card: Card, rules: &MeldRules) -> bool {
        self.attach_result(card, rules).is_some()
    }

    /// 붙이기를 적용한다. 불가능하면 `false`를 돌려주고 바뀌지 않는다.
    pub fn attach(&mut self, card: Card, rules: &MeldRules) -> bool {
        match self.attach_result(card, rules) {
            Some(kind) => {
                self.kind = kind;
                self.cards.insert(card);
                true
            }
            None => false,
        }
    }
}

fn set_rank_mask(cards: CardSet) -> u16 {
    cards.iter().fold(0u16, |m, c| m | (1u16 << (c.rank() - 1)))
}

/// 랭크 r을 비트 (r - 1)에 놓은 13비트 마스크.
pub(crate) fn rank_mask(cards: &[Card]) -> u16 {
    cards.iter().fold(0u16, |m, c| m | (1u16 << (c.rank() - 1)))
}

/// 랭크 마스크가 하나의 연속 구간(런)을 이루는지. 길이 조건은 따로 검사한다.
pub(crate) fn ranks_form_run(rank_mask: u16, ace_mode: AceMode) -> bool {
    let mask = u32::from(rank_mask) & 0x1FFF;
    if is_contiguous(mask) {
        return true;
    }
    match ace_mode {
        AceMode::Low => false,
        AceMode::HighLow => mask & 1 != 0 && is_contiguous((mask & !1) | (1 << 13)),
        AceMode::Wrap => (1..13).any(|shift| is_contiguous(rotate13(mask, shift))),
    }
}

fn is_contiguous(mask: u32) -> bool {
    if mask == 0 {
        return false;
    }
    let m = mask >> mask.trailing_zeros();
    m & (m + 1) == 0
}

fn rotate13(mask: u32, shift: u32) -> u32 {
    ((mask << shift) | (mask >> (13 - shift))) & 0x1FFF
}

#[cfg(test)]
mod tests {
    use crate::card::parse_cards;

    use super::*;

    fn classify(s: &str, rules: &MeldRules) -> Option<MeldKind> {
        classify_new_meld(&parse_cards(s).unwrap(), rules)
    }

    fn with_ace(ace_mode: AceMode) -> MeldRules {
        MeldRules {
            ace_mode,
            ..MeldRules::default()
        }
    }

    #[test]
    fn sets() {
        let r = MeldRules::default();
        assert_eq!(classify("5S 5H 5D", &r), Some(MeldKind::Set));
        assert_eq!(classify("5S 5H 5D 5C", &r), Some(MeldKind::Set));
        assert_eq!(classify("7S 7H 7D", &r), Some(MeldKind::Set));
        assert_eq!(classify("5S 5H", &r), None);
        assert_eq!(classify("5S 5H 6D", &r), None);
        assert_eq!(classify("5S 5S 5H", &r), None);
    }

    #[test]
    fn runs_basic() {
        let r = MeldRules::default();
        assert_eq!(classify("3H 4H 5H", &r), Some(MeldKind::Run));
        assert_eq!(classify("5H 3H 4H", &r), Some(MeldKind::Run));
        assert_eq!(classify("TS JS QS KS", &r), Some(MeldKind::Run));
        assert_eq!(classify("3H 4H", &r), None);
        assert_eq!(classify("3H 4H 6H", &r), None);
        assert_eq!(classify("3H 4H 5D", &r), None);
    }

    #[test]
    fn single_seven() {
        let r = MeldRules::default();
        assert_eq!(classify("7D", &r), Some(MeldKind::SingleSeven));
        assert_eq!(classify("8D", &r), None);
        let no_seven = MeldRules {
            single_seven: false,
            ..MeldRules::default()
        };
        assert_eq!(classify("7D", &no_seven), None);
        assert_eq!(classify("", &r), None);
    }

    #[test]
    fn ace_low_only() {
        let r = with_ace(AceMode::Low);
        assert_eq!(classify("AS 2S 3S", &r), Some(MeldKind::Run));
        assert_eq!(classify("QS KS AS", &r), None);
        assert_eq!(classify("KS AS 2S", &r), None);
    }

    #[test]
    fn ace_high_low() {
        let r = with_ace(AceMode::HighLow);
        assert_eq!(classify("AS 2S 3S", &r), Some(MeldKind::Run));
        assert_eq!(classify("QS KS AS", &r), Some(MeldKind::Run));
        assert_eq!(classify("JS QS KS AS", &r), Some(MeldKind::Run));
        assert_eq!(classify("KS AS 2S", &r), None);
    }

    #[test]
    fn ace_wrap() {
        let r = with_ace(AceMode::Wrap);
        assert_eq!(classify("AS 2S 3S", &r), Some(MeldKind::Run));
        assert_eq!(classify("QS KS AS", &r), Some(MeldKind::Run));
        assert_eq!(classify("KS AS 2S", &r), Some(MeldKind::Run));
        assert_eq!(classify("QS KS AS 2S 3S", &r), Some(MeldKind::Run));
        assert_eq!(classify("KS AS 3S", &r), None);
    }

    fn meld(kind: MeldKind, s: &str) -> TableMeld {
        TableMeld::new(0, kind, parse_cards(s).unwrap().into_iter().collect())
    }

    fn c(s: &str) -> Card {
        s.parse().unwrap()
    }

    #[test]
    fn attach_to_set() {
        let r = MeldRules::default();
        let mut m = meld(MeldKind::Set, "5S 5H 5D");
        assert!(!m.can_attach(c("6S"), &r));
        assert!(!m.can_attach(c("5S"), &r));
        assert!(m.attach(c("5C"), &r));
        assert_eq!(m.cards.len(), 4);
    }

    #[test]
    fn attach_to_run_ends_only() {
        let r = MeldRules::default();
        let mut m = meld(MeldKind::Run, "4H 5H 6H");
        assert!(m.can_attach(c("3H"), &r));
        assert!(m.can_attach(c("7H"), &r));
        assert!(!m.can_attach(c("8H"), &r));
        assert!(!m.can_attach(c("7S"), &r));
        assert!(!m.can_attach(c("5H"), &r));
        assert!(m.attach(c("7H"), &r));
        assert!(m.can_attach(c("8H"), &r));
    }

    #[test]
    fn attach_run_ace_low_only() {
        let r = MeldRules::default();
        let low = meld(MeldKind::Run, "2S 3S 4S");
        assert!(low.can_attach(c("AS"), &r));
        let high = meld(MeldKind::Run, "JS QS KS");
        assert!(!high.can_attach(c("AS"), &r));
        assert!(high.can_attach(c("AS"), &with_ace(AceMode::HighLow)));
    }

    #[test]
    fn single_seven_becomes_run_or_set() {
        let r = MeldRules::default();
        // 런으로 확정
        let mut m = meld(MeldKind::SingleSeven, "7D");
        assert!(!m.can_attach(c("6S"), &r));
        assert!(!m.can_attach(c("9D"), &r));
        assert!(m.attach(c("8D"), &r));
        assert_eq!(m.kind, MeldKind::Run);
        assert!(!m.can_attach(c("7S"), &r));
        assert!(m.can_attach(c("6D"), &r));
        assert!(m.can_attach(c("9D"), &r));
        // 세트로 확정 (E8)
        let mut m = meld(MeldKind::SingleSeven, "7D");
        assert!(m.attach(c("7S"), &r));
        assert_eq!(m.kind, MeldKind::Set);
        assert!(!m.can_attach(c("6D"), &r));
        assert!(m.can_attach(c("7H"), &r));
    }

    #[test]
    fn single_seven_attach_switches() {
        let r = MeldRules {
            seven_accepts_neighbors: false,
            seven_accepts_sevens: false,
            ..MeldRules::default()
        };
        let m = meld(MeldKind::SingleSeven, "7D");
        assert!(!m.can_attach(c("8D"), &r));
        assert!(!m.can_attach(c("7S"), &r));
    }

    #[test]
    fn full_suit_is_a_run_in_every_mode() {
        let suit = "AH 2H 3H 4H 5H 6H 7H 8H 9H TH JH QH KH";
        for mode in [AceMode::Low, AceMode::HighLow, AceMode::Wrap] {
            assert_eq!(classify(suit, &with_ace(mode)), Some(MeldKind::Run));
        }
    }
}
