//! 관측(정보집합) API와 더미 소진 설정 테스트.

use hoola_core::game::Event;
use hoola_core::{
    Action, Card, CardSet, DiscardVisibility, EndReason, Game, Rng, Rules, StockEmpty, parse_cards,
};

fn c(s: &str) -> Card {
    s.parse().unwrap()
}

fn cs(s: &str) -> CardSet {
    parse_cards(s).unwrap().into_iter().collect()
}

fn game(rules: Rules, hands: &[&str], stock_top: &[&str], seed: u64) -> Game {
    let hands: Vec<CardSet> = hands.iter().map(|h| cs(h)).collect();
    let top: Vec<Card> = stock_top.iter().map(|s| c(s)).collect();
    Game::with_hands(rules, &hands, Some(c("2D")), &top, 0, seed)
}

fn discard(card: &str) -> Action {
    Action::Discard { card: c(card) }
}

#[test]
fn observation_shows_only_own_hand() {
    let g = Game::new(Rules::default(), 3, 11, 0).unwrap();
    let o = g.observation(1);
    assert_eq!(o.seat, 1);
    assert_eq!(o.hand, g.hand(1));
    assert_eq!(o.hand_counts, vec![7, 7, 7]);
    assert_eq!(o.registered, vec![false; 3]);
    assert_eq!(o.stock_len, Some(52 - 21 - 1));
    assert!(!o.is_my_turn());
    assert!(g.observation(0).is_my_turn());

    let unseen = o.unseen();
    assert!(unseen.intersection(g.hand(1)).is_empty());
    assert!(g.hand(0).is_subset(unseen));
    assert!(g.hand(2).is_subset(unseen));
    assert_eq!(unseen.len(), 14 + g.stock_len());
    assert!(o.revealed_hands.is_none());
}

#[test]
fn hidden_information_does_not_leak() {
    // 0번 손패와 공개 진행은 같고, 1번 손패와 더미 순서만 다른 두 판
    let a0 = game(Rules::default(), &["3H 4H 9S", "KS KH QD"], &["KD"], 1);
    let b0 = game(Rules::default(), &["3H 4H 9S", "JC QC 8C"], &["KD"], 2);
    assert_eq!(a0.observation(0), b0.observation(0));

    let mut a = a0.clone();
    let mut b = b0.clone();
    for g in [&mut a, &mut b] {
        g.apply(Action::Draw).unwrap();
        g.apply(discard("KD")).unwrap();
    }
    assert_eq!(a.observation(0), b.observation(0));
    assert_ne!(a.observation(1), b.observation(1));
}

#[test]
fn events_hide_drawn_cards() {
    let mut g = game(Rules::default(), &["3H 4H 9S", "KS KH QD"], &["KD"], 1);
    g.apply(Action::Draw).unwrap();
    g.apply(discard("9S")).unwrap();
    assert_eq!(
        g.events(),
        &[
            Event::Action {
                seat: 0,
                action: Action::Draw
            },
            Event::Action {
                seat: 0,
                action: discard("9S")
            },
        ]
    );
}

#[test]
fn discard_visibility() {
    let mut g = game(Rules::default(), &["3H 4H 9S", "KS KH QD"], &["KD"], 1);
    g.apply(Action::Draw).unwrap();
    g.apply(discard("9S")).unwrap();
    let o = g.observation(1);
    assert_eq!(o.known_discards, &[c("2D"), c("9S")]);
    assert_eq!(o.visible_discards, &[c("9S")]);
    assert_eq!(o.thank_you_target, Some(c("9S")));

    let rules = Rules {
        discard_visibility: DiscardVisibility::Full,
        stock_count_visible: false,
        ..Rules::default()
    };
    let mut g = game(rules, &["3H 4H 9S", "KS KH QD"], &["KD"], 1);
    g.apply(Action::Draw).unwrap();
    g.apply(discard("9S")).unwrap();
    let o = g.observation(1);
    assert_eq!(o.visible_discards, &[c("2D"), c("9S")]);
    assert_eq!(o.stock_len, None);
}

#[test]
fn hands_revealed_when_over() {
    let mut g = game(Rules::default(), &["AS 2S", "KS"], &[], 1);
    g.apply(Action::Stop).unwrap();
    let o = g.observation(1);
    assert_eq!(o.revealed_hands, Some(vec![cs("AS 2S"), cs("KS")]));
    assert!(o.outcome.is_some());
}

#[test]
fn unseen_matches_truth_through_random_games() {
    for seed in 0..30 {
        let mut g = Game::new(Rules::default(), 3, seed, 0).unwrap();
        let mut rng = Rng::seed_from_u64(seed);
        while !g.is_over() {
            for seat in 0..3 {
                let o = g.observation(seat);
                let others: CardSet = (0..3)
                    .filter(|&s| s != seat)
                    .map(|s| g.hand(s))
                    .fold(CardSet::EMPTY, CardSet::union);
                assert!(others.is_subset(o.unseen()));
                assert_eq!(o.unseen().len(), others.len() + g.stock_len());
            }
            let legal = g.legal_actions();
            let a = legal[rng.below(legal.len() as u64) as usize];
            g.apply(a).unwrap();
        }
    }
}

// ---- 더미 소진 설정 (§9) ----

/// 맨 위부터 나열한 덱. 2인 손패 2장: 0번 AS 2H, 1번 KS KH, 공개패 3C, 더미 9S.
fn tiny_game(stock_empty: StockEmpty) -> Game {
    let mut deck = parse_cards("AS KS 2H KH 3C 9S").unwrap();
    deck.reverse();
    let rules = Rules {
        hand_size: 2,
        stock_empty,
        ..Rules::default()
    };
    Game::from_deck(rules, 2, deck, 0, Rng::seed_from_u64(1))
}

/// 0번이 9S를 받아 버린 뒤 1번이 받으려는 시점.
fn exhaust(g: &mut Game) {
    g.apply(Action::Draw).unwrap();
    g.apply(discard("9S")).unwrap();
    assert_eq!(g.stock_len(), 0);
    g.apply(Action::Draw).unwrap();
}

#[test]
fn stock_empty_lowest_wins() {
    let mut g = tiny_game(StockEmpty::LowestWins);
    exhaust(&mut g);
    let o = g.outcome().unwrap();
    assert_eq!(o.reason, EndReason::NoCards);
    assert_eq!(o.winners, vec![0]);
}

#[test]
fn stock_empty_draw() {
    let mut g = tiny_game(StockEmpty::Draw);
    exhaust(&mut g);
    let o = g.outcome().unwrap();
    assert!(o.winners.is_empty());
    assert_eq!(o.rewards, vec![0.5, 0.5]);
}

#[test]
fn reshuffle_without_keeping_top() {
    let mut g = tiny_game(StockEmpty::Reshuffle {
        keep_top: false,
        limit: 0,
    });
    exhaust(&mut g);
    assert!(!g.is_over());
    assert!(g.discard_pile().is_empty());
    assert_eq!(g.stock_len(), 1);
    assert_eq!(g.events().last(), Some(&Event::Reshuffle { stock: 2 }));
}

#[test]
fn reshuffle_limit_then_lowest_wins() {
    let mut g = tiny_game(StockEmpty::Reshuffle {
        keep_top: true,
        limit: 1,
    });
    exhaust(&mut g);
    assert_eq!(g.reshuffles(), 1);
    // 1번이 3C를 받았다. 버리고 0번이 받으려 하면 더미가 비었고 재섞기 한도도 끝
    g.apply(discard("3C")).unwrap();
    g.apply(Action::Draw).unwrap();
    let o = g.outcome().unwrap();
    assert_eq!(o.reason, EndReason::NoCards);
}
