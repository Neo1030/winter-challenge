"""Page télé, nouvelle version (site/tvv2.html) : les mêmes garde-fous que pour la page télé actuelle."""

import re
import unittest
from pathlib import Path

SITE = Path(__file__).resolve().parent.parent / "site"


class TestTvV2(unittest.TestCase):
    def setUp(self):
        self.html = (SITE / "tvv2.html").read_text(encoding="utf-8")
        self.js = (SITE / "assets" / "tv2.js").read_text(encoding="utf-8")
        self.css = (SITE / "assets" / "tv2.css").read_text(encoding="utf-8")

    def test_never_counted_as_a_visit(self):
        for text in (self.html, self.js):
            self.assertNotIn("compteur.php", text)
            self.assertNotIn("app.js", text)

    def test_script_stays_readable_by_old_signage_browsers(self):
        """Le lecteur Zebrix refuse tout le script à la première syntaxe récente."""
        code = re.sub(r"/\*.*?\*/", "", self.js, flags=re.S)          # les commentaires citent ces syntaxes
        code = re.sub(r"//[^\n]*", "", code)
        self.assertIsNone(re.search(r"\?\.(?!\d)", code))
        self.assertNotIn("??", code)
        for recent in (".at(", ".flat(", "replaceAll", "structuredClone"):
            self.assertNotIn(recent, code)

    def test_style_avoids_recent_css(self):
        css = re.sub(r"/\*.*?\*/", "", self.css, flags=re.S)
        for recent in ("color-mix", "backdrop-filter", ":has("):
            self.assertNotIn(recent, css, recent)
        for prop in ("aspect-ratio", "inset"):                       # la propriété, pas la requête « max-aspect-ratio »
            self.assertIsNone(re.search(r"(?<![-\w])" + prop + r"\s*:", css), prop)

    def test_reads_the_real_data_and_keeps_the_diagnostic(self):
        self.assertIn('window.TV_DONNEES || "donnees/saison.json"', self.js)
        self.assertNotIn("TV_DONNEES", self.html)
        self.assertIn('location.search.indexOf("debug")', self.html)
        self.assertIn("window.TV_CYCLE", self.js)

    def test_short_game_has_no_net_and_no_handicap(self):
        self.assertIn('c.brut_seul ? "" : best("net", "Meilleur net")', self.js)
        self.assertIn('comp.brut_seul ? "" : "<span>Hdc</span>"', self.js)

    def test_style_and_script_share_one_version_number(self):
        css = re.search(r'href="assets/tv2\.css\?v=(\d+)"', self.html)
        js = re.search(r'src="assets/tv2\.js\?v=(\d+)"', self.html)
        self.assertTrue(css and js)
        self.assertEqual(css.group(1), js.group(1))


if __name__ == "__main__":
    unittest.main()
