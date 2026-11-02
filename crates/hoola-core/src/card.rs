//! 카드, 무늬, 카드 집합(비트셋)과 카드 점수.

use std::fmt;
use std::str::FromStr;

/// 무늬. 순서는 표시와 인덱싱용이며 규칙상 우열은 없다.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[repr(u8)]
pub enum Suit {
    Spades = 0,
    Hearts = 1,
    Diamonds = 2,
    Clubs = 3,
}

impl Suit {
    pub const ALL: [Suit; 4] = [Suit::Spades, Suit::Hearts, Suit::Diamonds, Suit::Clubs];

    pub const fn index(self) -> usize {
        self as usize
    }

    pub const fn letter(self) -> char {
        match self {
            Suit::Spades => 'S',
            Suit::Hearts => 'H',
            Suit::Diamonds => 'D',
            Suit::Clubs => 'C',
        }
    }

    fn from_char(c: char) -> Option<Suit> {
        match c {
            'S' | 's' | '♠' => Some(Suit::Spades),
            'H' | 'h' | '♥' => Some(Suit::Hearts),
            'D' | 'd' | '♦' => Some(Suit::Diamonds),
            'C' | 'c' | '♣' => Some(Suit::Clubs),
            _ => None,
        }
    }
}

/// 카드 한 장. 내부 인덱스는 `무늬 * 13 + (랭크 - 1)` (0..52).
///
/// 랭크: A=1, 2..=10, J=11, Q=12, K=13.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct Card(u8);

impl Card {
    pub const COUNT: usize = 52;

    pub fn new(suit: Suit, rank: u8) -> Card {
        assert!((1..=13).contains(&rank), "rank must be 1..=13, got {rank}");
        Card(suit as u8 * 13 + (rank - 1))
    }

    pub fn from_index(index: u8) -> Card {
        assert!(index < 52, "card index must be < 52, got {index}");
        Card(index)
    }

    pub const fn index(self) -> u8 {
        self.0
    }

    pub const fn suit(self) -> Suit {
        Suit::ALL[(self.0 / 13) as usize]
    }

    pub const fn rank(self) -> u8 {
        self.0 % 13 + 1
    }

    /// 52장 전체를 인덱스 순서로 돌려준다.
    pub fn all() -> impl Iterator<Item = Card> {
        (0..52u8).map(Card)
    }
}

const fn rank_str(rank: u8) -> &'static str {
    match rank {
        1 => "A",
        2 => "2",
        3 => "3",
        4 => "4",
        5 => "5",
        6 => "6",
        7 => "7",
        8 => "8",
        9 => "9",
        10 => "T",
        11 => "J",
        12 => "Q",
        _ => "K",
    }
}

impl fmt::Display for Card {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}{}", rank_str(self.rank()), self.suit().letter())
    }
}

/// 카드 문자열 파싱 오류.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParseCardError(String);

impl fmt::Display for ParseCardError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "invalid card: {:?}", self.0)
    }
}

impl std::error::Error for ParseCardError {}

impl FromStr for Card {
    type Err = ParseCardError;

    /// `"7D"`, `"TS"`, `"10S"`, `"AH"`, `"Q♣"` 같은 형식을 받는다.
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        let err = || ParseCardError(s.to_string());
        let trimmed = s.trim();
        let suit_char = trimmed.chars().last().ok_or_else(err)?;
        let suit = Suit::from_char(suit_char).ok_or_else(err)?;
        let rank_part = &trimmed[..trimmed.len() - suit_char.len_utf8()];
        let rank = match rank_part.to_ascii_uppercase().as_str() {
            "A" | "1" => 1,
            "T" | "10" => 10,
            "J" => 11,
            "Q" => 12,
            "K" => 13,
            other => match other.parse::<u8>() {
                Ok(n) if (2..=9).contains(&n) => n,
                _ => return Err(err()),
            },
        };
        Ok(Card::new(suit, rank))
    }
}

/// 공백으로 구분된 카드 목록을 파싱한다. 예: `"7D 8D 9D"`.
pub fn parse_cards(s: &str) -> Result<Vec<Card>, ParseCardError> {
    s.split_whitespace().map(str::parse).collect()
}

/// 카드 집합. 52비트 비트셋이라 복사·집합 연산이 매우 빠르다.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Default)]
pub struct CardSet(u64);

impl CardSet {
    pub const EMPTY: CardSet = CardSet(0);
    pub const FULL: CardSet = CardSet((1u64 << 52) - 1);

    pub const fn from_bits(bits: u64) -> CardSet {
        CardSet(bits & Self::FULL.0)
    }

    pub const fn bits(self) -> u64 {
        self.0
    }

    pub const fn contains(self, card: Card) -> bool {
        self.0 & (1u64 << card.0) != 0
    }

    /// 새로 추가되었으면 `true`.
    pub fn insert(&mut self, card: Card) -> bool {
        let added = !self.contains(card);
        self.0 |= 1u64 << card.0;
        added
    }

    /// 들어 있었으면 `true`.
    pub fn remove(&mut self, card: Card) -> bool {
        let removed = self.contains(card);
        self.0 &= !(1u64 << card.0);
        removed
    }

    pub const fn len(self) -> usize {
        self.0.count_ones() as usize
    }

    pub const fn is_empty(self) -> bool {
        self.0 == 0
    }

    pub const fn union(self, other: CardSet) -> CardSet {
        CardSet(self.0 | other.0)
    }

    pub const fn intersection(self, other: CardSet) -> CardSet {
        CardSet(self.0 & other.0)
    }

    pub const fn difference(self, other: CardSet) -> CardSet {
        CardSet(self.0 & !other.0)
    }

    pub const fn is_subset(self, other: CardSet) -> bool {
        self.0 & !other.0 == 0
    }

    pub fn iter(self) -> CardSetIter {
        CardSetIter(self.0)
    }

    /// 손패 점수 합.
    pub fn points(self, table: &PointTable) -> u32 {
        self.iter().map(|c| table.points(c)).sum()
    }
}

impl FromIterator<Card> for CardSet {
    fn from_iter<I: IntoIterator<Item = Card>>(iter: I) -> Self {
        let mut set = CardSet::EMPTY;
        for card in iter {
            set.insert(card);
        }
        set
    }
}

impl IntoIterator for CardSet {
    type Item = Card;
    type IntoIter = CardSetIter;

    fn into_iter(self) -> CardSetIter {
        self.iter()
    }
}

impl fmt::Display for CardSet {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let mut first = true;
        for card in self.iter() {
            if !first {
                f.write_str(" ")?;
            }
            write!(f, "{card}")?;
            first = false;
        }
        Ok(())
    }
}

/// [`CardSet`]을 인덱스 오름차순으로 순회한다.
#[derive(Debug, Clone)]
pub struct CardSetIter(u64);

impl Iterator for CardSetIter {
    type Item = Card;

    fn next(&mut self) -> Option<Card> {
        if self.0 == 0 {
            return None;
        }
        let index = self.0.trailing_zeros() as u8;
        self.0 &= self.0 - 1;
        Some(Card(index))
    }

    fn size_hint(&self) -> (usize, Option<usize>) {
        let n = self.0.count_ones() as usize;
        (n, Some(n))
    }
}

impl ExactSizeIterator for CardSetIter {}

/// 랭크별 카드 점수표 (`card_points` 설정).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PointTable {
    by_rank: [u8; 13],
}

impl PointTable {
    /// `by_rank[0]`이 A, `by_rank[12]`가 K의 점수.
    pub const fn new(by_rank: [u8; 13]) -> PointTable {
        PointTable { by_rank }
    }

    pub const fn points(&self, card: Card) -> u32 {
        self.by_rank[(card.rank() - 1) as usize] as u32
    }
}

impl Default for PointTable {
    /// `offline_casual`: A=1, 2..=10 숫자 그대로(7도 7점), J=11, Q=12, K=13.
    fn default() -> Self {
        PointTable::new([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13])
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn card(s: &str) -> Card {
        s.parse().unwrap()
    }

    #[test]
    fn index_round_trip_covers_all_52_cards() {
        let all: Vec<Card> = Card::all().collect();
        assert_eq!(all.len(), Card::COUNT);
        for (i, c) in all.iter().enumerate() {
            assert_eq!(c.index() as usize, i);
            assert_eq!(Card::new(c.suit(), c.rank()), *c);
        }
    }

    #[test]
    fn parse_and_display() {
        assert_eq!(card("7D"), Card::new(Suit::Diamonds, 7));
        assert_eq!(card("10S"), Card::new(Suit::Spades, 10));
        assert_eq!(card("ts"), Card::new(Suit::Spades, 10));
        assert_eq!(card("AH"), Card::new(Suit::Hearts, 1));
        assert_eq!(card("Q♣"), Card::new(Suit::Clubs, 12));
        assert_eq!(card("KC").to_string(), "KC");
        assert_eq!(card("10H").to_string(), "TH");
        for c in Card::all() {
            assert_eq!(card(&c.to_string()), c);
        }
    }

    #[test]
    fn parse_rejects_garbage() {
        for bad in ["", "X", "7", "0S", "11S", "ZZ", "7X", "1"] {
            assert!(bad.parse::<Card>().is_err(), "{bad:?} should fail");
        }
    }

    #[test]
    fn casual_points() {
        let table = PointTable::default();
        assert_eq!(table.points(card("AS")), 1);
        assert_eq!(table.points(card("7H")), 7);
        assert_eq!(table.points(card("TD")), 10);
        assert_eq!(table.points(card("JC")), 11);
        assert_eq!(table.points(card("QC")), 12);
        assert_eq!(table.points(card("KC")), 13);
        let hand: CardSet = parse_cards("AS 2H 7D KC").unwrap().into_iter().collect();
        assert_eq!(hand.points(&table), 1 + 2 + 7 + 13);
    }

    #[test]
    fn card_set_operations() {
        let mut set = CardSet::EMPTY;
        assert!(set.is_empty());
        assert!(set.insert(card("7D")));
        assert!(!set.insert(card("7D")));
        assert!(set.insert(card("AS")));
        assert_eq!(set.len(), 2);
        assert!(set.contains(card("AS")));
        assert!(set.remove(card("AS")));
        assert!(!set.remove(card("AS")));
        assert_eq!(set.len(), 1);

        assert_eq!(CardSet::FULL.len(), 52);
        assert_eq!(CardSet::FULL.iter().len(), 52);
        let collected: CardSet = Card::all().collect();
        assert_eq!(collected, CardSet::FULL);
        assert!(set.is_subset(CardSet::FULL));
        assert_eq!(CardSet::FULL.difference(set).len(), 51);
        assert_eq!(CardSet::FULL.intersection(set), set);
        assert_eq!(CardSet::from_bits(u64::MAX), CardSet::FULL);
    }

    #[test]
    fn card_set_iterates_in_index_order() {
        let set: CardSet = parse_cards("KC AS 7D").unwrap().into_iter().collect();
        assert_eq!(set.to_string(), "AS 7D KC");
    }
}
