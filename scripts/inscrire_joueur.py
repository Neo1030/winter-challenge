"""Crée un joueur SGT (s'il n'existe pas) et l'inscrit à un ou plusieurs tours du club.

Usage :
  python3 scripts/inscrire_joueur.py --pseudo Neo_Golfer1 --email nom@exemple.ch --tour 3901
  python3 scripts/inscrire_joueur.py --pseudo Neo_Golfer1 --email nom@exemple.ch --tour 3910 3909 --simuler

Le compte est créé avec un mot de passe aléatoire que personne ne connaît : le joueur choisit le sien avec « mot de passe
oublié » sur simulatorgolftour.com (l'e-mail sert à ça). Si le pseudo et l'e-mail appartiennent déjà au même compte SGT,
aucun compte n'est créé : le joueur est seulement ajouté au club et aux tours. --simuler affiche ce qui serait fait.
Les identifiants de l'API viennent du fichier .env.
"""

import argparse
import os
import secrets
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from winter_challenge.sgt_api import SgtApiError, SgtClient  # noqa: E402


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--pseudo", required=True, help="nom d'utilisateur SGT (identique dans GSPro)")
    parser.add_argument("--email", required=True)
    parser.add_argument("--tour", type=int, nargs="+", required=True, help="un ou plusieurs identifiants de tour")
    parser.add_argument("--simuler", action="store_true", help="ne rien écrire chez SGT")
    args = parser.parse_args()
    try:
        client = SgtClient.from_env()
        check = client.check_user(args.pseudo, args.email)
        user_id = check.get("user_id") or 0
        if user_id:
            print(f"Compte SGT existant (pseudo et e-mail concordent) : id {user_id}.")
        elif not check.get("username_available"):
            sys.exit("Ce pseudo est déjà pris par un autre compte SGT.")
        elif not check.get("email_available"):
            sys.exit("Cet e-mail est déjà utilisé par un autre compte SGT.")
        else:
            print("Pseudo et e-mail libres : un compte SGT sera créé.")
        if args.simuler:
            print(f"Simulation : rien écrit. Tours visés : {args.tour}.")
            return
        if not user_id:
            res = client.register_user(args.pseudo, args.email, secrets.token_urlsafe(12))
            if not res.get("successful"):
                sys.exit(f"Création refusée : {res.get('feedback')}")
            print(f"Compte créé, game ID {res['userData']['user_game_id']}.")
            user_id = client.check_user(args.pseudo, args.email).get("user_id")
            if not user_id:
                sys.exit("Compte créé, mais son identifiant n'est pas encore lisible : réessaie dans un moment.")
        else:
            print("Club :", client.add_club_member(user_id).get("feedback"))
        for tour in args.tour:
            res = client.add_tour_member(tour, user_id)
            print(f"Tour {tour} :", res.get("feedback"))
    except SgtApiError as e:
        sys.exit(f"Erreur API : {e}")


if __name__ == "__main__":
    main()
