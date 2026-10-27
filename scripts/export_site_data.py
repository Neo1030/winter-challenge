"""Génère le fichier de données du site (site/donnees/saison.json) à partir de l'API SGT ou d'un fichier déjà téléchargé.

Exemples :
  python3 scripts/export_site_data.py --tour 3910:Hommes --tour 3911:Femmes --tour 3912:Seniors --tour 3909:Mixte:Short_Game

Un tour s'écrit ID:CATEGORIE, ou ID:CATEGORIE:COMPETITION pour une autre compétition que le Winter Challenge (par exemple le
Short Game). Les parcours d'une compétition sont ceux de son premier tour (les Hommes).
  python3 scripts/export_site_data.py --depuis-fichier data/sgt_demo_site.json --demo               (démonstration)

Le parcours de la semaine vient de config/prochain_parcours.json (voir le skill choix-parcours).
Le site ne contient aucun identifiant : la clé de l'API SGT ne quitte jamais cet ordinateur.
"""

import argparse
import json
import os
import sys
import urllib.request
from datetime import datetime
from zoneinfo import ZoneInfo

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
        return parcours.site_course(json.load(f))


COMPETITIONS = {"Winter Challenge": "WC", "Short Game": "SG"}  # préfixe des semaines ; une autre compétition prend ses initiales


def prefix_of(competition):
    return COMPETITIONS.get(competition) or "".join(w[0] for w in competition.split()).upper()


def parse_tour_spec(spec):
    """« 3909:Mixte:Short_Game » -> (3909, "Mixte", "Short Game") ; sans compétition : le Winter Challenge.

    Le tiret bas remplace l'espace : la liste des tours de GitHub est découpée aux espaces.
    """
    tour_id, _, rest = spec.partition(":")
    label, _, competition = rest.partition(":")
    return int(tour_id), label or tour_id, (competition or "Winter Challenge").replace("_", " ")


def published_settings(site_url=None, path="site/donnees/saison.json"):
    """Réglages de tournois déjà publiés {id de tournoi: réglages} : on ne relit pas chez SGT un tournoi terminé.

    Source : le fichier en ligne (SITE_URL) quand on tourne chez GitHub, sinon le fichier local. Sans fichier : rien.
    """
    try:
        if site_url:
            with urllib.request.urlopen(site_url.rstrip("/") + "/donnees/saison.json", timeout=20) as r:
                published = json.load(r)
        else:
            with open(path, encoding="utf-8") as f:
                published = json.load(f)
    except (OSError, ValueError):
        return {}
    lists = [published.get("parcours")] + [c.get("parcours") for c in published.get("competitions_autres") or []]
    entries = [e for lst in lists for e in (lst if isinstance(lst, list) else [])]  # (l'ancien format : un dict par catégorie)
    return {e["tournoi_id"]: e["reglages"] for e in entries
            if e.get("statut") == "terminee" and e.get("reglages") and e.get("tournoi_id")}


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
            known = published_settings(os.environ.get("SITE_URL"), args.sortie)
            tours = []
            for spec in args.tour:
                tour_id, label, competition = parse_tour_spec(spec)
                tour = client.fetch_tour(tour_id, label, known)
                tour["competition"] = competition
                tours.append(tour)
    except SgtApiError as e:
        sys.exit(f"Erreur API : {e}")

    overrides = read_players_file(args.joueurs) if args.joueurs else None
    today = datetime.now(ZoneInfo("Europe/Zurich")).date()  # la semaine en cours se juge à la date du jour, heure de Suisse
    groups = {}
    for tour in tours:
        groups.setdefault(tour.get("competition") or "Winter Challenge", []).append(tour)
    seasons = {name: build_season(group, overrides, today=today) for name, group in groups.items()}
    season = seasons.pop("Winter Challenge", None)
    if season is None:
        sys.exit("Il faut au moins un tour du Winter Challenge (sans nom de compétition).")
    next_course = dict(DEMO_COURSE) if args.demo else next_course_from_config()
    if args.demo and next_course:
        next_course["semaine"] = max(w.number for w in season.weeks) + 1  # le parcours choisi est celui de la prochaine semaine
    data = build_site_data(season, args.saison, next_course, demo=args.demo,
                           history=[] if args.demo else parcours.read_history(),
                           autres=[(name, prefix_of(name), other) for name, other in seasons.items()])

    os.makedirs(os.path.dirname(args.sortie), exist_ok=True)
    with open(args.sortie, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    print(f"{len(data['joueurs'])} joueurs, {len(data['semaines'])} semaines, {len(data['categories'])} catégories -> {args.sortie}")
    for other in data["competitions_autres"]:
        print(f"  + {other['nom']} : {len(other['joueurs'])} joueurs, {len(other['semaines'])} manches")


if __name__ == "__main__":
    main()
