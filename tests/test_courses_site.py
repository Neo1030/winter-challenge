import os
import sys
import unittest
from datetime import date

sys.path.insert(0, os.path.dirname(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from test_season import card, tournament, tour  # noqa: E402
from winter_challenge.season import build_season  # noqa: E402
from winter_challenge.sgt_page import (drive_holes, drives_key, long_drives, parse_drives,  # noqa: E402
                                       parse_settings)
from winter_challenge.site_export import build_site_data  # noqa: E402


def row(label, value):
    return (f"<div class='col-4'><div class=' three-quarter-font text-sgt-light mb-1'>{label}</div>"
            f"<div class=' three-quarter-font text-sgt-light text-uppercase'>{value}</div></div>")


PAGE = ("<div>ROUND SETTINGS</div><div>ROUND 1</div>" + row("STIMP", "11") + row("FAIRWAYS", "Hard") + row("GREENS", "Soft")
        + row("TEES", "White") + row("SLOPE", "137") + row("RATING", "72.0") + row("PINS", "Saturday")
        + row("GIMMIES", "10 Feet") + "<div>ROUND 2</div>" + row("STIMP", "9"))



def setting(label, value):
    return f"<div class='round-setting'>\n  <dt>{label}</dt>\n  <dd>{value}</dd>\n</div>"


# La page de tournoi de SGT depuis la refonte de leur site (14.11.2026) : des paires <dt> / <dd>, « Round 1 » en minuscules
PAGE_2026_11 = ("<section id='settingsView'><h2>ROUND SETTINGS</h2><h3 class='sgt-card-title'>Round 1</h3><dl class='round-settings'>"
                + setting("STIMP", "10") + setting("FAIRWAYS", "Firm") + setting("GREENS", "Soft")
                + setting("COURSE TYPE", "Bentgrass Soft") + setting("TEES", "Blue") + setting("SLOPE", "131")
                + setting("RATING", "71.8") + setting("PINS", "Friday") + setting("WEATHER", "Clear") + setting("WIND", "Calm")
                + setting("GIMMIES", "10 feet") + setting("PUTTING", "NORMAL") + "</dl>"
                + "<h3 class='sgt-card-title'>Round 2</h3><dl class='round-settings'>" + setting("STIMP", "9") + "</dl></section>")


def shots(points):
    """Une vue de trou de l'onglet Long Drive de SGT : les drives sont dans l'attribut data-shots, en JSON échappé."""
    import html
    import json
    return f"<div class='shot-plot shot-plot-fairway mb-4' data-plot-type='fairway' data-shots='{html.escape(json.dumps(points))}'></div>"


HOLE_11 = shots([{"n": "Ana", "p": "1", "v": "316.40 YDS", "x": 316.4, "y": 40.3, "r": 0},
                 {"n": "Bob", "p": "2", "v": "254.96 YDS", "x": 254.96, "y": -17.04, "r": 1},
                 {"n": "Cyd", "p": "-", "v": "330.00 YDS", "x": 330.0, "y": -30.44, "out": "ROUGH"}])   # au rough : ne compte pas
HOLE_12 = shots([{"n": "Bob", "p": "1", "v": "319.36 YDS", "x": 319.36, "y": 25.5, "r": 0},
                 {"n": "Ana", "p": "2", "v": "253.00 YDS", "x": 253.0, "y": 2.0, "r": 1}])

TODAY = date(2026, 11, 10)


class SettingsPageTest(unittest.TestCase):
    def test_lecture_des_reglages(self):
        s = parse_settings(PAGE)
        self.assertEqual(s, {"stimp": 11, "fairways": "Hard", "greens": "Soft", "depart": "White", "pente": 137,
                             "cotation": 72.0, "drapeaux": "Saturday", "gimmies": "10 Feet"})  # tour 2 ignoré

    def test_lecture_des_reglages_nouvelle_page_sgt(self):
        s = parse_settings(PAGE_2026_11)
        self.assertEqual(s, {"stimp": 10, "fairways": "Firm", "greens": "Soft", "depart": "Blue", "pente": 131,
                             "cotation": 71.8, "drapeaux": "Friday", "meteo": "Clear", "vent": "Calm",
                             "gimmies": "10 Feet", "putting": "Normal",
                             "type_parcours": "Bentgrass Soft"})  # tour 2 ignoré

    def test_page_sans_reglages(self):
        self.assertIsNone(parse_settings("<html>Cloudflare</html>"))
        self.assertIsNone(parse_settings(""))


class LongDriveTest(unittest.TestCase):
    def tournoi(self):
        """Ana et Bob ont joué les trous 10 à 18 : seuls les par 4 et 5 comptent pour le drive."""
        cards = []
        for name in ("Ana", "Bob"):
            c = {"player_name": name, "round": 1}
            for hole in range(1, 19):
                c[f"hole{hole}_gross"] = 4 if hole >= 10 else 0
                c[f"h{hole}_Par"] = 3 if hole in (3, 10, 14) else 4
            cards.append(c)
        return {"tournamentId": 82414, "scorecards": cards,
                "stats": {"drivingDistance": [{"user_name": "Ana", "numrounds": 1, "longest_drive": "282.38"}]}}

    def test_pas_de_drive_pour_une_carte_pas_finie(self):
        """Règle de Mike (15.11.2026) : un joueur qui n'a pas fini sa carte n'a pas de drive, même dans la liste gardée."""
        t = self.tournoi()
        t["scorecards"][1]["hole18_gross"] = 0                       # Bob s'arrête après 8 trous
        both = {"Ana": 300.0, "Bob": 320.0}
        drives = long_drives(t, None, lambda tid, holes: {"yd": both, "yd_tout": both})
        self.assertEqual(drives["yd"], {"Ana": 300.0})
        self.assertEqual(drives["yd_tout"], {"Ana": 300.0})
        t["scorecards"][1]["hole18_gross"] = 3                       # il finit son tour (un par 3, sans drive) : on relit
        again = long_drives(t, drives, lambda tid, holes: {"yd": both, "yd_tout": both})
        self.assertEqual(again["yd"], {"Ana": 300.0, "Bob": 320.0})

    def test_drives_d_un_trou_fairway_seulement(self):
        self.assertEqual(parse_drives(HOLE_11), {"Ana": 316.4, "Bob": 254.96})
        self.assertEqual(parse_drives("<div>ROUND 1 HOLE 1 POS PLAYER DISTANCE (yds)</div>"), {})
        self.assertEqual(parse_drives("<div data-shots='pas du json'></div>"), {})

    def test_drives_d_un_trou_ou_que_la_balle_s_arrete(self):
        """Le Longest drive toutes zones (demande de Mike, 20.11.2026) garde aussi les drives au rough, au sable…"""
        self.assertEqual(parse_drives(HOLE_11, every=True), {"Ana": 316.4, "Bob": 254.96, "Cyd": 330.0})
        lies = {}
        parse_drives(HOLE_11, True, lies)
        self.assertEqual(lies, {"Ana": "FAIRWAY", "Bob": "FAIRWAY", "Cyd": "ROUGH"})   # où s'arrête le drive gardé

    def test_trous_ou_le_drive_compte(self):
        self.assertEqual(drive_holes(self.tournoi()["scorecards"]), [(1, h) for h in (11, 12, 13, 15, 16, 17, 18)])
        self.assertEqual(drive_holes([]), [])

    def test_plus_long_drive_du_tournoi(self):
        pages = {(1, 11): HOLE_11, (1, 12): HOLE_12}
        asked = []

        def fetch(tournament_id, holes):
            asked.append((tournament_id, holes))
            best = {"yd": {}, "yd_tout": {}}
            for hole in holes:
                for field, every in (("yd", False), ("yd_tout", True)):
                    for name, yards in parse_drives(pages.get(hole, ""), every).items():
                        best[field][name] = max(yards, best[field].get(name, 0))
            return best

        t = self.tournoi()
        drives = long_drives(t, None, fetch)
        self.assertEqual(drives["yd"], {"Ana": 316.4, "Bob": 319.36})   # le meilleur de chaque joueur, tous trous confondus
        self.assertEqual(drives["yd_tout"], {"Ana": 316.4, "Bob": 319.36})   # Cyd (au rough) n'a pas de carte finie
        self.assertEqual(drives["cle"], drives_key(t["stats"], drive_holes(t["scorecards"]), ["Ana", "Bob"]))
        self.assertEqual(len(asked), 1)
        # rien n'a changé chez SGT : on reprend ce qui est publié, sans relire le site
        self.assertIs(long_drives(t, drives, fetch), drives)
        self.assertEqual(len(asked), 1)
        # un joueur a rejoué : les statistiques de l'API changent, on relit
        t["stats"]["drivingDistance"].append({"user_name": "Bob", "numrounds": 1, "longest_drive": "260.00"})
        self.assertNotEqual(long_drives(t, drives, fetch)["cle"], drives["cle"])
        self.assertEqual(len(asked), 2)

    def test_site_sgt_muet_on_garde_ce_qui_est_publie(self):
        t, known = self.tournoi(), {"cle": "ancienne", "yd": {"Ana": 300.0}}
        self.assertIs(long_drives(t, known, lambda tid, holes: None), known)   # une page n'a pas répondu
        self.assertIs(long_drives(t, known, lambda tid, holes: {}), known)     # la page ne contient plus de drives
        self.assertIsNone(long_drives(t, None, lambda tid, holes: None))
        t["stats"] = None                                                       # l'API n'a pas donné les statistiques
        self.assertIs(long_drives(t, known, lambda tid, holes: {"yd": {"Ana": 1.0}, "yd_tout": {"Ana": 1.0}}), known)

    def test_tournoi_sans_drive(self):
        t = self.tournoi()
        t["stats"] = {"drivingDistance": []}
        self.assertIsNone(long_drives(t, {"cle": "x", "yd": {"Ana": 300.0}}, lambda tid, holes: {"Ana": 1.0}))


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
