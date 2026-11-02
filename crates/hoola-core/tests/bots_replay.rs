//! 행동 텍스트, 리플레이, 기준선 봇 테스트.

use hoola_core::{Action, Bot, Game, GreedyBot, RandomBot, Replay, ReplayError, Rules, play_out};

fn random_pair(seed: u64) -> (RandomBot, RandomBot) {
    (RandomBot::new(seed), RandomBot::new(seed ^ 0x5555))
}

#[test]
fn action_text_round_trips() {
    for seed in 0..30 {
        let mut g = Game::new(Rules::default(), 3, seed, 0).unwrap();
        let mut bots = [
            RandomBot::new(seed),
            RandomBot::new(seed + 1),
            RandomBot::new(seed + 2),
        ];
        while !g.is_over() {
            let legal = g.legal_actions();
            for a in &legal {
                let text = a.to_string();
                assert_eq!(text.parse::<Action>().unwrap(), *a, "{text}");
            }
            let seat = g.current_player();
            let a = bots[seat].act(&g.observation(seat), &legal);
            g.apply(a).unwrap();
        }
    }
}

#[test]
fn action_text_rejects_garbage() {
    for bad in [
        "",
        "fly",
        "draw now",
        "discard",
        "discard ZZ",
        "attach 8D",
        "attach 8D x",
        "register",
        "thankyou-attach",
    ] {
        assert!(bad.parse::<Action>().is_err(), "{bad:?} should fail");
    }
    assert_eq!(
        "attach 8D 2".parse::<Action>().unwrap(),
        Action::Attach {
            card: "8D".parse().unwrap(),
            meld: 2
        }
    );
}

#[test]
fn replay_round_trip_reproduces_game() {
    for seed in 0..20 {
        let mut g = Game::new(Rules::default(), 2, seed, 1).unwrap();
        let (mut a, mut b) = random_pair(seed);
        let outcome = play_out(&mut g, &mut [&mut a as &mut dyn Bot, &mut b]);

        let mut replay = Replay::new("", 2, seed, 1);
        replay.record(&g);
        let json = replay.to_json();
        let back = Replay::from_json(&json).unwrap();
        assert_eq!(back, replay);
        let g2 = back.replay().unwrap();
        assert_eq!(g2.outcome(), Some(&outcome));
        assert_eq!(g2.events(), g.events());
        for s in 0..2 {
            assert_eq!(g2.hand(s), g.hand(s));
        }
    }
}

#[test]
fn replay_with_house_rules() {
    let toml = "[stop]\nlimit = 3\n";
    let mut replay = Replay::new(toml, 2, 9, 0);
    let g = replay.start().unwrap();
    assert_eq!(g.rules().stop.limit, 3);
    replay.push(Action::Draw);
    assert!(replay.replay().is_ok());
}

#[test]
fn replay_rejects_bad_input() {
    let mut replay = Replay::new("", 2, 1, 0);
    replay.actions = vec!["draw".into(), "draw".into()];
    assert!(matches!(
        replay.replay(),
        Err(ReplayError::Action { index: 1, .. })
    ));
    replay.actions = vec!["nonsense".into()];
    assert!(matches!(
        replay.replay(),
        Err(ReplayError::Action { index: 0, .. })
    ));
    let bad_rules = Replay::new("[stop]\nlimt = 1", 2, 1, 0);
    assert!(matches!(bad_rules.start(), Err(ReplayError::Rules(_))));
    let mut wrong_format = Replay::new("", 2, 1, 0);
    wrong_format.format = 99;
    assert!(matches!(wrong_format.start(), Err(ReplayError::Format(99))));
    assert!(Replay::from_json("{}").is_err());
}

#[test]
fn bots_only_choose_legal_actions_and_are_deterministic() {
    for n in 2..=5 {
        for seed in 0..20 {
            let run = || {
                let mut g = Game::new(Rules::default(), n, seed, 0).unwrap();
                let mut greedy: Vec<GreedyBot> = (0..n).map(|_| GreedyBot).collect();
                let mut bots: Vec<&mut dyn Bot> =
                    greedy.iter_mut().map(|b| b as &mut dyn Bot).collect();
                play_out(&mut g, &mut bots)
            };
            assert_eq!(run(), run());
        }
    }
}

#[test]
fn greedy_beats_random_heads_up() {
    // 듀플리케이트: 같은 시드로 자리를 바꿔 두 번씩
    let games = 300;
    let mut greedy_score = 0.0;
    for seed in 0..games {
        for greedy_seat in 0..2 {
            let mut g = Game::new(Rules::default(), 2, seed, 0).unwrap();
            let mut greedy = GreedyBot;
            let mut random = RandomBot::new(seed);
            let outcome = if greedy_seat == 0 {
                play_out(&mut g, &mut [&mut greedy as &mut dyn Bot, &mut random])
            } else {
                play_out(&mut g, &mut [&mut random as &mut dyn Bot, &mut greedy])
            };
            greedy_score += outcome.rewards[greedy_seat];
        }
    }
    let rate = greedy_score / (2 * games) as f64;
    assert!(rate > 0.6, "greedy win rate vs random only {rate:.3}");
}
