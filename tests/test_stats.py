import os
import sys
import unittest
from datetime import date, datetime

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


TODAY = date(2026, 11, 10)


class ParseTest(unittest.TestCase):
    def test_conversion_en_metres(self):
        st = parse_tournament_stats(RAW)
        self.assertEqual(st["joueurs"]["Ana"]["drive_m"], 228.6)  # 250 yards
        self.assertEqual(st["joueurs"]["Ana"]["fairways"], 50)
        self.assertEqual(st["joueurs"]["Ana"]["greens"], 61.1)
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


RAW_TUILES = {
    "drivingDistance": [{"user_name": "Ana", "longest_drive": "246.09"}, {"user_name": "Bob", "longest_drive": "190.04"}],
    "drivingAccuracy": [{"user_name": "Ana", "fir_percent": "40.00"}, {"user_name": "Bob", "fir_percent": "83.33"}],
    "greenAccuracy": [{"user_name": "Ana", "gir_percent": "37.50"}, {"user_name": "Bob", "gir_percent": "37.50"}],
    "girProx": [{"user_name": "Ana", "girProx": "32.45"}, {"user_name": "Bob", "girProx": "10.35"}],
    "feetPuttsMade": [{"user_name": "Ana", "putts_feet_per_round": "43.80"}, {"user_name": "Bob", "putts_feet_per_round": "34.97"}],
}


class TuilesTest(unittest.TestCase):
    def test_meilleur_de_chaque_statistique(self):
        t1 = tournament(1, 1, [card("Ana", [4] * 9), card("Bob", [5] * 9)])
        t1["stats"] = RAW_TUILES
        t2 = tournament(2, 8, [card("Ana", [4] * 9)])  # sans statistiques : pas de tuiles pour la semaine 2
        data = build_site_data(build_season(tour([t1, t2]), today=TODAY), "2026-2027")
        tiles = data["categories"][0]["stats"]
        self.assertEqual(list(tiles), ["1"])
        t = tiles["1"]
        self.assertEqual((t["fir"]["joueurs"], t["fir"]["valeur"]), (["Bob"], 83.3))
        self.assertEqual(t["gir"]["joueurs"], ["Ana", "Bob"])  # ex æquo : les deux sont cités
        self.assertEqual((t["drive"]["joueurs"], t["drive"]["orig"]), (["Ana"], 246.09))
        self.assertAlmostEqual(t["drive"]["valeur"], 225.0, places=1)  # 246.09 yards = 224.94 m chez SGT
        self.assertEqual((t["gir_prox"]["joueurs"], t["gir_prox"]["orig"]), (["Bob"], 10.35))  # plus près = meilleur
        self.assertEqual(t["putts_faits"]["joueurs"], ["Ana"])


class CompetitionsTest(unittest.TestCase):
    def test_autre_competition_a_la_meme_forme(self):
        wc = build_season(tour([tournament(1, 1, [card("Ana", [4] * 9)])]), today=TODAY)
        sg = build_season(tour([tournament(5, 1, [card("Ana", [3] * 9)])], label="Mixte"), today=TODAY)
        data = build_site_data(wc, "2026-2027", autres=[("Short Game", "SG", sg)])
        other = data["competitions_autres"][0]
        self.assertEqual((other["nom"], other["prefixe"], data["prefixe"]), ("Short Game", "SG", "WC"))
        self.assertEqual([c["nom"] for c in other["categories"]], ["Mixte"])
        self.assertEqual([w["numero"] for w in other["semaines"]], [1])
        self.assertEqual(set(other), set(data) - {"genere_le", "demo", "saison", "regles", "competitions_autres"})


class FicheJoueurTest(unittest.TestCase):
    def test_statistiques_dans_la_fiche(self):
        t1 = tournament(1, 1, [card("Ana", [4] * 9), card("Bob", [5] * 9)])
        t1["stats"] = RAW
        t2 = tournament(2, 8, [card("Ana", [4] * 9)])  # aucune statistique : la fiche doit s'en passer
        season = build_season(tour([t1, t2]), today=TODAY)
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
        season = build_season(tour([tournament(1, 1, [card("Ana", [4] * 9)])]), today=TODAY)
        data = build_site_data(season, "2026-2027")
        self.assertTrue(all(j["stats"] is None for j in data["joueurs"]))


if __name__ == "__main__":
    unittest.main()
