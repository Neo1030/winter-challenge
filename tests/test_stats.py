import os
import sys
import unittest
from datetime import datetime

sys.path.insert(0, os.path.dirname(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from test_season import card, tournament, tour  # noqa: E402
from winter_challenge.season import build_season  # noqa: E402
from winter_challenge.site_export import build_site_data  # noqa: E402
from winter_challenge.stats import parse_tournament_stats, rank_of  # noqa: E402

RAW = {
    "drivingDistance": [{"user_name": "Ana", "numrounds": 2, "longest_drive": "250.00"},
                        {"user_name": "Bob", "numrounds": 1, "longest_drive": "200.00"}],
    "drivingAccuracy": [{"user_name": "Ana", "numrounds": 2, "fir_percent": "50.00"}],
    "greenAccuracy": [{"user_name": "Ana", "numrounds": 2, "gir_percent": "61.11"}],
    "puttsPerRound": [{"user_name": "Ana", "numrounds": 2, "putts_per_round": "15.5"}],
    "sandSave": [{"user_name": "Bob", "numrounds": 1, "sand_save_percent": None}],
    "closestToPin": {
        "1": {"3": {"ctps": [{"user_name": "Ana", "distanceToPin": 30.0}, {"user_name": "Bob", "distanceToPin": 10.0}]}},
        "2": {"3": {"ctps": [{"user_name": "Ana", "distanceToPin": 5.0}]}},
    },
}


class ParseTest(unittest.TestCase):
    def test_conversion_en_metres(self):
        st = parse_tournament_stats(RAW)
        self.assertEqual(st["joueurs"]["Ana"]["drive_m"], 228.6)  # 250 yards
        self.assertEqual(st["joueurs"]["Ana"]["fairways"], 50)
        self.assertEqual(st["joueurs"]["Ana"]["greens"], 61)
        self.assertEqual(st["joueurs"]["Ana"]["tours"], 2)
        self.assertNotIn("sable", st["joueurs"]["Bob"])  # valeur absente (null) ignorée

    def test_pres_du_drapeau_meilleur_tour_par_joueur(self):
        ctp = parse_tournament_stats(RAW)["ctp"]
        self.assertEqual([n for n, _ in ctp[3]], ["Ana", "Bob"])  # Ana : 5 pieds au 2e tour, Bob : 10 pieds
        self.assertAlmostEqual(ctp[3][0][1], 1.524)

    def test_reponses_absentes_ou_vides(self):
        for raw in (None, {}, [], {"closestToPin": []}):
            self.assertEqual(parse_tournament_stats(raw), {"joueurs": {}, "ctp": {}})

    def test_rang_a_la_francaise(self):
        self.assertEqual(rank_of(5, [5, 5, 3]), 1)
        self.assertEqual(rank_of(3, [5, 5, 3]), 3)
        self.assertEqual(rank_of(3, [5, 4, 3], higher_is_better=False), 1)


class FicheJoueurTest(unittest.TestCase):
    def test_statistiques_dans_la_fiche(self):
        t1 = tournament(1, 1, [card("Ana", [4] * 9), card("Bob", [5] * 9)])
        t1["stats"] = RAW
        t2 = tournament(2, 8, [card("Ana", [4] * 9)])  # aucune statistique : la fiche doit s'en passer
        season = build_season(tour([t1, t2]))
        data = build_site_data(season, "2026-2027", now=datetime(2026, 11, 10, 12, 0))
        ana = next(j for j in data["joueurs"] if j["joueur"] == "Ana")
        st = ana["stats"]
        self.assertEqual([w["semaine"] for w in st["semaines"]], [1])
        w = st["semaines"][0]
        self.assertEqual((w["drive_rang"], w["drive_sur"]), (1, 2))
        self.assertEqual(w["ctp"], [{"trou": 3, "m": 1.5, "rang": 1, "sur": 2}])
        self.assertEqual(st["resume"]["meilleur_drive"], {"m": 228.6, "semaine": 1})
        self.assertEqual(st["resume"]["meilleur_ctp"], {"m": 1.5, "semaine": 1, "trou": 3})
        self.assertEqual(st["resume"]["putts"], 15.5)
        bob = next(j for j in data["joueurs"] if j["joueur"] == "Bob")
        self.assertEqual(bob["stats"]["semaines"][0]["ctp"][0]["rang"], 2)

    def test_sans_statistiques_la_fiche_reste_valide(self):
        season = build_season(tour([tournament(1, 1, [card("Ana", [4] * 9)])]))
        data = build_site_data(season, "2026-2027")
        self.assertTrue(all(j["stats"] is None for j in data["joueurs"]))


if __name__ == "__main__":
    unittest.main()
