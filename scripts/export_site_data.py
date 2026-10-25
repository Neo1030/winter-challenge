"""Génère le fichier de données du site (site/donnees/saison.json) à partir de l'API SGT ou d'un fichier déjà téléchargé.

Exemples :
  python3 scripts/export_site_data.py --tour 3910:Hommes --tour 3911:Femmes --tour 3912:Seniors   (production)
  python3 scripts/export_site_data.py --depuis-fichier data/sgt_demo_site.json --demo               (démonstration)

Le parcours de la semaine vient de config/prochain_parcours.json (voir le skill choix-parcours).
Le site ne contient aucun identifiant : la clé de l'API SGT ne quitte jamais cet ordinateur.
"""

import argparse
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from build_workbook import read_players_file  # noqa: E402
from winter_challenge import parcours  # noqa: E402
from winter_challenge.season import build_season  # noqa: E402
from winter_challenge.site_export import build_site_data  # noqa: E402
from winter_challenge.sgt_api import SgtApiError, SgtClient  # noqa: E402

DEMO_COURSE = {
    "nom": "La Cala Resort - Americas", "lieu": "Mijas, Málaga, Espagne", "par": 72, "difficulte": 4.3,
    "styles": ["Mountain"], "neuf": "Front", "longueur_jaune_m": 5370, "vent": "NoWind",
    "description": "Fairways larges, peu de bunkers et des petits greens surélevés : un parcours accueillant avec de la vue.",
    "lien_carte": "https://simulatorgolftour.com/public/assets/courseImages/scorecards/scorecard_3076.jpg?v=1.1",
    "lien_video": None,
}


def next_course_from_config(path=parcours.NEXT_FILE):
    """Parcours de la semaine, avec les clés en français lues par le site."""
    if not os.path.exists(path):
        return None
    with open(path, encoding="utf-8") as f:
        c = json.load(f)
    return {
        "nom": c["name"], "lieu": c.get("location"), "semaine": c.get("week"), "neuf": c.get("nine"), "par": c.get("par"),
        "difficulte": c.get("difficulty"), "styles": c.get("styles", []), "longueur_jaune_m": c.get("yellow_length_m"),
        "vent": c.get("wind"), "description": c.get("description"), "lien_carte": c.get("scorecard_url"),
        "lien_video": c.get("video_url"), "choisi_le": c.get("chosen_on"),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--tour", action="append", metavar="ID:CATEGORIE")
    parser.add_argument("--depuis-fichier", metavar="JSON")
    parser.add_argument("--saison", default="2026-2027")
    parser.add_argument("--sortie", default="site/donnees/saison.json")
    parser.add_argument("--joueurs", metavar="CSV")
    parser.add_argument("--demo", action="store_true", help="marque les données comme fictives et ajoute un parcours d'exemple")
    args = parser.parse_args()

    try:
        if args.depuis_fichier:
            with open(args.depuis_fichier, encoding="utf-8") as f:
                tours = json.load(f)
        else:
            if not args.tour:
                sys.exit("Indique au moins un tour : --tour 3910:Hommes")
            client = SgtClient.from_env()
            tours = [client.fetch_tour(int(t.partition(":")[0]), t.partition(":")[2] or t) for t in args.tour]
    except SgtApiError as e:
        sys.exit(f"Erreur API : {e}")

    overrides = read_players_file(args.joueurs) if args.joueurs else None
    season = build_season(tours, overrides)
    next_course = dict(DEMO_COURSE) if args.demo else next_course_from_config()
    if args.demo and next_course:
        next_course["semaine"] = max(w.number for w in season.weeks) + 1  # le parcours choisi est celui de la prochaine semaine
    data = build_site_data(season, args.saison, next_course, demo=args.demo)

    os.makedirs(os.path.dirname(args.sortie), exist_ok=True)
    with open(args.sortie, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    print(f"{len(data['joueurs'])} joueurs, {len(data['semaines'])} semaines, {len(data['categories'])} catégories -> {args.sortie}")


if __name__ == "__main__":
    main()
