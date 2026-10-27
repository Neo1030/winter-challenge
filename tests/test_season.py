import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from winter_challenge.scoring import game_handicap, hole_counts  # noqa: E402
from winter_challenge.season import (  # noqa: E402
    STATUS_INCOMPLETE,
    STATUS_RETAINED,
    build_season,
    counted_and_replaced,
)
from datetime import date  # noqa: E402

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

    def test_plusieurs_cartes_par_securite_la_meilleure_et_egalite_recente(self):
        cards = [card("Ana", [5] * 9), card("Ana", [4] * 9), card("Ana", [4] * 9), card("Bob", [6] * 9)]
        s = build_season(tour([tournament(1, 1, cards)]))
        ana = [a for a in s.attempts if a.player == "Ana"]
        self.assertEqual([a.status for a in ana], ["Non retenu", "Non retenu", STATUS_RETAINED])  # égalité : la dernière
        self.assertEqual(s.best[("Test", "Ana", 1)].number, 3)

    def test_tour_incomplet_non_retenu(self):
        s = build_season(tour([tournament(1, 1, [card("Ana", [4] * 5), card("Bob", [4] * 9)])]))
        status = {a.player: a.status for a in s.attempts}
        self.assertEqual(status["Ana"], STATUS_INCOMPLETE)  # 5 trous : ni 9 ni 18
        self.assertEqual(status["Bob"], STATUS_RETAINED)
        self.assertNotIn(("Test", "Ana", 1), s.best)

    def test_le_handicap_change_en_fin_de_semaine_puis_se_reporte(self):
        t1 = tournament(1, 1, [card("Ana", [3] * 9)])  # points nets > 100 : le handicap baisse
        t2 = tournament(2, 8, [card("Ana", [4] * 9)])
        s = build_season(tour([t1, t2]))
        first = [a for a in s.attempts if a.week == 1][0]
        self.assertLess(first.result.hcp_after, first.result.hcp_before)
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


class CalendrierTest(unittest.TestCase):
    """La semaine en cours se juge aux dates de DÉBUT : SGT laisse tout « In Progress » et les dates de fin sont indicatives."""

    def weeks(self, today, days=(1, 8, 15)):
        tournaments = [tournament(i + 1, d, [], status="In Progress") for i, d in enumerate(days)]
        for t in tournaments:
            t["end_date"] = "2027-03-14 00:00:00"  # fin prévue : le jour où on fermera vraiment
        return build_season(tour(tournaments), today=today).weeks

    def test_semaine_en_cours_et_a_venir(self):
        self.assertEqual([w.phase for w in self.weeks(date(2026, 11, 8))], ["terminee", "en_cours", "a_venir"])  # jour de début
        self.assertEqual([w.phase for w in self.weeks(date(2026, 11, 14))], ["terminee", "en_cours", "a_venir"])  # veille d'une semaine
        self.assertEqual([w.phase for w in self.weeks(date(2026, 11, 15))], ["terminee", "terminee", "en_cours"])
        self.assertEqual([w.phase for w in self.weeks(date(2026, 10, 1))], ["a_venir"] * 3)

    def test_fin_la_veille_du_tournoi_suivant(self):
        weeks = self.weeks(date(2026, 11, 10), days=(1, 8, 29))  # trois semaines d'écart : pause de fin d'année
        self.assertEqual([w.end for w in weeks], ["2026-11-07", "2026-11-28", "2027-03-14"])  # le dernier garde la fin prévue

    def test_les_autres_categories_suivent_le_calendrier_des_hommes(self):
        hommes = tour([tournament(1, 1, []), tournament(2, 8, [], status="In Progress")], label="Hommes")
        seniors = tour([tournament(3, 1, []), tournament(4, 12, [], status="In Progress")], label="Seniors")  # dates saisies un peu différemment
        seniors[0]["tour_id"] = 2
        s = build_season(hommes + seniors, today=date(2026, 11, 9))
        self.assertEqual([(w.category, w.number, w.phase) for w in s.weeks],
                         [("Hommes", 1, "terminee"), ("Hommes", 2, "en_cours"), ("Seniors", 1, "terminee"), ("Seniors", 2, "en_cours")])


if __name__ == "__main__":
    unittest.main()
