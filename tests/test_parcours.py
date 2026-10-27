import json
import os
import sys
import tempfile
import unittest
from datetime import date

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from winter_challenge import parcours as p  # noqa: E402

TODAY = date(2026, 10, 25)


def row(id, name, loc, par=72, diff=4.0, styles=(), card=True, video="", updated="2026-01-01"):
    mask = sum(1 << p.STYLES.index(s) for s in styles)
    return [id, name, loc, par, diff, mask, 1 if card else 0, video, updated, "Concepteur", 1, 0, 0]


DATA = {"updated": "2026-10-25", "courses": [
    row(1, "Alpes GC", "Andermatt, , Switzerland", diff=4.7, styles=["Mountain"], video="abc"),
    row(2, "Cote Links", "Dornoch, Scotland", diff=7.5, styles=["Links", "Coastal"]),
    row(3, "Desert Club", "Phoenix, AZ", diff=5.0, styles=["Desert"], updated="2020-05-05"),
    row(4, "Petit Par 3", "Raleigh, NC", par=54, diff=2.0),
    row(5, "Sans Carte", "Lausanne, Switzerland", card=False),
    row(6, "Deja Joue", "Zurich, Switzerland", styles=["Mountain"]),
    row(7, "Reve", "Nowhere, Fictional", diff=3.0, styles=["Fantasy"]),
    row(8, "Sans Difficulte", "Perth, Australia", diff=None),
    row(9, "Faux Ami", "Francestown, New Hampshire, USA"),
]}


class ParcoursTest(unittest.TestCase):
    def setUp(self):
        self.courses = p.parse_courses(DATA, {p.normalize("Deja Joue")})

    def names(self, **kw):
        return [c.name for c in p.select(self.courses, today=TODAY, **kw)]

    def test_zones(self):
        zones = {c.name: c.zone for c in self.courses}
        self.assertEqual(zones["Alpes GC"], "suisse")
        self.assertEqual(zones["Cote Links"], "europe")
        self.assertEqual(zones["Desert Club"], "amerique-nord")  # AZ : code d'État américain
        self.assertEqual(zones["Reve"], "fictif")
        self.assertEqual(zones["Sans Difficulte"], "monde")
        self.assertEqual(p.zone_of("Amherst, NS, Canada"), "amerique-nord")
        self.assertEqual(p.zone_of(""), "inconnu")

    def test_difficulte(self):
        self.assertEqual(p.difficulty_label(3.0), "facile")
        self.assertEqual(p.difficulty_label(3.1), "moyen")
        self.assertEqual(p.difficulty_label(6.0), "moyen")
        self.assertEqual(p.difficulty_label(6.1), "difficile")
        self.assertEqual(self.names(difficulty=["difficile"]), ["Cote Links"])

    def test_filtres_de_base(self):
        everything = self.names()
        self.assertNotIn("Petit Par 3", everything)  # par 54 écarté
        self.assertNotIn("Sans Carte", everything)  # sans carte de score, impossible de lire la longueur
        self.assertNotIn("Sans Difficulte", everything)
        self.assertNotIn("Deja Joue", everything)
        self.assertIn("Deja Joue", self.names(exclude_played=False))

    def test_zone_europe_comprend_la_suisse(self):
        self.assertEqual(set(self.names(zones=["europe"])), {"Alpes GC", "Cote Links"})
        self.assertEqual(self.names(zones=["suisse"]), ["Alpes GC"])

    def test_pays_et_lieux_libres(self):
        self.assertEqual(self.names(places=["scotland"]), ["Cote Links"])
        self.assertEqual(set(self.names(places=["scotland", "phoenix"])), {"Cote Links", "Desert Club"})
        self.assertEqual(set(self.names(zones=["suisse"], places=["scotland"])), {"Alpes GC", "Cote Links"})  # s'additionnent
        self.assertEqual(self.names(places=["maroc"]), [])
        self.assertEqual(self.names(places=["france"]), [])  # « Francestown » n'est pas la France : mots entiers seulement
        self.assertEqual(self.names(places=["new hampshire"]), ["Faux Ami"])

    def test_styles_et_classement(self):
        self.assertEqual(self.names(style_groups=["links"]), ["Cote Links"])
        # la vidéo officielle fait remonter le parcours
        self.assertEqual(self.names(zones=["europe"])[0], "Alpes GC")
        self.assertEqual(self.names(official_video_only=True), ["Alpes GC"])

    def test_choisir_et_historique(self):
        with tempfile.TemporaryDirectory() as tmp:
            played, nxt = os.path.join(tmp, "joues.txt"), os.path.join(tmp, "next.json")
            hist = os.path.join(tmp, "historique.json")
            with open(played, "w", encoding="utf-8") as f:
                f.write("# commentaire\nKauri Cliffs\n")
            first = next(c for c in self.courses if c.name == "Alpes GC")
            second = next(c for c in self.courses if c.name == "Cote Links")
            p.choose(first, 3, "Front", played, nxt, history_path=hist)
            self.assertEqual(p.read_played(played), {"kauri cliffs"})  # le premier choix n'est pas encore « joué »
            record = p.choose(second, 4, "Back", played, nxt, history_path=hist)
            self.assertEqual(p.read_played(played), {"kauri cliffs", "alpes gc"})
            with open(nxt, encoding="utf-8") as f:
                self.assertEqual(json.load(f)["name"], "Cote Links")
            self.assertEqual(record["week"], 4)
            self.assertEqual([(h["week"], h["name"]) for h in p.read_history(hist)], [(3, "Alpes GC"), (4, "Cote Links")])
            p.choose(first, 3, "Back", played, nxt, history_path=hist)  # on change d'avis : la semaine 3 est remplacée
            self.assertEqual([h["nine"] for h in p.read_history(hist) if h["week"] == 3], ["Back"])

    def test_lecture_du_fichier_joues_reel(self):
        played = p.read_played(os.path.join(os.path.dirname(__file__), "..", "config", "parcours_joues.txt"))
        self.assertIn("kauri cliffs", played)
        self.assertEqual(len(played), 17)


if __name__ == "__main__":
    unittest.main()
