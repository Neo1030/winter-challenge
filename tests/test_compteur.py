"""Compteur de visites : la télé n'est jamais comptée, le mot de passe n'est jamais écrit, les visites ne sont jamais envoyées."""

import hashlib
import importlib.util
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITE = ROOT / "site"


def _module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


class TestCompteur(unittest.TestCase):
    def test_tv_pages_never_count(self):
        for page in ("tv.html", "tvreduit.html", "tvdemo.html", "tvreduitdemo.html"):
            html = (SITE / page).read_text(encoding="utf-8")
            self.assertNotIn("app.js", html, page)
            self.assertNotIn("compteur.php", html, page)
        self.assertNotIn("compteur.php", (SITE / "assets" / "tv.js").read_text(encoding="utf-8"))

    def test_counts_only_on_the_real_site(self):
        js = (SITE / "assets" / "app.js").read_text(encoding="utf-8")
        self.assertIn('const COUNT_HOST = "winterchallenge.letsgolf.ch"', js)
        self.assertIn("location.hostname !== COUNT_HOST", js)

    def test_password_file_holds_only_a_hash(self):
        mod = _module("mot_de_passe_stats", ROOT / "scripts" / "mot_de_passe_stats.py")
        text = mod.contenu("un-mot-de-passe-test")
        self.assertNotIn("un-mot-de-passe-test", text)
        sel, it, emp = re.search(r"'sel' => '(\w+)', 'iterations' => (\d+), 'empreinte' => '(\w+)'", text).groups()
        self.assertEqual(emp, hashlib.pbkdf2_hmac("sha256", b"un-mot-de-passe-test", bytes.fromhex(sel), int(it)).hex())

    def test_visit_data_is_never_deployed(self):
        mod = _module("deploy_ftps", ROOT / "scripts" / "deploy_ftps.py")
        visites = SITE / "visites"
        created = not visites.exists()
        visites.mkdir(exist_ok=True)
        probe = visites / "2026-01.csv"
        probe.write_text("x\n")
        try:
            self.assertNotIn(probe, mod.files_to_send(False, True))
        finally:
            probe.unlink()
            if created:
                visites.rmdir()


if __name__ == "__main__":
    unittest.main()
