"""Simule une saison complète (joueurs fictifs, scorecards au format SGT) pour tester le classeur et le site, sans appeler l'API.

Usage :
  python3 scripts/simulate_season.py chemin/ancien.xlsm          # écrit data/sgt_simule.json (1 catégorie, 22 joueurs)
  python3 scripts/simulate_season.py chemin/ancien.xlsm --site   # écrit data/sgt_demo_site.json (3 catégories, 60 joueurs)
  python3 scripts/simulate_season.py chemin/ancien.xlsm --site --short-game 20   # + un Short Game mensuel de 20 joueurs
  python3 scripts/build_workbook.py --depuis-fichier data/sgt_simule.json --sortie Winter-Challenge_Simulation.xlsx

Les parcours (pars et index des trous) viennent de la feuille Courses de l'ancien classeur.
Chaque score d'un trou reste entre -2 et +7 par rapport au par.
"""

import argparse
import json
import os
import random
import sys
from datetime import date, timedelta

import openpyxl

MIN_DIFF, MAX_DIFF = -2, 7
TEES = ["White", "Yellow", "Blue", "Black", "Red"]
# Catégories de la démonstration du site : (nom, nombre de joueurs, plage de handicap réel)
SITE_CATEGORIES = [("Hommes", 30, (3, 24)), ("Femmes", 18, (10, 36)), ("Seniors", 12, (8, 30))]
PSEUDO_START = ["Birdie", "Eagle", "Fairway", "Putt", "Bunker", "Drive", "Green", "Chip", "Wedge", "Links", "Alpine", "Swiss",
                "Mulligan", "Slice", "Hook", "Fade", "Draw", "Tee", "Pin", "Iron", "Par", "Bogey", "Ace", "Caddie", "Leman",
                "Vaud", "Jura", "Riviera", "Sand", "Birdy"]
PSEUDO_END = ["Baron", "Fox", "Panda", "Wizard", "King", "Hunter", "Master", "Ghost", "Legend", "Saver", "Buster", "Ranger",
              "Pilot", "Rocket", "Wolf", "Falcon", "Tiger", "Queen"]


def demo_pseudos(rng, count):
    """Pseudos fictifs de style GSPro, tous différents."""
    names = set()
    while len(names) < count:
        name = rng.choice(PSEUDO_START) + rng.choice(PSEUDO_END)
        names.add(name + f"_{rng.randint(10, 99)}" if rng.random() < .3 else name)
    return sorted(names, key=lambda _: rng.random())


def load_courses(path):
    wb = openpyxl.load_workbook(path, data_only=True)
    courses = []
    for row in wb["Courses"].iter_rows(min_row=2, values_only=True):
        if row[1] and all(isinstance(v, (int, float)) for v in list(row[2:11]) + list(row[12:21]) + list(row[23:41])):
            courses.append((row[1], list(row[2:11]) + list(row[12:21]), list(row[23:41])))
    return courses


def hole_score(rng, par, skill):
    diff = round(rng.gauss(skill, 1.1))
    return max(1, par + max(MIN_DIFF, min(MAX_DIFF, diff)))


def make_card(rng, card_id, name, course, pars, strokes, section, tee, skill, holes=None):
    played = range(0, 9) if section == "Front" else range(9, 18)
    if holes is not None:
        played = list(played)[:holes]
    card = {"tournamentScorecardId": card_id, "round": 1, "player_name": name, "courseName": course, "teetype": tee}
    for i in range(18):
        card[f"hole{i + 1}_gross"] = hole_score(rng, pars[i], skill) if i in played else 0
        card[f"h{i + 1}_Par"] = pars[i]
        card[f"h{i + 1}_index"] = strokes[i]
    return card


def simulate_tour(rng, courses, players, tour_id, label, weeks, card_start):
    """Un tour SGT fictif : players = {pseudo: handicap réel}."""
    tournaments, card_id = [], card_start
    for week in range(1, weeks + 1):
        course, pars, strokes = courses[(week - 1) % len(courses)]
        section = "Front" if week % 2 else "Back"
        start = date(2026, 11, 2) + timedelta(days=7 * (week - 1))
        cards = []
        for name, hcp in players.items():
            if rng.random() > 0.78:  # tous ne jouent pas toutes les semaines
                continue
            form = rng.gauss(0, 0.25)  # forme du jour
            tee = rng.choice(TEES)
            card_id += 1  # un seul tour par joueur et par semaine
            holes = 4 if rng.random() < 0.03 else None  # parfois un tour abandonné
            cards.append(make_card(rng, card_id, name, course, pars, strokes, section, tee,
                                   hcp / 18 + form + rng.gauss(0, 0.2), holes))
        tournaments.append({
            "tournamentId": tour_id * 100 + week, "tourId": tour_id, "tourType": "CLUB", "courseName": course,
            "name": f"Semaine {week}", "status": "In Progress" if week == weeks else "Completed",
            "start_date": f"{start} 00:00:00", "end_date": f"{start + timedelta(days=6)} 00:00:00", "scorecards": cards,
        })
    return {
        "tour_id": tour_id, "label": label, "name": f"Simulation {label}", "admin": "Lets_golf",
        "members": [{"user_name": "Lets_golf", "hcp_index": 0, "custom_hcp": None}]
        + [{"user_name": n, "hcp_index": h, "custom_hcp": h} for n, h in players.items()],
        "tournaments": tournaments,
    }, card_id


def simulate_short_game(rng, courses, players, tour_id, card_start, months=4):
    """Un tour Short Game fictif : un tournoi par mois, sur un parcours de petit jeu (9 trous), en « Mixte »."""
    tour, card_id = simulate_tour(rng, courses, players, tour_id, "Mixte", months, card_start)
    starts = [date(2026, 10, 23), date(2026, 11, 1), date(2026, 12, 1), date(2027, 1, 1)]
    for i, t in enumerate(tour["tournaments"]):
        start = starts[i] if i < len(starts) else date(2027, 1 + i - 3, 1)
        t["name"] = f"Short Game {start:%m.%Y}"
        t["start_date"] = f"{start} 00:00:00"
        t["end_date"] = f"{start + timedelta(days=29)} 00:00:00"
    tour["competition"] = "Short Game"
    return tour, card_id


def check_range(tours):
    """Contrôle de la plage des scores, trou par trou."""
    for tour in tours:
        for t in tour["tournaments"]:
            for c in t["scorecards"]:
                for i in range(1, 19):
                    g = c[f"hole{i}_gross"]
                    if g:
                        assert MIN_DIFF <= g - c[f"h{i}_Par"] <= MAX_DIFF or g == 1, (c["player_name"], i, g)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("classeur")
    parser.add_argument("--joueurs", type=int, default=20, help="joueurs fictifs en plus des 2 comptes de test")
    parser.add_argument("--semaines", type=int)
    parser.add_argument("--graine", type=int, default=42)
    parser.add_argument("--site", action="store_true", help="3 catégories et pseudos fictifs, pour la démonstration du site")
    parser.add_argument("--short-game", type=int, default=0, metavar="N", help="avec --site : ajoute un Short Game de N joueurs (parmi les 60)")
    parser.add_argument("--sortie")
    args = parser.parse_args()

    rng = random.Random(args.graine)
    courses = load_courses(args.classeur)
    rng.shuffle(courses)

    if args.site:
        weeks = args.semaines or 12
        pseudos = demo_pseudos(rng, sum(c[1] for c in SITE_CATEGORIES))
        tours, card_id = [], 100000
        for i, (label, count, (low, high)) in enumerate(SITE_CATEGORIES, start=1):
            players = {pseudos.pop(): rng.randint(low, high) for _ in range(count)}
            tour, card_id = simulate_tour(rng, courses, players, 9000 + i, label, weeks, card_id)
            tours.append(tour)
        if args.short_game:
            everyone = [n for t in tours for n in (m["user_name"] for m in t["members"][1:])]
            picked = {n: rng.randint(3, 30) for n in rng.sample(everyone, args.short_game)}
            tour, card_id = simulate_short_game(rng, courses, picked, 9100, card_id)
            tours.append(tour)
        out = args.sortie or "data/sgt_demo_site.json"
    else:
        weeks = args.semaines or 19
        players = {"Mike_LetsGolf": 10, "Mike_Lets_Golf": 6}
        for i in range(1, args.joueurs + 1):
            players[f"Joueur_{i:02d}"] = rng.randint(3, 30)
        tour, _ = simulate_tour(rng, courses, players, 9999, "Test", weeks, 100000)
        tours = [tour]
        out = args.sortie or "data/sgt_simule.json"

    check_range(tours)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w", encoding="utf-8") as f:
        json.dump(tours, f, ensure_ascii=False, indent=1)
    n_players = sum(len(t["members"]) - 1 for t in tours)
    n_cards = sum(len(x["scorecards"]) for t in tours for x in t["tournaments"])
    print(f"{n_players} joueurs, {weeks} semaines, {n_cards} scorecards simulées -> {out}")


if __name__ == "__main__":
    sys.exit(main())
