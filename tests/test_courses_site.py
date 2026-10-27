import os
import sys
import unittest
from datetime import date

sys.path.insert(0, os.path.dirname(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from test_season import card, tournament, tour  # noqa: E402
from winter_challenge.season import build_season  # noqa: E402
from winter_challenge.sgt_page import parse_settings  # noqa: E402
from winter_challenge.site_export import build_site_data  # noqa: E402


def row(label, value):
    return (f"<div class='col-4'><div class=' three-quarter-font text-sgt-light mb-1'>{label}</div>"
            f"<div class=' three-quarter-font text-sgt-light text-uppercase'>{value}</div></div>")


PAGE = ("<div>ROUND SETTINGS</div><div>ROUND 1</div>" + row("STIMP", "11") + row("FAIRWAYS", "Hard") + row("GREENS", "Soft")
        + row("TEES", "White") + row("SLOPE", "137") + row("RATING", "72.0") + row("PINS", "Saturday")
        + row("GIMMIES", "10 Feet") + "<div>ROUND 2</div>" + row("STIMP", "9"))


TODAY = date(2026, 11, 10)


class SettingsPageTest(unittest.TestCase):
    def test_lecture_des_reglages(self):
        s = parse_settings(PAGE)
        self.assertEqual(s, {"stimp": 11, "fairways": "Hard", "greens": "Soft", "depart": "White", "pente": 137,
                             "cotation": 72.0, "drapeaux": "Saturday", "gimmies": "10 Feet"})  # tour 2 ignoré

    def test_page_sans_reglages(self):
        self.assertIsNone(parse_settings("<html>Cloudflare</html>"))
        self.assertIsNone(parse_settings(""))


class CoursesTest(unittest.TestCase):
    def test_parcours_de_la_semaine_en_cours_et_a_venir(self):
        t1 = tournament(1, 1, [card("Ana", [4] * 9)])
        t1.update({"courseId": 3414, "reglages": parse_settings(PAGE)})
        t2 = tournament(2, 8, [], status="In Progress")  # créé chez SGT, la date de début n'est pas encore là
        t2["courseName"] = "Autre GC"
        season = build_season(tour([t1, t2]), today=date(2026, 11, 5))
        history = [{"name": "Test GC", "week": 1, "yellow_length_m": 5400, "nine": "Front", "description": "Joli."}]
        courses = build_site_data(season, "2026-2027", history=history)["parcours"]
        first, second = courses
        self.assertEqual((first["statut"], first["neuf"], first["par"], first["depart"]), ("en_cours", "Front", 36, "White"))
        self.assertEqual(first["reglages"]["stimp"], 11)
        self.assertEqual((first["longueur_jaune_m"], first["description"]), (5400, "Joli."))
        self.assertTrue(first["lien_carte"].endswith("scorecard_3414.jpg?v=1.1"))
        self.assertEqual((second["statut"], second["reglages"], second["par"]), ("a_venir", None, None))
        self.assertNotIn("longueur_jaune_m", second)  # l'archive ne concerne que la semaine 1

    def test_les_parcours_sont_ceux_du_premier_tour(self):
        hommes = tour([tournament(1, 1, [card("Ana", [4] * 9)])])
        femmes = tour([tournament(2, 1, [card("Eva", [4] * 9)])], members=("Eva",), label="Femmes")
        femmes[0]["tour_id"] = 2
        femmes[0]["tournaments"][0]["courseName"] = "Autre parcours"
        data = build_site_data(build_season(hommes + femmes, today=TODAY), "2026-2027")
        self.assertEqual([e["nom"] for e in data["parcours"]], ["Test GC"])


if __name__ == "__main__":
    unittest.main()
