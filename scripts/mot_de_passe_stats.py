"""Choisit le mot de passe de la page des visites (site/stats.php).

Usage (dans un terminal : le mot de passe est tapé au clavier, jamais écrit nulle part) :
  python3 scripts/mot_de_passe_stats.py

Écrit site/stats-cle.php avec l'empreinte du mot de passe seulement (PBKDF2-SHA256, sel aléatoire), pas le mot de passe.
Ce fichier reste hors de Git (.gitignore) : envoie-le à la main avec python3 scripts/deploy_ftps.py (mot de passe FTP
tapé au clavier). La mise en ligne automatique ne l'efface pas. L'ancien mot de passe cesse de marcher dès l'envoi.
"""

import getpass
import hashlib
import secrets
import sys
from pathlib import Path

CIBLE = Path(__file__).resolve().parent.parent / "site" / "stats-cle.php"
ITERATIONS = 300_000
LONGUEUR_MIN = 10


def empreinte(mot_de_passe, sel, iterations=ITERATIONS):
    """Même calcul que hash_pbkdf2('sha256', $mdp, $sel, $iterations) en PHP (résultat en hexadécimal)."""
    return hashlib.pbkdf2_hmac("sha256", mot_de_passe.encode("utf-8"), sel, iterations).hex()


def contenu(mot_de_passe):
    sel = secrets.token_bytes(16)
    return (
        "<?php\n"
        "// Empreinte du mot de passe de stats.php (pas le mot de passe). Créé par scripts/mot_de_passe_stats.py.\n"
        f"return ['sel' => '{sel.hex()}', 'iterations' => {ITERATIONS}, 'empreinte' => '{empreinte(mot_de_passe, sel)}'];\n"
    )


def main():
    mdp = getpass.getpass("Nouveau mot de passe de la page des visites : ")
    if len(mdp) < LONGUEUR_MIN:
        print(f"Trop court : au moins {LONGUEUR_MIN} caractères.")
        return 1
    if getpass.getpass("Le même, une deuxième fois : ") != mdp:
        print("Les deux saisies ne sont pas identiques : rien n'est changé.")
        return 1
    CIBLE.write_text(contenu(mdp), encoding="utf-8")
    print(f"Empreinte écrite dans {CIBLE.relative_to(CIBLE.parent.parent)}. Mise en ligne : python3 scripts/deploy_ftps.py (hors Git).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
