"""Le site des joueurs (site/index.html, « Trajectoire ») et l'ancienne version gardée sous site/v1."""

import re
import unittest
from pathlib import Path

SITE = Path(__file__).resolve().parent.parent / "site"


class TestSite(unittest.TestCase):
    def setUp(self):
        self.js = (SITE / "assets" / "refonte.js").read_text(encoding="utf-8")
        self.css = (SITE / "assets" / "refonte.css").read_text(encoding="utf-8")
        self.html = (SITE / "index.html").read_text(encoding="utf-8")

    def test_reads_the_real_data_never_demo_data(self):
        self.assertIn('fetch("donnees/saison.json?v="', self.js)
        self.assertNotIn("demo/", self.js)
        self.assertNotIn("saison_demo", self.js)

    def test_counts_only_on_the_real_site(self):
        self.assertIn('const HOTE_COMPTE = "winterchallenge.letsgolf.ch"', self.js)
        self.assertIn("location.hostname !== HOTE_COMPTE", self.js)
        self.assertIn("`compteur.php?p=", self.js)

    def test_style_and_script_share_one_version_number(self):
        """Le numéro après « v= » évite qu'un navigateur garde un ancien style avec un nouveau script."""
        css = re.search(r'href="assets/refonte\.css\?v=(\d+)"', self.html)
        js = re.search(r'src="assets/refonte\.js\?v=(\d+)"', self.html)
        self.assertTrue(css and js)
        self.assertEqual(css.group(1), js.group(1))

    def test_the_site_is_indexed_and_every_file_it_names_exists(self):
        self.assertNotIn("noindex", self.html)
        for ref in re.findall(r'(?:href|src)="(assets/[^"?#]+)', self.html):
            self.assertTrue((SITE / ref).is_file(), ref)
        for ref in re.findall(r'url\("((?!data:)[^")]+)"\)', self.css):
            self.assertTrue((SITE / "assets" / ref).is_file(), ref)


class TestOldSiteKeptUnderV1(unittest.TestCase):
    """L'ancien site et l'ancienne page télé restent consultables sous /v1 (décision de Mike, 15.11.2026)."""

    V1 = SITE / "v1"

    def test_old_pages_are_there_with_their_files(self):
        for page in ("index.html", "tv.html", "tvreduit.html", "tvdemo.html", "tvreduitdemo.html"):
            html = (self.V1 / page).read_text(encoding="utf-8")
            for ref in re.findall(r'(?:href|src)="(assets/[^"?#]+)', html):
                self.assertTrue((self.V1 / ref).is_file(), page + " : " + ref)

    def test_old_pages_read_the_same_data_one_level_up(self):
        self.assertIn('fetch("../donnees/saison.json?v="', (self.V1 / "assets" / "app.js").read_text(encoding="utf-8"))
        self.assertIn('window.TV_DONNEES || "../donnees/saison.json"', (self.V1 / "assets" / "tv.js").read_text(encoding="utf-8"))
        self.assertTrue((SITE / "demo" / "saison_demo.json").is_file())
        self.assertIn('"../demo/saison_demo.json"', (self.V1 / "tvdemo.html").read_text(encoding="utf-8"))

    def test_old_site_is_not_indexed(self):
        self.assertIn('<meta name="robots" content="noindex">', (self.V1 / "index.html").read_text(encoding="utf-8"))

    def test_old_addresses_lead_to_the_new_pages(self):
        self.assertIn('location.replace("../"', (SITE / "v2" / "index.html").read_text(encoding="utf-8"))
        self.assertIn('location.replace("tv.html"', (SITE / "tvreduit.html").read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
