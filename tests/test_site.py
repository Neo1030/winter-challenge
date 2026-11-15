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

    def test_player_sheet_motion_never_hides_anything_without_animation(self):
        """Fiche joueur : sans animation (réglage du système), le coup par coup et les blocs sont affichés d'emblée."""
        self.assertIn("function animerFiche(racine) {\n    if (CALME || !racine) return;", self.js)
        self.assertIn("function animerTrous(corps) {\n    if (CALME) return;", self.js)
        arc = re.search(r"^\.cp-arc \{[^}]*\}", self.css, re.M).group(0)
        self.assertNotIn("stroke-dashoffset", arc)       # l'arc n'est caché que sous « .attend », posé par le script
        self.assertIn(".cp-trou.attend .cp-arc, .cp-trou.attend .cp-putt { stroke-dashoffset: 1; }", self.css)
        motion = self.css[self.css.index("@media (prefers-reduced-motion: no-preference) {\n  .fiche .fiche-haut"):]
        self.assertIn("  .fv { opacity: 0;", motion[:motion.index("\n}")])

    def test_the_site_is_indexed_and_every_file_it_names_exists(self):
        self.assertNotIn("noindex", self.html)
        for ref in re.findall(r'(?:href|src)="(assets/[^"?#]+)', self.html):
            self.assertTrue((SITE / ref).is_file(), ref)
        for ref in re.findall(r'url\("((?!data:)[^")]+)"\)', self.css):
            self.assertTrue((SITE / "assets" / ref).is_file(), ref)


class TestLightAndDarkThemes(unittest.TestCase):
    """Sombre par défaut, clair au choix : mêmes règles de style, seules les variables changent."""

    def setUp(self):
        self.js = (SITE / "assets" / "refonte.js").read_text(encoding="utf-8")
        self.css = (SITE / "assets" / "refonte.css").read_text(encoding="utf-8")
        self.html = (SITE / "index.html").read_text(encoding="utf-8")

    def test_the_switch_is_in_the_header_and_the_choice_is_applied_before_the_style(self):
        self.assertIn('<button class="theme" id="theme"', self.html)
        script = self.html.index('localStorage.getItem("wc_theme") === "clair"')
        self.assertLess(script, self.html.index('href="assets/refonte.css'))
        self.assertIn('localStorage.setItem("wc_theme"', self.js)

    def test_every_light_variable_also_exists_in_the_dark_theme(self):
        dark = self.css[self.css.index(":root {"):self.css.index(':root[data-theme="clair"] {')]
        light = self.css[self.css.index(':root[data-theme="clair"] {'):]
        light = light[:light.index("\n}")]
        names = set(re.findall(r"(--[\w-]+)\s*:", light))
        self.assertGreater(len(names), 25)
        self.assertEqual(set(), names - set(re.findall(r"(--[\w-]+)\s*:", dark)))

    def test_no_dark_only_colour_is_left_outside_the_variables(self):
        rules = self.css[self.css.index(":root.bascule"):]
        for fixed in ("rgba(234, 246, 253", "rgba(127, 212, 255", "rgba(0, 16, 30", "rgba(0, 28, 51", "rgba(6, 42, 72", "#c5d9e8"):
            self.assertNotIn(fixed, rules, fixed)


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
