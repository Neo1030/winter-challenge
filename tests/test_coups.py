"""Coup par coup : lecture de l'onglet « Shot data » du site SGT, relecture seulement si la carte change, fichier coups.json."""

import importlib.util
import unittest
from pathlib import Path

from winter_challenge.sgt_page import parse_shots, shots_key, shots_of

ROOT = Path(__file__).resolve().parent.parent


def _row(number, lie, main, detail=None):
    detail = f" <span class='shot-detail'>{detail}</span>" if detail is not None else ""
    return (f"<div  class='shot-row  d-flex'><div class='shot-number lie-{lie} text-center'>{number}</div>"
            f"<div class='ms-2'><span class='shot-main'>{main}</span>{detail}</div></div>")


def _hole(number, par, score, rows, yards):
    return (f"<div data-hole='{number}' class='mb-3 col-12'><div class='shot-card'><div>HOLE {number}</div><div>PAR {par}</div>"
            f"<div class='hole-score hole-par text-center'>{score}</div>{''.join(rows)}"
            f"<div class='shot-map'><svg><title>1: 999 yds to fairway</title></svg>"
            f"<div class='shot-map-labels d-flex'><span>{yards} YDS</span><span>1 PUTT</span></div></div></div></div>")


# La forme des pages relevée sur le site SGT le 15.11.2026 (tournoi 82414), avec des chiffres d'exemple
PAGE = "<h2>ROUND 1</h2>" + "".join([
    _hole(10, 3, 4, [_row(1, "rough", "193 yds", "to rough &middot; 35 yds left"), _row(2, "green", "30 yds", "to green &middot; 18 ft left"),
                     _row(3, "green", "Putt 19 ft", "1 ft left"), _row(4, "holecup", "Tap-in", "gimme")], 210),
    _hole(11, 4, 3, [_row(1, "fairway", "209 yds", "to fairway &middot; 118 yds left"), _row(2, "green", "115 yds", "to green &middot; 14 ft left"),
                     _row(3, "holecup", "Made 14 ft putt")], 327),                       # pas de détail sur un putt rentré
    _hole(12, 5, 6, [_row(1, "fairway", "188 yds", "to fairway &middot; 365 yds left"), _row(2, "rough", "85 yds", "to rough &middot; 280 yds left"),
                     _row(4, "fairway", "250 yds", "to fairway &middot; 30 yds left"), _row(5, "green", "28 yds", "to green &middot; 3 ft left"),
                     _row(6, "holecup", "Tap-in", "gimme")], 553),                        # le coup 3 manque : pénalité
    _hole(13, 4, 3, [_row(1, "fairway", "250 yds", "to fairway &middot; 60 yds left"), _row(2, "sand", "45 yds", "to sand &middot; 16 yds left"),
                     _row(3, "holecup", "Holed out from 16 yds")], 310),
]) + "<h2>ROUND 2</h2>" + _hole(1, 4, 4, [_row(1, "fairway", "200 yds", "to fairway &middot; 100 yds left")], 300)


class TestParseShots(unittest.TestCase):
    def setUp(self):
        self.holes = parse_shots(PAGE)

    def test_only_the_first_round_and_every_hole_keeps_its_own_shots(self):
        self.assertEqual([10, 11, 12, 13], [h["t"] for h in self.holes])
        self.assertEqual([4, 3, 5, 3], [len(h["c"]) for h in self.holes])     # un putt sans détail ne mange pas le trou suivant
        self.assertEqual([(3, 4), (4, 3), (5, 6), (4, 3)], [(h["p"], h["s"]) for h in self.holes])

    def test_distances_are_converted_to_metres(self):
        hole = self.holes[0]
        self.assertEqual(192, hole["m"])                                       # 210 yards
        self.assertEqual([1, "c", 176.5, "rough", 32.0], hole["c"][0])         # 193 yards, reste 35 yards
        self.assertEqual([2, "c", 27.4, "green", 5.5], hole["c"][1])           # reste 18 pieds
        self.assertEqual([3, "p", 5.8, "green", 0.3], hole["c"][2])
        self.assertEqual([4, "g", None, "holecup", 0], hole["c"][3])

    def test_holed_putts_and_hole_outs_end_in_the_cup(self):
        self.assertEqual([3, "p", 4.3, "holecup", 0], self.holes[1]["c"][-1])
        self.assertEqual([3, "c", 14.6, "holecup", 0], self.holes[3]["c"][-1])

    def test_a_penalty_stroke_keeps_its_gap_in_the_numbering(self):
        self.assertEqual([1, 2, 4, 5, 6], [c[0] for c in self.holes[2]["c"]])

    def test_an_unreadable_page_gives_nothing(self):
        self.assertIsNone(parse_shots("<html><body>Not found</body></html>"))
        self.assertIsNone(parse_shots(""))


def _card(name, scores, player_id=7):
    card = {"player_name": name, "playerId": player_id, "round": 1}
    card.update({f"hole{i}_gross": (scores[i - 1] if i <= len(scores) else 0) for i in range(1, 19)})
    return card


class TestShotsOf(unittest.TestCase):
    def test_every_player_who_played_is_read_once_then_only_when_the_card_changes(self):
        calls = []

        def fetch(tournament_id, player_id):
            calls.append((tournament_id, player_id))
            return [{"t": 1, "p": 4, "s": 4, "m": 300, "c": []}]

        tournament = {"tournamentId": 5, "scorecards": [_card("Ana", [4, 5], 11), _card("Bob", [3], 12), _card("Zoe", [], 13)]}
        first = shots_of(tournament, None, [10], fetch)
        self.assertEqual({"Ana", "Bob"}, set(first))                           # Zoe n'a pas joué : rien à lire
        self.assertEqual([(5, 11), (5, 12)], calls)
        again = shots_of(tournament, first, [10], fetch)
        self.assertEqual(2, len(calls))                                        # rien n'a changé : aucune lecture
        self.assertEqual(first, again)
        tournament["scorecards"][1] = _card("Bob", [3, 4], 12)                 # Bob a joué un trou de plus
        shots_of(tournament, first, [10], fetch)
        self.assertEqual([(5, 11), (5, 12), (5, 12)], calls)

    def test_the_budget_limits_the_reads_and_a_failed_read_keeps_what_was_published(self):
        tournament = {"tournamentId": 5, "scorecards": [_card("Ana", [4], 11), _card("Bob", [3], 12)]}
        budget = [1]
        out = shots_of(tournament, None, budget, lambda t, p: [{"t": 1}])
        self.assertEqual(1, len(out))
        self.assertEqual([0], budget)
        old = {"Ana": {"cle": "ancienne", "trous": [{"t": 9}]}}
        kept = shots_of(tournament, old, [5], lambda t, p: None)               # le site SGT ne répond pas
        self.assertEqual(old["Ana"], kept["Ana"])
        self.assertNotIn("Bob", kept)

    def test_the_key_follows_the_hole_scores(self):
        self.assertEqual(shots_key([_card("Ana", [4, 5])]), shots_key([_card("Ana", [4, 5])]))
        self.assertNotEqual(shots_key([_card("Ana", [4, 5])]), shots_key([_card("Ana", [4, 6])]))


class TestShotsFile(unittest.TestCase):
    def setUp(self):
        spec = importlib.util.spec_from_file_location("export_site_data", ROOT / "scripts" / "export_site_data.py")
        self.mod = importlib.util.module_from_spec(spec)
        import sys
        sys.path.insert(0, str(ROOT / "scripts"))
        spec.loader.exec_module(self.mod)

    def test_the_file_indexes_every_tournament_of_a_week_under_its_competition(self):
        def tour(tour_id, competition, tournaments):
            return {"tour_id": tour_id, "competition": competition, "tournaments": [
                {"tournamentId": tid, "start_date": start, "end_date": start, "coups": shots} for tid, start, shots in tournaments]}
        tours = [tour(1, "Winter Challenge", [(20, "2026-11-16", {"Ana": {"cle": "b", "trous": [1]}}), (10, "2026-11-08", {"Ana": {"cle": "a", "trous": [1]}})]),
                 tour(2, "Winter Challenge", [(11, "2026-11-08", {"Eve": {"cle": "c", "trous": [1]}}), (21, "2026-11-16", {})]),
                 tour(3, "Short Game", [(30, "2026-11-08", {"Ana": {"cle": "d", "trous": [1]}})])]
        data = self.mod.shots_data(tours, "2026-11-15T12:00")
        self.assertEqual({"WC": {"1": [10, 11], "2": [20]}, "SG": {"1": [30]}}, data["index"])
        self.assertEqual({"10", "11", "20", "30"}, set(data["tournois"]))
        self.assertEqual("m", data["unite"])

    def test_the_shots_file_travels_with_the_results_but_not_with_the_site(self):
        spec = importlib.util.spec_from_file_location("deploy_ftps", ROOT / "scripts" / "deploy_ftps.py")
        deploy = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(deploy)
        created = not deploy.SHOTS.exists()
        deploy.SHOTS.parent.mkdir(exist_ok=True)
        if created:
            deploy.SHOTS.write_text("{}")
        try:
            self.assertIn(deploy.SHOTS, deploy.files_to_send(True))
            self.assertNotIn(deploy.SHOTS, deploy.files_to_send(False))
            self.assertIn(deploy.SHOTS, deploy.files_to_send(False, True))
        finally:
            if created:
                deploy.SHOTS.unlink()


if __name__ == "__main__":
    unittest.main()
