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
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from build_workbook import read_players_file  # noqa: E402
from winter_challenge import parcours, surveillance  # noqa: E402
from winter_challenge.season import build_season  # noqa: E402
from winter_challenge.site_export import build_site_data, hole_in_ones  # noqa: E402
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


# Compétitions jouées en brut seulement : handicap de 0 pour tous, ni classement net ni calcul de handicap (voir CLAUDE.md).
# La valeur est le nombre de résultats comptés au classement : le Short Game dure 5 mois et les 5 comptent tous.
BRUT_SEUL = {"Short Game": 5}
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


def read_published(site_url=None, path="site/donnees/saison.json"):
    """Le fichier de données déjà publié. Source : le fichier en ligne (SITE_URL) quand on tourne chez GitHub, sinon le
    fichier local. Sans fichier lisible : un fichier vide."""
    try:
        if site_url:
            with urllib.request.urlopen(site_url.rstrip("/") + "/donnees/saison.json", timeout=20) as r:
                published = json.load(r)
        else:
            with open(path, encoding="utf-8") as f:
                published = json.load(f)
    except (OSError, ValueError):
        return {}
    return published if isinstance(published, dict) else {}


def published_drives(published):
    """Plus longs drives déjà publiés {id de tournoi: {"cle", "yd"}} : le site SGT n'est relu que si les drives ont changé."""
    out = {}
    for tournament_id, drives in (published.get("drives_sgt") or {}).items():
        if isinstance(drives, dict) and drives.get("cle") and isinstance(drives.get("yd"), dict):
            try:
                out[int(tournament_id)] = drives
            except ValueError:
                continue
    return out


SHOTS_FILE = "coups.json"       # à côté de saison.json : le coup par coup, lu par la fiche joueur seulement quand on l'ouvre
SHOTS_PER_RUN = 60              # pages « Shot data » lues au plus par mise à jour ; le reste suit à la mise à jour suivante


def read_published_shots(site_url=None, folder="site/donnees"):
    """Coup par coup déjà publié {id de tournoi: {pseudo: {"cle", "trous"}}} : la page d'un joueur n'est relue chez SGT que
    si sa carte a changé. Sans fichier lisible : rien (tout sera relu, par tranches de SHOTS_PER_RUN)."""
    try:
        if site_url:
            with urllib.request.urlopen(site_url.rstrip("/") + "/donnees/" + SHOTS_FILE, timeout=20) as r:
                published = json.load(r)
        else:
            with open(os.path.join(folder, SHOTS_FILE), encoding="utf-8") as f:
                published = json.load(f)
    except (OSError, ValueError):
        return {}
    out = {}
    for tournament_id, players in (published.get("tournois") or {}).items() if isinstance(published, dict) else []:
        if isinstance(players, dict):
            try:
                out[int(tournament_id)] = players
            except ValueError:
                continue
    return out


def shots_data(tours, generated):
    """Contenu de coups.json : les coups par tournoi et par joueur, et pour chaque compétition les tournois de chaque
    semaine (un par catégorie), pour que le site retrouve la partie d'un joueur."""
    from winter_challenge.season import sorted_tournaments
    index, tournaments = {}, {}
    for tour in tours:
        prefix = prefix_of(tour.get("competition") or "Winter Challenge")
        for number, t in enumerate(sorted_tournaments(tour), start=1):
            if t.get("coups"):
                tournaments[str(t["tournamentId"])] = t["coups"]
                index.setdefault(prefix, {}).setdefault(str(number), []).append(t["tournamentId"])
    return {"genere_le": generated, "unite": "m", "index": index, "tournois": tournaments}


def published_settings(site_url=None, path="site/donnees/saison.json", published=None):
    """Réglages de tournois déjà publiés {id de tournoi: réglages} : on ne relit pas chez SGT un tournoi terminé."""
    if published is None:
        published = read_published(site_url, path)
    lists = [published.get("parcours")] + [c.get("parcours") for c in published.get("competitions_autres") or []]
    entries = [e for lst in lists for e in (lst if isinstance(lst, list) else [])]  # (l'ancien format : un dict par catégorie)
    return {e["tournoi_id"]: e["reglages"] for e in entries
            if e.get("statut") == "terminee" and e.get("reglages") and e.get("tournoi_id")}


EXPLOIT_VEDETTE_JOURS = 14   # un hole in one reste en tête du site et de la télé 14 jours, puis au tableau d'honneur (Mike, 20.11.2026)


def exploits(seasons, tours, published, today):
    """Les holes in one de la saison, toutes compétitions. SGT ne date pas les cartes : « vu_le » est le jour où la mise à
    jour les a vus la première fois, gardé d'une mise à jour à l'autre (lu dans le fichier publié). Le site et la télé
    mettent en vedette ceux vus depuis moins de EXPLOIT_VEDETTE_JOURS jours."""
    shots = {t["tournamentId"]: t["coups"] for tour in tours for t in tour["tournaments"] if t.get("coups")}
    deja = {(e.get("prefixe"), e.get("semaine"), e.get("joueur"), e.get("trou")): e.get("vu_le")
            for e in (published or {}).get("exploits") or [] if isinstance(e, dict)}
    out = []
    for nom, season in seasons:
        for e in hole_in_ones(season, nom, prefix_of(nom), shots):
            e["vu_le"] = deja.get((e["prefixe"], e["semaine"], e["joueur"], e["trou"])) or today.isoformat()
            out.append(e)
    out.sort(key=lambda e: (e["vu_le"], e["prefixe"], e["semaine"]), reverse=True)
    return out


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--tour", action="append", metavar="ID:CATEGORIE")
    parser.add_argument("--depuis-fichier", metavar="JSON")
    parser.add_argument("--saison", default="2026-2027")
    parser.add_argument("--sortie", default="site/donnees/saison.json")
    parser.add_argument("--joueurs", metavar="CSV")
    parser.add_argument("--aujourdhui", metavar="AAAA-MM-JJ", help="date du jour à utiliser (démonstration : 2 jours après le début du dernier tournoi)")
    parser.add_argument("--demo", action="store_true", help="marque les données comme fictives et ajoute un parcours d'exemple")
    parser.add_argument("--accepter-disparitions", action="store_true",
                        help="ce qui a disparu de l'API SGT devait disparaître (joueur retiré…) : fin de la maintenance")
    parser.add_argument("--rapport", metavar="MD", help="où écrire le texte de l'alerte si des données SGT ont disparu")
    args = parser.parse_args()

    try:
        published = {}
        if args.depuis_fichier:
            with open(args.depuis_fichier, encoding="utf-8") as f:
                tours = json.load(f)
        else:
            if not args.tour:
                sys.exit("Indique au moins un tour : --tour 3910:Hommes")
            client = SgtClient.from_env()
            published = read_published(os.environ.get("SITE_URL"), args.sortie)
            known = published_settings(published=published)
            known_drives = published_drives(published)
            known_shots = read_published_shots(os.environ.get("SITE_URL"), os.path.dirname(args.sortie))
            shots_budget = [SHOTS_PER_RUN]
            tours = []
            for spec in args.tour:
                tour_id, label, competition = parse_tour_spec(spec)
                tour = client.fetch_tour(tour_id, label, known, known_drives, known_shots, shots_budget)
                tour["competition"] = competition
                tours.append(tour)
    except SgtApiError as e:
        sys.exit(f"Erreur API : {e}")

    overrides = read_players_file(args.joueurs) if args.joueurs else None
    today = datetime.now(ZoneInfo("Europe/Zurich")).date()  # la semaine en cours se juge à la date du jour, heure de Suisse
    if args.aujourdhui:
        today = date.fromisoformat(args.aujourdhui)
    elif args.depuis_fichier and args.demo:  # démonstration : on se place dans la dernière semaine simulée
        today = max(date.fromisoformat(t["start_date"][:10]) for tour in tours for t in tour["tournaments"]) + timedelta(days=2)
    groups = {}
    for tour in tours:
        groups.setdefault(tour.get("competition") or "Winter Challenge", []).append(tour)
    seasons = {name: build_season(group, overrides, best_n=BRUT_SEUL.get(name, 8), today=today, gross_only=name in BRUT_SEUL,
                                 monthly=name in BRUT_SEUL)   # le Short Game se joue par mois
               for name, group in groups.items()}
    season = seasons.pop("Winter Challenge", None)
    if season is None:
        sys.exit("Il faut au moins un tour du Winter Challenge (sans nom de compétition).")
    next_course = dict(DEMO_COURSE) if args.demo else next_course_from_config()
    if args.demo and next_course:
        next_course["semaine"] = max(w.number for w in season.weeks) + 1  # le parcours choisi est celui de la prochaine semaine
    tous = [("Winter Challenge", season)] + list(seasons.items())
    data = build_site_data(season, args.saison, next_course, demo=args.demo,
                           history=[] if args.demo else parcours.read_history(),
                           autres=[(name, prefix_of(name), other) for name, other in seasons.items()])
    # Plus longs drives lus sur le site SGT, gardés tels quels : la prochaine mise à jour ne relit que les tournois qui ont bougé
    data["exploits"] = exploits(tous, tours, published, today)
    data["exploit_vedette_jours"] = EXPLOIT_VEDETTE_JOURS
    data["drives_sgt"] = {str(t["tournamentId"]): t["drives"] for tour in tours for t in tour["tournaments"] if t.get("drives")}

    # Surveillance : ce que l'API SGT donnait et ne donne plus met la zone du site en maintenance et avertit Mike
    # (voir winter_challenge/surveillance.py). Seulement avec l'API, pas avec un fichier déjà téléchargé.
    if not args.depuis_fichier:
        site_url = os.environ.get("SITE_URL")
        result = surveillance.check(data, surveillance.read_published(site_url, args.sortie), accept=args.accepter_disparitions)
        surveillance.signal(result, args.rapport, site_url or "https://winterchallenge.letsgolf.ch")

    os.makedirs(os.path.dirname(args.sortie), exist_ok=True)
    with open(args.sortie, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    # Coup par coup : un fichier à part (la fiche joueur le lit à la demande). Jamais en démonstration : pas de coups fictifs.
    if not args.depuis_fichier:
        shots = shots_data(tours, data.get("genere_le"))
        with open(os.path.join(os.path.dirname(args.sortie), SHOTS_FILE), "w", encoding="utf-8") as f:
            json.dump(shots, f, ensure_ascii=False, separators=(",", ":"))
        print(f"coup par coup : {sum(len(p) for p in shots['tournois'].values())} cartes dans {len(shots['tournois'])} tournois"
              f" ({SHOTS_PER_RUN - shots_budget[0]} pages lues chez SGT)")
    print(f"{len(data['joueurs'])} joueurs, {len(data['semaines'])} semaines, {len(data['categories'])} catégories -> {args.sortie}")
    for other in data["competitions_autres"]:
        print(f"  + {other['nom']} : {len(other['joueurs'])} joueurs, {len(other['semaines'])} mois")


if __name__ == "__main__":
    main()
