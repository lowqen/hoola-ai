"""hoola Python 바인딩 테스트."""

import json
import random

import pytest

import hoola


def test_new_game():
    g = hoola.Game(players=3, seed=5, first_player=1)
    assert g.num_players == 3
    assert g.current_player == 1
    assert g.phase == "turn_start"
    assert not g.is_over
    for s in range(3):
        assert len(g.hand(s)) == 7
    assert "draw" in g.legal_actions()
    assert g.outcome() is None
    assert "hoola.Game" in repr(g)


def test_bad_setup_raises():
    with pytest.raises(ValueError):
        hoola.Game(players=9)
    with pytest.raises(ValueError):
        hoola.Game(rules_toml="[stop]\nlimt = 1")
    g = hoola.Game()
    with pytest.raises(IndexError):
        g.hand(5)
    with pytest.raises(ValueError):
        g.apply("fly")
    with pytest.raises(ValueError):
        g.apply(f"discard {g.hand(0)[0]}")  # 받기 전 버리기는 불법


def test_observation_hides_others():
    g = hoola.Game(players=2, seed=1)
    o = g.observation(0)
    assert o["hand"] == g.hand(0)
    assert o["hand_counts"] == [7, 7]
    assert o["events"] == []
    assert o["revealed_hands"] is None
    assert set(o) >= {
        "seat", "phase", "melds", "discard_top", "known_discards",
        "visible_discards", "stock_len", "thank_you_target",
    }
    g.apply("draw")
    o1 = g.observation(1)
    assert o1["events"] == [{"seat": 0, "action": "draw"}]
    assert o1["hand"] == g.hand(1)


def test_random_play_to_end_and_replay():
    rng = random.Random(0)
    for seed in range(20):
        g = hoola.Game(players=2, seed=seed)
        while not g.is_over:
            g.apply(rng.choice(g.legal_actions()))
        out = g.outcome()
        assert abs(sum(out["rewards"]) - 1.0) < 1e-9
        doc = {
            "format": 1,
            "rules_toml": "",
            "num_players": 2,
            "seed": seed,
            "first_player": 0,
            "actions": g.actions(),
        }
        g2 = hoola.replay(json.dumps(doc))
        assert g2.outcome() == out


def test_bot_action_and_copy():
    g = hoola.Game(players=2, seed=3)
    a = g.bot_action("greedy")
    assert a in g.legal_actions()
    c = g.copy()
    c.apply(a)
    assert g.actions() == []
    assert c.actions() == [a]
    with pytest.raises(ValueError):
        g.bot_action("nobody")


def test_simulate():
    r = hoola.simulate(["greedy", "random"], players=2, deals=200, seed=0)
    assert r["games"] == 400
    assert r["bots"]["greedy"]["mean"] > 0.8
    assert abs(sum(r["seat_rates"]) - 1.0) < 1e-9
    assert sum(r["reasons"].values()) == r["games"]
    assert set(hoola.BOT_NAMES) >= {"random", "greedy"}
