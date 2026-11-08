"""Durée d'un tour complet de la page télé (tv.html et tvreduit.html), d'après les joueurs inscrits : à reporter dans Zebrix.

Usage :
  python3 scripts/duree_tv.py              # durée par page de 10 s (défaut de la page)
  python3 scripts/duree_tv.py --duree 12

Hypothèse : tous les inscrits ont joué (c'est le maximum ; avant leurs premiers résultats, la télé affiche moins de pages).
Pages : pour chaque catégorie du Winter Challenge, le classement net puis le brut, 9 joueurs par page (mesuré sur un écran de
1080 pixels de haut, pareil pour les deux pages), puis une page de statistiques par catégorie ; ensuite le Short Game (tous
les inscrits, classement brut seulement) et sa page de statistiques. Les inscrits sont ceux de config/joueurs.csv.
La page télé l'affiche aussi elle-même, d'après les résultats réels : tv.html?debug=1.
"""

import argparse
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from winter_challenge.inscription import read_players_csv  # noqa: E402

ROWS_PER_PAGE = 9


def pages(players: dict) -> tuple[int, list]:
    by_cat = {}
    for row in players.values():
        by_cat[row["categorie"]] = by_cat.get(row["categorie"], 0) + 1
    lines, total = [], 0
    for cat in ("Hommes", "Femmes", "Seniors"):
        n = by_cat.get(cat, 0)
        if n:
            p = 2 * math.ceil(n / ROWS_PER_PAGE) + 1      # net + brut + statistiques
            lines.append(f"Winter Challenge {cat} : {n} joueurs -> {p} pages")
            total += p
    n = len(players)
    if n:
        p = math.ceil(n / ROWS_PER_PAGE) + 1              # brut seulement + statistiques
        lines.append(f"Short Game : {n} joueurs -> {p} pages")
        total += p
    return total, lines


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--duree", type=float, nargs="*", default=[10], help="secondes par page (défaut : 10, comme la page télé)")
    args = parser.parse_args()
    total, lines = pages(read_players_csv())
    print("\n".join(lines))
    for d in args.duree:
        print(f"{total} pages × {d:g} s = {round(total * d)} s pour un tour complet")


if __name__ == "__main__":
    main()
