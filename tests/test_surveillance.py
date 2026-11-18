"""Surveillance des données SGT : une donnée qui disparaît met sa zone en maintenance, et l'alerte part une seule fois."""

import contextlib
import copy
import io
import os
import tempfile
import unittest
from datetime import datetime
from pathlib import Path

from winter_challenge import surveillance

SITE = Path(__file__).resolve().parent.parent / "site"


def sample():
    """Un petit fichier de données : deux semaines du Winter Challenge, un mois du Short Game."""
    return {
        "prefixe": "WC",
        "parcours": [
            {"semaine": 1, "debut": "2026-10-26", "statut": "terminee", "depart": "Yellow", "par": 36, "neuf": "Front",
             "reglages": {"stimp": 11, "gimmies": "3 feet"}},
            {"semaine": 2, "debut": "2026-11-02", "statut": "en_cours", "par": 36, "reglages": {"stimp": 10}},
            {"semaine": 3, "debut": "2026-11-09", "statut": "a_venir", "reglages": {"stimp": 12}},
        ],
        "semaines": [
            {"numero": 1, "debut": "2026-10-26", "categories": [{"categorie": "Hommes", "meilleur_brut": {"stableford": 30}}]},
            {"numero": 2, "debut": "2026-11-02", "categories": [{"categorie": "Hommes", "meilleur_brut": {"stableford": 28}}]},
        ],
        "categories": [{"nom": "Hommes", "stats": {
            "1": {"drive": {"valeur": 230.1, "joueurs": ["Alpha"]}, "fir": {"valeur": 60, "joueurs": ["Beta"]}},
            "2": {"drive": {"valeur": 221.0, "joueurs": ["Beta"]}}}}],
        "joueurs": [
            {"joueur": "Alpha", "semaines": [{"semaine": 1, "coups_brut": 40}, {"semaine": 2, "coups_brut": 42}],
             "stats": {"semaines": [{"semaine": 1, "drive_m": 230.1, "fairways": 50, "ctp": [{"trou": 3, "m": 4.2}]}]}},
            {"joueur": "Beta", "semaines": [{"semaine": 1, "coups_brut": 44}], "stats": None},
        ],
        "competitions_autres": [{
            "prefixe": "SG", "parcours": [], "semaines": [], "joueurs": [],
            "categories": [{"nom": "Mixte", "stats": {"1": {"ctp": {"valeur": 2.5, "joueurs": ["Alpha"]}}}}]}],
    }


NOW = datetime(2026, 11, 15, 10, 0)


def without_drive(data):
    """L'API ne donne plus le drive : ni tuile, ni statistique du joueur."""
    data = copy.deepcopy(data)
    for tiles in data["categories"][0]["stats"].values():
        tiles.pop("drive", None)
    for j in data["joueurs"]:
        for s in (j["stats"] or {}).get("semaines", []):
            s.pop("drive_m", None)
    return data


class TestFacts(unittest.TestCase):
    def test_weeks_are_known_by_their_start_date(self):
        f = surveillance.facts(sample())
        self.assertEqual(f["WC|score|Alpha|2026-11-02"], "classement")
        self.assertEqual(f["WC|tuile|Hommes|2026-10-26|drive"], "drive")
        self.assertEqual(f["WC|stat|Alpha|2026-10-26|ctp"], "ctp")
        self.assertEqual(f["WC|reglage|2026-10-26|stimp"], "parcours")
        self.assertEqual(f["SG|tuile|Mixte|n1|ctp"], "ctp")

    def test_a_coming_week_is_not_watched(self):
        self.assertFalse(any("2026-11-09" in fact for fact in surveillance.facts(sample())))

    def test_renumbered_weeks_are_not_a_disappearance(self):
        """Un tournoi ajouté avant les autres décale les numéros : les dates de début, elles, ne bougent pas."""
        new = sample()
        new["parcours"].insert(0, {"semaine": 0, "debut": "2026-10-19", "statut": "terminee"})
        for e in new["parcours"][1:]:
            e["semaine"] += 1
        for w in new["semaines"]:
            w["numero"] += 1
        for j in new["joueurs"]:
            for s in j["semaines"] + ((j["stats"] or {}).get("semaines") or []):
                s["semaine"] += 1
        new["categories"][0]["stats"] = {str(int(k) + 1): v for k, v in new["categories"][0]["stats"].items()}
        result = surveillance.check(new, sample(), now=NOW)
        self.assertEqual(result["manquants"], {})


class TestCheck(unittest.TestCase):
    def test_nothing_missing_means_no_maintenance(self):
        new = sample()
        result = surveillance.check(new, sample(), now=NOW)
        self.assertEqual(result["alerte"], "")
        self.assertEqual(new["maintenance"], [])
        self.assertEqual(new["competitions_autres"][0]["maintenance"], [])
        self.assertEqual(new["surveillance"], {})

    def test_new_data_is_never_a_problem(self):
        new = sample()
        new["joueurs"].append({"joueur": "Gamma", "semaines": [{"semaine": 2, "coups_brut": 39}]})
        self.assertEqual(surveillance.check(new, sample(), now=NOW)["manquants"], {})

    def test_a_missing_statistic_puts_only_its_tile_in_maintenance(self):
        new = without_drive(sample())
        result = surveillance.check(new, sample(), now=NOW)
        self.assertEqual(new["maintenance"], ["drive"])
        self.assertEqual(new["competitions_autres"][0]["maintenance"], [])   # le Short Game n'est pas touché
        self.assertEqual(result["alerte"], "")                               # pas encore : une seule mise à jour sans le drive
        self.assertEqual(len(result["manquants"]), 3)

    def test_alert_is_sent_once_after_two_updates_then_resolved(self):
        published = sample()
        first = without_drive(sample())
        r1 = surveillance.check(first, published, now=NOW)
        self.assertEqual(r1["alerte"], "")
        second = without_drive(sample())
        r2 = surveillance.check(second, first, now=NOW)          # la deuxième mise à jour compare au fichier publié par la première
        self.assertEqual(r2["alerte"], "nouvelle")
        self.assertEqual(len(r2["nouveaux"]), 3)
        self.assertEqual(second["maintenance"], ["drive"])        # la maintenance tient alors que le fichier publié n'a plus le drive
        third = without_drive(sample())
        r3 = surveillance.check(third, second, now=NOW)
        self.assertEqual(r3["alerte"], "")                        # déjà signalé : pas de nouvel e-mail
        self.assertEqual(third["maintenance"], ["drive"])
        back = sample()
        r4 = surveillance.check(back, third, now=NOW)
        self.assertEqual(r4["alerte"], "resolue")
        self.assertEqual(back["maintenance"], [])
        self.assertEqual(back["surveillance"], {})
        self.assertIn("ne sont plus en maintenance", surveillance.report(r4))

    def test_a_short_glitch_lifts_the_maintenance_without_any_alert(self):
        first = without_drive(sample())
        surveillance.check(first, sample(), now=NOW)
        back = sample()
        result = surveillance.check(back, first, now=NOW)
        self.assertEqual(result["alerte"], "")
        self.assertEqual(back["maintenance"], [])

    def test_lost_scores_put_the_ranking_in_maintenance(self):
        new = sample()
        new["joueurs"][1]["semaines"] = []
        surveillance.check(new, sample(), now=NOW)
        self.assertEqual(new["maintenance"], ["classement"])

    def test_lost_settings_put_the_course_in_maintenance(self):
        new = sample()
        new["parcours"][0]["reglages"] = None
        surveillance.check(new, sample(), now=NOW)
        self.assertEqual(new["maintenance"], ["parcours"])

    def test_accepting_clears_everything(self):
        first = without_drive(sample())
        surveillance.check(first, sample(), now=NOW)
        second = without_drive(sample())
        surveillance.check(second, first, now=NOW)
        accepted = without_drive(sample())
        result = surveillance.check(accepted, second, accept=True, now=NOW)
        self.assertEqual(accepted["maintenance"], [])
        self.assertEqual(result["alerte"], "resolue")             # l'issue ouverte se ferme
        later = without_drive(sample())
        self.assertEqual(surveillance.check(later, accepted, now=NOW)["manquants"], {})

    def test_unreadable_published_file_is_not_an_alert(self):
        new = sample()
        self.assertEqual(surveillance.check(new, {}, now=NOW)["alerte"], "")
        self.assertEqual(new["maintenance"], [])

    def test_report_names_the_zones_and_the_lost_data(self):
        first = without_drive(sample())
        surveillance.check(first, sample(), now=NOW)
        second = without_drive(sample())
        text = surveillance.report(surveillance.check(second, first, now=NOW))
        self.assertIn("Statistique du drive", text)
        self.assertIn("drive_m de Alpha, semaine du 26.10.2026", text)
        self.assertIn("accepter les disparitions", text)

    def test_signal_writes_github_output_and_report(self):
        first = without_drive(sample())
        surveillance.check(first, sample(), now=NOW)
        result = surveillance.check(without_drive(sample()), first, now=NOW)
        with tempfile.TemporaryDirectory() as tmp:
            out, md = os.path.join(tmp, "out"), os.path.join(tmp, "alerte.md")
            old = os.environ.get("GITHUB_OUTPUT")
            os.environ["GITHUB_OUTPUT"] = out
            # la ligne « ::warning:: » est capturée : écrite par un test, GitHub en ferait un faux avertissement à chaque mise en ligne
            journal = io.StringIO()
            try:
                with contextlib.redirect_stdout(journal):
                    surveillance.signal(result, md)
            finally:
                if old is None:
                    del os.environ["GITHUB_OUTPUT"]
                else:
                    os.environ["GITHUB_OUTPUT"] = old
            self.assertEqual(Path(out).read_text(encoding="utf-8"), "alerte=nouvelle\n")
            self.assertIn("::warning::Données SGT disparues : 3 ; en maintenance : Statistique du drive", journal.getvalue())
            self.assertIn("en maintenance", Path(md).read_text(encoding="utf-8"))


class TestPages(unittest.TestCase):
    def test_site_and_tv_read_the_maintenance_zones(self):
        js = (SITE / "assets" / "refonte.js").read_text(encoding="utf-8")
        tv = (SITE / "assets" / "tv2.js").read_text(encoding="utf-8")
        for zone in surveillance.ZONES:
            if zone not in ("classement", "parcours"):
                self.assertIn(f'"{zone}"', js)
        self.assertIn('enPanne("classement")', js)
        self.assertIn('enPanne("parcours")', js)
        self.assertIn('down(comp, "classement")', tv)
        self.assertIn('down(c, "parcours")', tv)
        self.assertIn("down(comp, def[0])", tv)


if __name__ == "__main__":
    unittest.main()
