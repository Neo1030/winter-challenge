import json
import os
import sys
import unittest
from datetime import date, datetime

sys.path.insert(0, os.path.dirname(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from test_season import card, tournament, tour  # noqa: E402
from winter_challenge.season import build_season  # noqa: E402
from winter_challenge.site_export import build_site_data  # noqa: E402

NOW = datetime(2026, 11, 10, 12, 0)
TODAY = date(2026, 11, 10)


class SiteExportTest(unittest.TestCase):
    def setUp(self):
        t1 = tournament(1, 1, [card("Ana", [3] * 9), card("Bob", [6] * 9)])
        t2 = tournament(2, 8, [card("Ana", [6] * 9), card("Bob", [3] * 9)], status="In Progress")
        self.season = build_season(tour([t1, t2]), today=TODAY)
        self.data = build_site_data(self.season, "2026-2027", demo=True, now=NOW)

    def test_structure_et_serialisation(self):
        json.dumps(self.data, ensure_ascii=False)  # doit rester du JSON pur
        self.assertTrue(self.data["demo"])
        self.assertEqual(self.data["genere_le"], "2026-11-10T12:00")
        self.assertEqual([c["nom"] for c in self.data["categories"]], ["Test"])
        self.assertEqual(self.data["regles"], {"meilleurs": 8})
        self.assertIsNone(self.data["parcours_semaine"])

    def test_classement_identique_a_la_saison(self):
        rows = self.data["categories"][0]["classement"]["net"]
        expected = self.season.rankings[("Test", "net")]
        self.assertEqual([r["joueur"] for r in rows], [r.player for r in expected])
        self.assertEqual([r["total"] for r in rows], [r.total for r in expected])
        self.assertEqual(rows[0]["points"], {str(w): p for w, p in sorted(expected[0].points.items())})

    def test_semaines_et_statut(self):
        weeks = self.data["semaines"]
        self.assertEqual([w["numero"] for w in weeks], [1, 2])
        self.assertEqual([w["statut"] for w in weeks], ["terminee", "en_cours"])
        first = weeks[0]["categories"][0]
        self.assertEqual(first["joueurs"], 2)
        self.assertEqual(first["meilleur_net"]["joueurs"], ["Ana"])

    def test_fiche_joueur_et_handicap(self):
        ana = next(j for j in self.data["joueurs"] if j["joueur"] == "Ana")
        self.assertEqual([w["semaine"] for w in ana["semaines"]], [1, 2])
        self.assertNotIn("tentatives", ana["semaines"][0])
        self.assertEqual(ana["hdc_historique"][0], {"semaine": 0, "hdc": ana["hdc_depart"]})
        self.assertEqual(ana["hdc_historique"][-1]["hdc"], ana["hdc_actuel"])
        self.assertEqual(ana["semaines"][1]["hdc_avant"], ana["semaines"][0]["hdc_apres"])

    def test_scores_joues_par_semaine(self):
        ana = next(j for j in self.data["joueurs"] if j["joueur"] == "Ana")
        w1 = ana["semaines"][0]  # résultat de la semaine 1 : neuf trous à 3 coups
        self.assertEqual((w1["trous"], w1["par"], w1["coups_brut"]), (9, 36, 27))
        self.assertLessEqual(w1["coups_net"], w1["coups_brut"])
        bob = next(j for j in self.data["joueurs"] if j["joueur"] == "Bob")
        self.assertEqual(bob["semaines"][0]["coups_brut"] - bob["semaines"][0]["par"], 18)  # 9 trous à 6 coups, par 4

    def test_seuls_les_pseudos_sont_publies(self):
        text = json.dumps(self.data)
        self.assertNotIn("email", text.lower())
        self.assertNotIn("Admin", text)  # le compte administrateur n'est pas un joueur


if __name__ == "__main__":
    unittest.main()
