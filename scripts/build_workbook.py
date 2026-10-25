"""Construit le classeur du Winter Challenge à partir de l'API SGT.

Exemples :
  python3 scripts/build_workbook.py --tour 3901:Test --saison 2026-2027 --sortie Winter-Challenge_Test.xlsx
  python3 scripts/build_workbook.py --tour 3910:Hommes --tour 3911:Femmes --tour 3912:Seniors   (production)
  python3 scripts/build_workbook.py --depuis-fichier data/sgt_brut.json     (sans appeler l'API)

Fichier joueurs optionnel (--joueurs) : colonnes pseudo;categorie;handicap_reel
"""

import argparse
import csv
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from winter_challenge.excel_export import write_workbook  # noqa: E402
from winter_challenge.season import build_season  # noqa: E402
from winter_challenge.sgt_api import SgtApiError, SgtClient  # noqa: E402


def read_players_file(path):
    """pseudo -> {category, real_hcp}, clés en minuscules pour tolérer les différences de casse."""
    with open(path, encoding="utf-8-sig") as f:
        sample = f.read(2048)
        f.seek(0)
        reader = csv.DictReader(f, delimiter=";" if sample.count(";") >= sample.count(",") else ",")
        out = {}
        for row in reader:
            real = (row.get("handicap_reel") or "").replace(",", ".").strip()
            out[row["pseudo"].strip().lower()] = {
                "category": (row.get("categorie") or "").strip() or None,
                "real_hcp": float(real) if real else None,
            }
    return out


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--tour", action="append", metavar="ID:CATEGORIE", help="tour SGT et nom de sa catégorie")
    parser.add_argument("--depuis-fichier", metavar="JSON", help="reprend les données déjà téléchargées")
    parser.add_argument("--saison", default="2026-2027")
    parser.add_argument("--sortie", default="Winter-Challenge_Test.xlsx")
    parser.add_argument("--joueurs", metavar="CSV")
    parser.add_argument("--tentatives", type=int, default=10, help="tentatives comptées par joueur et par semaine")
    parser.add_argument("--meilleurs", type=int, default=8, help="nombre de résultats comptés au classement")
    args = parser.parse_args()

    raw_path = "data/sgt_brut.json"
    try:
        if args.depuis_fichier:
            with open(args.depuis_fichier, encoding="utf-8") as f:
                tours = json.load(f)
        else:
            if not args.tour:
                sys.exit("Indique au moins un tour : --tour 3901:Test")
            client = SgtClient.from_env()
            tours = []
            for spec in args.tour:
                tour_id, _, label = spec.partition(":")
                tours.append(client.fetch_tour(int(tour_id), label or f"Tour {tour_id}"))
            os.makedirs("data", exist_ok=True)
            with open(raw_path, "w", encoding="utf-8") as f:
                json.dump(tours, f, ensure_ascii=False, indent=1)
    except SgtApiError as e:
        sys.exit(f"Erreur API : {e}")

    overrides = read_players_file(args.joueurs) if args.joueurs else None
    season = build_season(tours, overrides, args.tentatives, args.meilleurs)
    write_workbook(season, tours, args.saison, args.sortie)
    print(f"{len(season.players)} joueurs, {len(season.weeks)} semaines, {len(season.attempts)} résultats")
    print(f"Classeur enregistré : {args.sortie}")


if __name__ == "__main__":
    main()
