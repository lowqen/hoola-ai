//! RULES.md v1.0 명세 테스트 (§8.2 판정표, §12 엣지 케이스 E1–E11, 무작위 대전 불변식).

use hoola_core::{
    Action, Card, CardSet, EndReason, Game, Phase, Rng, Rules, ThankYouRules, parse_cards,
};

fn c(s: &str) -> Card {
    s.parse().unwrap()
}

fn cs(s: &str) -> CardSet {
    parse_cards(s).unwrap().into_iter().collect()
}

fn hands(list: &[&str]) -> Vec<CardSet> {
    list.iter().map(|h| cs(h)).collect()
}

/// 손패 지정 판. 선은 0번.
fn game(list: &[&str], upcard: Option<&str>, stock_top: &[&str]) -> Game {
    game_with(Rules::default(), list, upcard, stock_top)
}

fn game_with(rules: Rules, list: &[&str], upcard: Option<&str>, stock_top: &[&str]) -> Game {
    let top: Vec<Card> = stock_top.iter().map(|s| c(s)).collect();
    Game::with_hands(rules, &hands(list), upcard.map(c), &top, 0, 7)
}

fn play(g: &mut Game, a: Action) {
    g.apply(a).unwrap_or_else(|e| panic!("{e}"));
}

fn register(g: &mut Game, s: &str) {
    play(g, Action::Register { cards: cs(s) });
}

fn discard(g: &mut Game, s: &str) {
    play(g, Action::Discard { card: c(s) });
}

fn total_cards(g: &Game) -> usize {
    let hands: usize = (0..g.num_players()).map(|s| g.hand(s).len()).sum();
    let melds: usize = g.melds().iter().map(|m| m.cards.len()).sum();
    hands + melds + g.stock_len() + g.discard_pile().len()
}

// ---- 준비 (§3) ----

#[test]
fn deal_is_seeded_and_complete() {
    for n in 2..=5 {
        let g = Game::new(Rules::default(), n, 99, 0).unwrap();
        for s in 0..n {
            assert_eq!(g.hand(s).len(), 7);
        }
        assert_eq!(g.discard_pile().len(), 1);
        assert_eq!(g.stock_len(), 52 - 7 * n - 1);
        assert_eq!(total_cards(&g), 52);
        assert_eq!(g.phase(), Phase::TurnStart);
        assert_eq!(g.turn(), 1);
    }
    let a = Game::new(Rules::default(), 3, 5, 1).unwrap();
    let b = Game::new(Rules::default(), 3, 5, 1).unwrap();
    let d = Game::new(Rules::default(), 3, 6, 1).unwrap();
    assert_eq!(a.hand(0), b.hand(0));
    assert_ne!(a.hand(0), d.hand(0));
    assert_eq!(a.current_player(), 1);
}

#[test]
fn invalid_setups_are_rejected() {
    assert!(Game::new(Rules::default(), 1, 0, 0).is_err());
    assert!(Game::new(Rules::default(), 6, 0, 0).is_err());
    assert!(Game::new(Rules::default(), 2, 0, 2).is_err());
}

// ---- 털기 (§10, E1–E3) ----

#[test]
fn e1_meld_everything_after_draw_wins_without_discard() {
    let mut g = game(&["3H 4H 5H 9S 9D 9C 7C", "KS KH QD"], Some("2D"), &["7D"]);
    play(&mut g, Action::Draw);
    register(&mut g, "3H 4H 5H");
    register(&mut g, "9S 9D 9C");
    register(&mut g, "7C");
    assert!(!g.is_over());
    register(&mut g, "7D");
    assert!(g.is_over());
    let o = g.outcome().unwrap();
    assert_eq!(o.reason, EndReason::Out { player: 0 });
    assert_eq!(o.rewards, vec![1.0, 0.0]);
}

#[test]
fn e2_discarding_last_card_wins() {
    let mut g = game(&["3H 4H 5H 9S 9D 9C", "KS KH QD"], Some("2D"), &["KD"]);
    play(&mut g, Action::Draw);
    register(&mut g, "3H 4H 5H");
    register(&mut g, "9S 9D 9C");
    discard(&mut g, "KD");
    assert_eq!(g.outcome().unwrap().reason, EndReason::Out { player: 0 });
}

#[test]
fn e3_thank_you_then_out() {
    let mut g = game(&["4H JS KC", "5H 6H"], Some("2D"), &["QS"]);
    play(&mut g, Action::Draw);
    discard(&mut g, "4H");
    assert_eq!(g.current_player(), 1);
    let ty = Action::ThankYou { meld: cs("4H 5H 6H") };
    assert!(g.legal_actions().contains(&ty));
    play(&mut g, ty);
    assert_eq!(g.outcome().unwrap().reason, EndReason::Out { player: 1 });
}

// ---- 스톱 (§8, E4–E6) ----

fn stop_result(points: &[&str]) -> (bool, Vec<usize>, Vec<f64>) {
    let mut g = game(points, Some("2D"), &[]);
    play(&mut g, Action::Stop);
    let o = g.outcome().unwrap().clone();
    match o.reason {
        EndReason::Stop { caller: 0, success } => (success, o.winners, o.rewards),
        other => panic!("unexpected {other:?}"),
    }
}

#[test]
fn stop_judgement_table() {
    // RULES.md §8.2 예시 (3인, 0번이 선언자)
    assert_eq!(stop_result(&["4S", "6S", "9S"]).1, vec![0]);
    assert_eq!(stop_result(&["5S", "5H", "9S"]).1, vec![1]);
    assert_eq!(stop_result(&["8S", "5S", "7S"]).1, vec![1]);
    let (ok, winners, rewards) = stop_result(&["8S", "5S", "5H"]);
    assert!(!ok);
    assert_eq!(winners, vec![1, 2]);
    assert_eq!(rewards, vec![0.0, 0.5, 0.5]);
    assert_eq!(stop_result(&["5S", "5H", "5D"]).1, vec![1, 2]);
    assert!(stop_result(&["4S", "6S", "9S"]).0);
}

#[test]
fn e4_stop_allowed_unregistered_up_to_limit() {
    let g = game(&["AS 2S 3D 4C", "KS"], Some("2D"), &[]);
    assert_eq!(g.hand_points(0), 10);
    assert!(!g.player(0).registered);
    assert!(g.legal_actions().contains(&Action::Stop));
    let g = game(&["AS 2S 3D 5C", "KS"], Some("2D"), &[]);
    assert!(!g.legal_actions().contains(&Action::Stop));
}

#[test]
fn stop_only_before_acquire() {
    let mut g = game(&["AS 2S", "KS"], Some("2D"), &["3C"]);
    play(&mut g, Action::Draw);
    assert!(!g.legal_actions().contains(&Action::Stop));
}

#[test]
fn stop_rule_switches() {
    let mut rules = Rules::default();
    rules.stop.requires_registration = true;
    let g = game_with(rules, &["AS 2S", "KS"], Some("2D"), &[]);
    assert!(!g.legal_actions().contains(&Action::Stop));

    let mut rules = Rules::default();
    rules.stop.first_turn_allowed = false;
    let g = game_with(rules, &["AS 2S", "KS"], Some("2D"), &[]);
    assert!(!g.legal_actions().contains(&Action::Stop));
}

#[test]
fn e5_e6_tie_with_caller_loses() {
    let (ok, winners, _) = stop_result(&["6S", "6H"]);
    assert!(!ok);
    assert_eq!(winners, vec![1]);
}

// ---- 등록 (§5, E7) ----

#[test]
fn e7_queen_king_ace_is_not_a_run() {
    let mut g = game(&["QS KS AS 2D 3D", "KH"], Some("2C"), &["4D"]);
    play(&mut g, Action::Draw);
    let legal = g.legal_actions();
    assert!(!legal.contains(&Action::Register { cards: cs("QS KS AS") }));
    assert!(legal.contains(&Action::Register { cards: cs("2D 3D 4D") }));
}

#[test]
fn register_lists_every_valid_subset() {
    let mut g = game(&["5S 5H 5D 5C 6S 7S", "KH"], Some("2C"), &["KD"]);
    play(&mut g, Action::Draw);
    let regs: Vec<CardSet> = g
        .legal_actions()
        .into_iter()
        .filter_map(|a| match a {
            Action::Register { cards } => Some(cards),
            _ => None,
        })
        .collect();
    // 5 세트: 4C3 + 4C4 = 5, 런 5S6S7S = 1, 7S 단독 = 1
    assert_eq!(regs.len(), 7);
    assert!(regs.contains(&cs("5S 6S 7S")));
    assert!(regs.contains(&cs("7S")));
    assert!(regs.contains(&cs("5S 5H 5D 5C")));
}

// ---- 붙이기 (§6, E8) ----

#[test]
fn attach_requires_registration() {
    // 1번이 7D 단독을 등록해 둔 상태에서 0번이 붙이기를 시도
    let mut g = game(&["8D 2H 3H 4H JS", "7D QC KC"], Some("2C"), &["TS", "JC", "9S"]);
    play(&mut g, Action::Draw);
    discard(&mut g, "TS");
    play(&mut g, Action::Draw);
    register(&mut g, "7D");
    discard(&mut g, "JC");
    play(&mut g, Action::Draw);
    let attach = Action::Attach { card: c("8D"), meld: 0 };
    assert!(!g.legal_actions().contains(&attach));
    register(&mut g, "2H 3H 4H");
    assert!(g.legal_actions().contains(&attach));
    play(&mut g, attach);
    assert_eq!(g.melds()[0].cards, cs("7D 8D"));
    assert_eq!(g.melds()[0].owner, 1);
}

#[test]
fn e8_seven_fixed_as_set_rejects_neighbors() {
    let mut g = game(&["7S 6D 2H 3H 4H", "7D QC KC"], Some("2C"), &["TS", "JC", "9S"]);
    play(&mut g, Action::Draw);
    discard(&mut g, "TS");
    play(&mut g, Action::Draw);
    register(&mut g, "7D");
    discard(&mut g, "JC");
    play(&mut g, Action::Draw);
    register(&mut g, "2H 3H 4H");
    play(&mut g, Action::Attach { card: c("7S"), meld: 0 });
    let six = Action::Attach { card: c("6D"), meld: 0 };
    assert!(!g.legal_actions().contains(&six));
}

// ---- 땡큐 (§7, E10) ----

#[test]
fn thank_you_needs_two_hand_cards() {
    let g = game(&["5H 9C", "KS"], Some("4H"), &[]);
    assert!(
        !g.legal_actions()
            .iter()
            .any(|a| matches!(a, Action::ThankYou { .. }))
    );
    let g = game(&["5H 6H 9C", "KS"], Some("4H"), &[]);
    assert!(
        g.legal_actions()
            .contains(&Action::ThankYou { meld: cs("4H 5H 6H") })
    );
}

#[test]
fn thank_you_on_initial_upcard_switch() {
    let mut rules = Rules::default();
    rules.thank_you.on_initial_upcard = false;
    let g = game_with(rules, &["5H 6H 9C", "KS"], Some("4H"), &[]);
    assert!(
        !g.legal_actions()
            .iter()
            .any(|a| matches!(a, Action::ThankYou { .. }))
    );
}

#[test]
fn e10_single_seven_thank_you_forbidden_by_default() {
    let single = Action::ThankYou { meld: cs("7D") };
    let g = game(&["9C KS", "KH"], Some("7D"), &[]);
    assert!(!g.legal_actions().contains(&single));
    let rules = Rules {
        thank_you: ThankYouRules {
            allow_single_seven: true,
            ..ThankYouRules::default()
        },
        ..Rules::default()
    };
    let g = game_with(rules, &["9C KS", "KH"], Some("7D"), &[]);
    assert!(g.legal_actions().contains(&single));
}

#[test]
fn thank_you_marks_registered_and_takes_top() {
    let mut g = game(&["5H 6H 9C JD", "KS"], Some("4H"), &[]);
    play(&mut g, Action::ThankYou { meld: cs("4H 5H 6H") });
    assert!(g.player(0).registered);
    assert_eq!(g.hand(0), cs("9C JD"));
    assert!(g.discard_pile().is_empty());
    assert_eq!(g.phase(), Phase::MeldPhase);
    assert_eq!(total_cards(&g), 52);
}

// ---- 더미 소진 (§9, E9) ----

/// 맨 위부터 나열한 카드로 덱을 만든다 (`from_deck`은 끝에서부터 뽑는다).
fn deck_top_first(cards: &str) -> Vec<Card> {
    let mut v = parse_cards(cards).unwrap();
    v.reverse();
    v
}

fn small_rules(hand_size: usize) -> Rules {
    Rules {
        hand_size,
        ..Rules::default()
    }
}

#[test]
fn e9_empty_stock_thank_you_or_no_cards() {
    // 2인, 손패 3장: 0번 5H 6H KC, 1번 QS QD JC, 공개패 4H, 더미 0장
    let deck = deck_top_first("5H QS 6H QD KC JC 4H");
    let g = Game::from_deck(small_rules(3), 2, deck, 0, Rng::seed_from_u64(1));
    assert_eq!(g.hand(0), cs("5H 6H KC"));
    assert_eq!(g.stock_len(), 0);
    let legal = g.legal_actions();
    assert!(legal.contains(&Action::ThankYou { meld: cs("4H 5H 6H") }));

    // 땡큐하지 않고 받으려 하지만 섞을 버림패도 없음 → 최저 점수 승리 (0번 24점 vs 1번 35점)
    let mut g2 = g.clone();
    play(&mut g2, Action::Draw);
    let o = g2.outcome().unwrap();
    assert_eq!(o.reason, EndReason::NoCards);
    assert_eq!(o.winners, vec![0]);
}

#[test]
fn reshuffle_keeps_top_discard() {
    // 2인, 손패 2장. 더미 1장(9S)
    let deck = deck_top_first("AS KS 2H KH 3C 9S");
    let mut g = Game::from_deck(small_rules(2), 2, deck, 0, Rng::seed_from_u64(1));
    assert_eq!(g.stock_len(), 1);
    play(&mut g, Action::Draw);
    discard(&mut g, "9S");
    assert_eq!(g.stock_len(), 0);
    assert_eq!(g.discard_pile(), &[c("3C"), c("9S")]);
    play(&mut g, Action::Draw);
    assert_eq!(g.reshuffles(), 1);
    assert_eq!(g.discard_pile(), &[c("9S")]);
    assert!(g.hand(1).contains(c("3C")));
    assert_eq!(total_cards(&g), 6);
}

// ---- 종료 후 (E11) ----

#[test]
fn e11_game_over_rejects_further_actions() {
    let mut g = game(&["3H 4H 5H", "KS"], Some("2D"), &["QD"]);
    play(&mut g, Action::Draw);
    register(&mut g, "3H 4H 5H");
    discard(&mut g, "QD");
    assert!(g.is_over());
    assert!(g.legal_actions().is_empty());
    assert!(g.apply(Action::Stop).is_err());
    assert!(g.apply(Action::Draw).is_err());
}

#[test]
fn illegal_action_leaves_state_unchanged() {
    let mut g = game(&["3H 4H 5H JS", "KS"], Some("2D"), &["QD"]);
    let before = g.hand(0);
    assert!(g.apply(Action::Discard { card: c("JS") }).is_err());
    assert!(g.apply(Action::Stop).is_err());
    assert_eq!(g.hand(0), before);
    assert_eq!(g.phase(), Phase::TurnStart);
}

// ---- 무작위 대전 (L0) 불변식 ----

fn random_game(n: usize, seed: u64) -> (Game, Vec<Action>) {
    let mut g = Game::new(Rules::default(), n, seed, (seed % n as u64) as usize).unwrap();
    let mut rng = Rng::seed_from_u64(seed ^ 0xABCD);
    let mut log = Vec::new();
    while !g.is_over() {
        let legal = g.legal_actions();
        assert!(!legal.is_empty());
        let a = legal[rng.below(legal.len() as u64) as usize];
        g.apply(a).unwrap();
        log.push(a);
        assert_eq!(total_cards(&g), 52);
    }
    (g, log)
}

#[test]
fn random_games_terminate_with_valid_outcomes() {
    for n in 2..=5 {
        for seed in 0..100 {
            let (g, _) = random_game(n, seed);
            let o = g.outcome().unwrap();
            let sum: f64 = o.rewards.iter().sum();
            assert!((sum - 1.0).abs() < 1e-9, "rewards {:?}", o.rewards);
            assert_eq!(o.rewards.len(), n);
            if let EndReason::Out { player } = o.reason {
                assert!(g.hand(player).is_empty());
            }
        }
    }
}

#[test]
fn random_games_are_reproducible() {
    for seed in 0..20 {
        let (a, la) = random_game(3, seed);
        let (b, lb) = random_game(3, seed);
        assert_eq!(la, lb);
        assert_eq!(a.outcome(), b.outcome());
    }
}
