"""Nouvelle version du site (site/v2, en ligne sous /v2) : les mêmes garde-fous que pour le site actuel."""

import re
import unittest
from pathlib import Path

V2 = Path(__file__).resolve().parent.parent / "site" / "v2"


class TestSiteV2(unittest.TestCase):
    def setUp(self):
        self.js = (V2 / "refonte.js").read_text(encoding="utf-8")
        self.html = (V2 / "index.html").read_text(encoding="utf-8")

    def test_reads_the_real_data_never_demo_data(self):
        self.assertIn('fetch("../donnees/saison.json?v="', self.js)
        self.assertNotIn("donnees-demo", self.js)
        self.assertEqual([], [p.name for p in V2.rglob("*") if "demo" in p.name.lower()])

    def test_counts_only_on_the_real_site(self):
        self.assertIn('const HOTE_COMPTE = "winterchallenge.letsgolf.ch"', self.js)
        self.assertIn("location.hostname !== HOTE_COMPTE", self.js)
        self.assertIn("../compteur.php?p=", self.js)

    def test_style_and_script_share_one_version_number(self):
        """Le numéro après « v= » évite qu'un navigateur garde un ancien style avec un nouveau script."""
        css = re.search(r'href="refonte\.css\?v=(\d+)"', self.html)
        js = re.search(r'src="refonte\.js\?v=(\d+)"', self.html)
        self.assertTrue(css and js)
        self.assertEqual(css.group(1), js.group(1))

    def test_not_indexed_while_it_sits_beside_the_current_site(self):
        self.assertIn('<meta name="robots" content="noindex">', self.html)


if __name__ == "__main__":
    unittest.main()
