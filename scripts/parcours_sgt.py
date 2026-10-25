"""Présélection de parcours SGT pour le Winter Challenge.

  python3 scripts/parcours_sgt.py liste --difficulte moyen --style links montagne --zone suisse europe --limite 16
  python3 scripts/parcours_sgt.py choisir 1416 --semaine 3 --neuf Front
  python3 scripts/parcours_sgt.py prochain

Critères de `liste` (tous facultatifs) :
  --difficulte facile|moyen|difficile (plusieurs possibles)
  --style links|montagne|parkland|spectaculaire|tournoi (plusieurs possibles)
  --zone suisse|europe|amerique-nord|monde|fictif (plusieurs possibles ; europe comprend la Suisse)
  --pays MOT [MOT ...]    pays, régions ou villes à retenir (mots cherchés dans le lieu : spain portugal algarve) ;
                          s'additionne à --zone
  --inclure-joues         ne pas écarter les parcours déjà joués (config/parcours_joues.txt)
  --video-seulement       uniquement les parcours avec une vidéo de survol officielle SGT
  --tournoi               favoriser les parcours Tour Stop et Major Venue
La sortie est en JSON ; les longueurs se lisent ensuite sur l'image de la carte de score (scorecard_url).
"""

import argparse
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from winter_challenge import parcours as p  # noqa: E402


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="cmd", required=True)

    liste = sub.add_parser("liste")
    liste.add_argument("--difficulte", nargs="*", choices=["facile", "moyen", "difficile"])
    liste.add_argument("--style", nargs="*", choices=list(p.STYLE_GROUPS))
    liste.add_argument("--zone", nargs="*", choices=p.ZONES)
    liste.add_argument("--pays", nargs="*", help="mots cherchés dans le lieu (spain portugal algarve…)")
    liste.add_argument("--inclure-joues", action="store_true")
    liste.add_argument("--video-seulement", action="store_true")
    liste.add_argument("--tournoi", action="store_true")
    liste.add_argument("--limite", type=int, default=16)
    liste.add_argument("--actualiser", action="store_true", help="recharge la liste depuis SGT")

    choisir = sub.add_parser("choisir")
    choisir.add_argument("id", type=int)
    choisir.add_argument("--semaine", type=int, required=True)
    choisir.add_argument("--neuf", choices=["Front", "Back", "All"], default="Front")
    choisir.add_argument("--longueur-jaune-m", type=int, help="longueur 18 trous du départ jaune, en mètres (lue sur la carte)")
    choisir.add_argument("--vent", help="vent conseillé (NoWind, Calm, Breezy…)")
    choisir.add_argument("--description", help="une phrase de présentation, affichée sur le site")

    sub.add_parser("prochain")
    args = parser.parse_args()

    if args.cmd == "prochain":
        if not os.path.exists(p.NEXT_FILE):
            sys.exit("Aucun prochain parcours enregistré.")
        print(open(p.NEXT_FILE, encoding="utf-8").read())
        return

    data = p.fetch_list(force=getattr(args, "actualiser", False))
    courses = p.parse_courses(data, p.read_played())
    if args.cmd == "choisir":
        course = next((c for c in courses if c.id == args.id), None)
        if course is None:
            sys.exit(f"Parcours {args.id} introuvable")
        extra = {"yellow_length_m": args.longueur_jaune_m, "wind": args.vent, "description": args.description}
        print(json.dumps(p.choose(course, args.semaine, args.neuf, extra=extra), ensure_ascii=False, indent=1))
        return

    picked = p.select(courses, difficulty=args.difficulte, style_groups=args.style, zones=args.zone, places=args.pays,
                      exclude_played=not args.inclure_joues, official_video_only=args.video_seulement,
                      prefer_tournament=args.tournoi, limit=args.limite)
    print(json.dumps({"liste_du": data["updated"], "nb_parcours_sgt": len(courses), "nb_retenus": len(picked),
                      "parcours": [c.as_dict() for c in picked]}, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
