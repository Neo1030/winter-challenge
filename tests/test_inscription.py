import csv
import os
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from winter_challenge import inscription as ins  # noqa: E402


def write_csv(rows, delimiter=";"):
    f = tempfile.NamedTemporaryFile("w", suffix=".csv", delete=False, encoding="utf-8", newline="")
    csv.writer(f, delimiter=delimiter).writerows(rows)
    f.close()
    return f.name


class ReadingTest(unittest.TestCase):
    def test_titres_libres_et_categories_reconnues(self):
        path = write_csv([["Surnom", "Mail", "Prénom", "Nom", "Handicap réel", "Homme/Femme/Senior"],
                          ["Neo_Goler", "a@b.ch", "Mike", "Favre", "11,5", "homme"],
                          ["Ana_G", "ana@b.ch", "Ana", "Gris", "20", "Dame"],
                          ["Old_Pro", "old@b.ch", "Paul", "Vieux", "8", "Senior"]])
        players = ins.read_file(path)
        self.assertEqual([p.categorie for p in players], ["Hommes", "Femmes", "Seniors"])
        self.assertEqual(players[0].handicap, 11.5)
        self.assertEqual(ins.check_batch(players), [])

    def test_ce_qui_manque_est_signale_avec_la_ligne(self):
        path = write_csv([["pseudo", "email", "prenom", "nom", "handicap", "categorie"],
                          ["Ana_G", "", "Ana", "Gris", "", "Femme"]])
        problems = ins.check_batch(ins.read_file(path))
        self.assertTrue(any("adresse e-mail" in m and "ligne 2" in m for m in problems), problems)
        self.assertTrue(any("handicap réel" in m for m in problems), problems)

    def test_invalides_et_doublons(self):
        path = write_csv([["pseudo", "email", "prenom", "nom", "handicap", "categorie"],
                          ["Ana G", "pas-un-mail", "Ana", "Gris", "12", "Femme"],
                          ["Bob_B", "bob@b.ch", "Bob", "Brun", "12", "Martien"],
                          ["bob_b", "bob@b.ch", "Bob", "Brun", "50", "Homme"]])
        text = "\n".join(ins.check_batch(ins.read_file(path)))
        for expected in ("pseudo « Ana G » invalide", "adresse e-mail « pas-un-mail » invalide", "catégorie « Martien » non reconnue",
                         "pseudo en double", "e-mail en double", "hors de la plage"):
            self.assertIn(expected, text)

    def test_handicap_plus_et_virgule(self):
        self.assertEqual(ins.parse_handicap("+2"), (-2.0, "handicap plus (+2) : compté comme -2"))
        self.assertEqual(ins.parse_handicap("14,3"), (14.3, None))
        self.assertEqual(ins.parse_handicap(""), (None, None))
        self.assertEqual(ins.parse_handicap(0), (0.0, None))   # un handicap de 0 est une valeur, pas un oubli

    def test_tours_du_joueur(self):
        p = ins.from_row({"pseudo": "Neo_Goler", "email": "a@b.ch", "prenom": "M", "nom": "F", "handicap": "11.5", "categorie": "Homme"})
        self.assertEqual(ins.tours_of(p), [(3910, 12), (3909, 0)])   # 11,5 arrondi à 12 ; Short Game toujours à 0


class FilesTest(unittest.TestCase):
    def test_fichier_des_handicaps_n_ecrase_jamais(self):
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "joueurs.csv"
            p = ins.from_row({"pseudo": "Neo_Goler", "email": "a@b.ch", "prenom": "M", "nom": "F", "handicap": "11", "categorie": "Homme"})
            self.assertTrue(ins.add_to_players_csv(p, path))
            p.handicap = 3
            self.assertFalse(ins.add_to_players_csv(p, path))   # déjà présent : inchangé
            self.assertEqual(path.read_text(encoding="utf-8"), "pseudo;categorie;handicap_reel\nNeo_Goler;Hommes;11\n")
            self.assertEqual(ins.read_players_csv(path)["neo_goler"]["handicap_reel"], "11")

    def test_journal_d_identite_une_ligne_par_pseudo(self):
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "data" / "inscrits.csv"
            p = ins.from_row({"pseudo": "Neo_Goler", "email": "a@b.ch", "prenom": "M", "nom": "F", "handicap": "11", "categorie": "Homme"})
            ins.log_player(p, 51598, 26781404420858008, path)
            ins.log_player(p, 51598, None, path)
            lines = path.read_text(encoding="utf-8").splitlines()
            self.assertEqual(len(lines), 2)
            self.assertTrue(lines[0].startswith("pseudo;prenom;nom;email"))


if __name__ == "__main__":
    unittest.main()
