"""Inscrit des joueurs au Winter Challenge et au Short Game : compte SGT, tours, tournois, fichier des handicaps.

Une liste (Excel ou CSV) ou un seul joueur donné en options. Six informations par joueur, toutes obligatoires :
pseudo, e-mail, prénom, nom, handicap réel, catégorie (Homme, Femme ou Senior).

Usage :
  python3 scripts/inscrire_joueurs.py --fichier inscriptions.xlsx --simuler     # contrôle et montre ce qui serait fait
  python3 scripts/inscrire_joueurs.py --fichier inscriptions.xlsx               # fait pour de bon
  python3 scripts/inscrire_joueurs.py --pseudo Neo_Goler --email nom@exemple.ch --prenom Mike --nom Favre --handicap 11 --categorie Homme
  python3 scripts/inscrire_joueurs.py --completer [--simuler]                   # inscrit les membres aux tournois où ils manquent

Code de sortie : 0 tout va bien ; 2 des informations manquent ou sont invalides (rien n'est écrit) ; 1 erreur SGT.
Le compte SGT est créé avec un mot de passe aléatoire que personne ne connaît : le joueur choisit le sien avec « mot de passe
oublié » sur simulatorgolftour.com. Ce qui existe déjà n'est jamais modifié. Les identifiants de l'API viennent du fichier .env.
Après une inscription, commite et pousse config/joueurs.csv : la mise à jour automatique des résultats le lit.
"""

import argparse
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from winter_challenge import inscription  # noqa: E402
from winter_challenge.sgt_api import SgtApiError, SgtClient  # noqa: E402


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--fichier", help="liste Excel (.xlsx) ou CSV, titres de colonnes sur la première ligne")
    for name in inscription.FIELDS:
        parser.add_argument(f"--{name}", help=f"un seul joueur : {inscription.LABELS[name]}")
    parser.add_argument("--completer", action="store_true", help="inscrit les membres des tours aux tournois où ils manquent")
    parser.add_argument("--simuler", action="store_true", help="contrôle tout et n'écrit rien (ni chez SGT, ni dans les fichiers)")
    args = parser.parse_args()

    if args.completer:
        try:
            n = inscription.complete_registrations(SgtClient.from_env(), args.simuler, print)
        except SgtApiError as e:
            sys.exit(f"Erreur API : {e}")
        print(f"{n} inscription(s) {'à faire' if args.simuler else 'faite(s)'}.")
        return 0

    players = []
    if args.fichier:
        players += inscription.read_file(args.fichier)
    single = {name: getattr(args, name) for name in inscription.FIELDS}
    if any(single.values()):
        players.append(inscription.from_row(single, "options"))
    if not players:
        parser.error("donne --fichier ou les informations d'un joueur (--pseudo, --email, --prenom, --nom, --handicap, --categorie)")

    problems = inscription.check_batch(players)
    if problems:
        print("Informations manquantes ou invalides, rien n'a été fait :")
        for line in problems:
            print("  -", line)
        return 2

    print(f"{len(players)} joueur(s) à inscrire :")
    for p in players:
        extra = f"  [{' ; '.join(p.notes)}]" if p.notes else ""
        print(f"  {p.pseudo} · {p.prenom} {p.nom} · {p.email} · {p.categorie} · handicap réel {p.handicap:g}{extra}")
    client = SgtClient.from_env()
    failed = 0
    for p in players:
        print(f"\n{p.pseudo} ({p.categorie}, handicap {p.handicap:g}) :")
        try:
            inscription.register_player(client, p, args.simuler, print)
        except SgtApiError as e:
            failed += 1
            print(f"  ERREUR : {e}")
    print(f"\n{'Simulation terminée, rien écrit' if args.simuler else 'Terminé'} : {len(players) - failed} joueur(s) traité(s), {failed} en erreur.")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
