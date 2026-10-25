import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from winter_challenge.scoring import game_handicap, hole_counts  # noqa: E402
from winter_challenge.season import (  # noqa: E402
    STATUS_INCOMPLETE,
    STATUS_OVER_QUOTA,
    STATUS_RETAINED,
    build_season,
    counted_and_replaced,
)

PARS = [4] * 18
INDEX = list(range(1, 19))
_next_id = [1000]


def card(player, round_scores, front=True):
    """Scorecard SGT minimal : round_scores = 9 scores (Front) ou (Back)."""
    _next_id[0] += 1
    holes = [0] * 18
    start = 0 if front else 9
    holes[start:start + len(round_scores)] = round_scores
    out = {"tournamentScorecardId": _next_id[0], "round": 1, "player_name": player, "courseName": "Test GC", "teetype": "White"}
    for i in range(18):
        out[f"hole{i + 1}_gross"] = holes[i]
        out[f"h{i + 1}_Par"] = PARS[i]
        out[f"h{i + 1}_index"] = INDEX[i]
    return out


def tournament(tid, day, cards, status="Completed"):
    return {"tournamentId": tid, "name": f"Jour {tid}", "courseName": "Test GC", "status": status,
            "start_date": f"2026-11-{day:02d} 00:00:00", "end_date": f"2026-11-{day:02d} 00:00:00", "scorecards": cards}


def tour(tournaments, members=("Ana", "Bob"), label="Test"):
    return [{"tour_id": 1, "label": label, "name": "Tour", "admin": "Admin",
             "members": [{"user_name": "Admin", "hcp_index": 0, "custom_hcp": None}]
             + [{"user_name": m, "hcp_index": 20, "custom_hcp": 0.0 + 10} for m in members],
             "tournaments": tournaments}]


class SeasonTest(unittest.TestCase):
    def test_handicap_de_depart_et_admin_exclu(self):
        s = build_season(tour([tournament(1, 1, [])]))
        self.assertEqual({p.name for p in s.players}, {"Ana", "Bob"})
        self.assertEqual(s.players[0].start_hcp, 5)  # 10 / 2
        self.assertEqual(game_handicap(17.3), 9)
        self.assertEqual(game_handicap(0.7), 0)
        self.assertEqual(game_handicap(0), -1)
        self.assertEqual(game_handicap(-2), -3)

    def test_meilleure_tentative_et_egalite_recente(self):
        cards = [card("Ana", [5] * 9), card("Ana", [4] * 9), card("Ana", [4] * 9), card("Bob", [6] * 9)]
        s = build_season(tour([tournament(1, 1, cards)]))
        ana = [a for a in s.attempts if a.player == "Ana"]
        self.assertEqual([a.status for a in ana], ["Non retenu", "Non retenu", STATUS_RETAINED])  # égalité : la dernière
        self.assertEqual(s.best[("Test", "Ana", 1)].number, 3)

    def test_quota_de_tentatives_et_tour_incomplet(self):
        cards = [card("Ana", [5] * 9), card("Ana", [3] * 9), card("Ana", [4] * 5)]
        s = build_season(tour([tournament(1, 1, cards)]), max_attempts=2)
        by_n = {a.number: a.status for a in s.attempts}
        self.assertEqual(by_n[3], STATUS_INCOMPLETE)  # 5 trous : ni 9 ni 18
        self.assertEqual(by_n[2], STATUS_RETAINED)
        s2 = build_season(tour([tournament(1, 1, [card("Ana", [5] * 9), card("Ana", [5] * 9), card("Ana", [3] * 9)])]),
                          max_attempts=2)
        self.assertEqual({a.number: a.status for a in s2.attempts}[3], STATUS_OVER_QUOTA)
        self.assertNotEqual(s2.best[("Test", "Ana", 1)].number, 3)

    def test_le_handicap_ne_change_qu_en_fin_de_semaine_puis_se_reporte(self):
        t1 = tournament(1, 1, [card("Ana", [4] * 9), card("Ana", [3] * 9)])  # points nets > 100 à la 2e tentative
        t2 = tournament(2, 8, [card("Ana", [4] * 9)])
        s = build_season(tour([t1, t2]))
        first, second = [a for a in s.attempts if a.week == 1]
        self.assertEqual(first.result.hcp_before, second.result.hcp_before)  # pas de recalcul entre deux tentatives
        week2 = [a for a in s.attempts if a.week == 2][0]
        self.assertEqual(week2.result.hcp_before, s.best[("Test", "Ana", 1)].result.hcp_after)

    def test_classement_8_meilleurs_et_resultat_a_remplacer(self):
        points = {w: 100 + w for w in range(1, 11)}  # 10 semaines
        points[3], points[9] = 70, 70  # deux plus petits
        counted, replaced = counted_and_replaced(points, 8)
        self.assertEqual(len(counted), 8)
        self.assertEqual(sum(points[w] for w in counted), sum(sorted(points.values(), reverse=True)[:8]))
        self.assertNotIn(3, counted)
        self.assertNotIn(9, counted)
        self.assertEqual(counted_and_replaced({1: 90, 2: 90, 3: 100}, 8)[1], None)  # moins de 8 résultats

    def test_rang_evolution_et_ex_aequo(self):
        t1 = tournament(1, 1, [card("Ana", [4] * 9), card("Bob", [6] * 9)])
        t2 = tournament(2, 8, [card("Ana", [6] * 9), card("Bob", [3] * 9)])
        s = build_season(tour([t1, t2]))
        rows = {r.player: r for r in s.rankings[("Test", "net")]}
        self.assertEqual(rows["Bob"].rank, 1)
        self.assertEqual(rows["Bob"].evolution, 1)  # 2e puis 1er
        self.assertEqual(rows["Ana"].evolution, -1)
        self.assertEqual(rows["Bob"].total, sum(rows["Bob"].points.values()))

    def test_decompte_des_coups(self):
        counts = hole_counts([2, 3, 4, 5, 6, 7, 8, 0], [5, 4, 4, 4, 4, 4, 4, 4])
        self.assertEqual(counts["Albatross"], 1)
        self.assertEqual(counts["Birdies"], 1)
        self.assertEqual(counts["Pars"], 1)
        self.assertEqual(counts["Bogeys"], 1)
        self.assertEqual(counts["Double-Bogeys"], 1)
        self.assertEqual(counts["Triple-Bogeys"], 1)
        self.assertEqual(counts["More"], 1)


if __name__ == "__main__":
    unittest.main()
