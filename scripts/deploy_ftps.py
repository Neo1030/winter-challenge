"""Met en ligne le dossier site/ chez Infomaniak par FTPS (FTP avec chiffrement TLS explicite).

Usage :
  python3 scripts/deploy_ftps.py                 # demande le mot de passe au clavier (jamais écrit nulle part)
  python3 scripts/deploy_ftps.py --essai         # liste ce qui serait envoyé, sans rien envoyer
  python3 scripts/deploy_ftps.py --donnees-seules  # envoie seulement donnees/saison.json (mise à jour des résultats)
  python3 scripts/deploy_ftps.py --donnees-seules --si-change   # idem, mais seulement si les résultats ont changé en ligne

Réglages par variables d'environnement (ou fichier .env, qui n'est jamais poussé sur GitHub) :
  FTP_HOST      par défaut x12b2.ftp.infomaniak.com
  FTP_USER      par exemple x12b2_winterchallenge
  FTP_PASSWORD  si absent, demandé au clavier
  SITE_URL      adresse du site, pour --si-change (par défaut https://winterchallenge.letsgolf.ch)
"""

import argparse
import getpass
import json
import os
import sys
import time
import urllib.request
from ftplib import FTP_TLS, error_perm
from pathlib import Path

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from winter_challenge.sgt_api import load_env  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
SITE = ROOT / "site"
SKIP = {".DS_Store", "LISEZ-MOI.md"}   # fichiers qui n'ont rien à faire en ligne


def files_to_send(only_data):
    if only_data:
        return [SITE / "donnees" / "saison.json"]
    return sorted(p for p in SITE.rglob("*") if p.is_file() and p.name not in SKIP)


def unchanged_online(url):
    """Vrai si le saison.json en ligne contient déjà les mêmes résultats (la date de génération ne compte pas)."""
    def content(raw):
        data = json.loads(raw)
        data.pop("genere_le", None)
        return data
    try:
        with urllib.request.urlopen(url + "?v=" + str(int(time.time())), timeout=20) as r:
            online = content(r.read())
        return online == content((SITE / "donnees" / "saison.json").read_bytes())
    except (OSError, ValueError):
        return False                 # injoignable ou illisible : dans le doute, on envoie


def ensure_dir(ftp, parts):
    """Crée les dossiers distants un par un (ignore ceux qui existent déjà)."""
    ftp.cwd("/")
    for part in parts:
        try:
            ftp.cwd(part)
        except error_perm:
            ftp.mkd(part)
            ftp.cwd(part)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--essai", action="store_true")
    parser.add_argument("--donnees-seules", action="store_true")
    parser.add_argument("--si-change", action="store_true", help="n'envoie rien si les résultats en ligne sont déjà à jour")
    args = parser.parse_args()

    load_env()
    files = files_to_send(args.donnees_seules)
    if args.essai:
        for p in files:
            print(p.relative_to(SITE))
        print(f"{len(files)} fichiers (essai, rien envoyé)")
        return 0

    if args.si_change and args.donnees_seules:
        site_url = os.environ.get("SITE_URL", "https://winterchallenge.letsgolf.ch").rstrip("/")
        if unchanged_online(site_url + "/donnees/saison.json"):
            print("Résultats inchangés : rien à envoyer.")
            return 0

    host = os.environ.get("FTP_HOST", "x12b2.ftp.infomaniak.com")
    user = os.environ.get("FTP_USER") or input("Utilisateur FTP [x12b2_winterchallenge] : ").strip() or "x12b2_winterchallenge"
    password = os.environ.get("FTP_PASSWORD") or getpass.getpass("Mot de passe FTP : ")

    ftp = FTP_TLS(host, timeout=30)
    ftp.login(user, password)
    ftp.prot_p()                      # chiffre aussi le transfert des fichiers
    print(f"Connecté à {host} en {user}, dossier de départ : {ftp.pwd()}")

    for p in files:
        rel = p.relative_to(SITE)
        ensure_dir(ftp, list(rel.parts[:-1]))
        tmp = rel.name + ".tmp"           # envoi sous un nom provisoire : un visiteur ne lit jamais un fichier à moitié reçu
        with open(p, "rb") as f:
            ftp.storbinary(f"STOR {tmp}", f)
        try:
            ftp.rename(tmp, rel.name)
        except error_perm:            # le serveur refuse d'écraser : on supprime l'ancien puis on renomme
            ftp.delete(rel.name)
            ftp.rename(tmp, rel.name)
        print("envoyé :", rel)
    ftp.quit()
    print(f"{len(files)} fichiers envoyés.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
