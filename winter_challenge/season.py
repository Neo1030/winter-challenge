"""Logique de saison : tentatives, tentative retenue, évolution des handicaps et classements.

Reprend le fonctionnement du classeur VBA :
- une semaine = un tournoi SGT, avec un nombre limité de tentatives par joueur ;
- seule la tentative au meilleur Stableford net compte (à égalité, la plus récente) ;
- cette tentative donne les points bruts et nets de la semaine et le nouveau handicap de jeu ;
- le classement additionne les N meilleures semaines de chaque joueur.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from .scoring import RoundResult, game_handicap, hole_counts, score_round
from .stats import parse_tournament_stats

STATUS_RETAINED = "Retenu"
STATUS_NOT_RETAINED = "Non retenu"
STATUS_INCOMPLETE = "Incomplet"
STATUS_OVER_QUOTA = "Hors quota"


@dataclass
class Player:
    name: str
    category: str
    real_hcp: float | None
    start_hcp: int
    hcp_source: str
    current_hcp: int = 0


@dataclass
class Week:
    number: int
    tour_id: int
    category: str
    tournament_id: int
    name: str
    course: str
    start: str
    end: str
    status: str


@dataclass
class Attempt:
    week: int
    category: str
    player: str
    number: int
    scorecard_id: int
    course: str
    tee: str
    section: str  # Front, Back ou All
    scores: list
    pars: list
    holes_played: int
    status: str
    result: RoundResult | None = None
    counts: dict = field(default_factory=dict)


@dataclass
class RankRow:
    rank: int | None
    evolution: int | str | None  # places gagnées (+) ou perdues (-), "Nouveau", ou None
    player: str
    start_hcp: int
    current_hcp: int
    nb_weeks: int
    total: int
    points: dict  # numéro de semaine -> points
    counted_weeks: set
    replaced_week: int | None  # plus petit des résultats comptés, le premier à être remplacé


@dataclass
class Season:
    players: list
    weeks: list
    attempts: list
    best: dict  # (catégorie, joueur, semaine) -> Attempt retenue
    rankings: dict  # (catégorie, "net" ou "brut") -> [RankRow]
    best_n: int
    max_attempts: int
    stats: dict = field(default_factory=dict)  # (catégorie, semaine) -> statistiques du tournoi (voir stats.py)


def section_of(scores) -> str:
    front = any(scores[:9])
    back = any(scores[9:])
    return "All" if front and back else ("Back" if back else "Front")


def starting_handicap(member: dict, override: dict | None) -> tuple[float | None, str]:
    """Handicap réel de départ : fichier joueurs d'abord, puis handicap fixé par le club dans SGT, puis index SGT."""
    if override and override.get("real_hcp") is not None:
        return override["real_hcp"], "Fichier joueurs"
    if member.get("custom_hcp") is not None:
        return float(member["custom_hcp"]), "SGT (fixé par le club)"
    if member.get("hcp_index") is not None:
        return float(member["hcp_index"]), "SGT (index)"
    return None, "Inconnu"


def build_players(tours: list, overrides: dict | None = None) -> list:
    """Un joueur par membre des tours (hors compte administrateur du club), plus ceux qui ont un scorecard."""
    overrides = overrides or {}
    players = {}
    for tour in tours:
        admin = tour.get("admin")
        names = [m for m in tour["members"] if m["user_name"] != admin]
        names += [{"user_name": n} for n in {c["player_name"] for t in tour["tournaments"] for c in t["scorecards"]}
                  if n not in {m["user_name"] for m in names}]
        for member in names:
            name = member["user_name"]
            if name in players:
                continue
            override = overrides.get(name.lower())
            real, source = starting_handicap(member, override)
            category = (override or {}).get("category") or tour["label"]
            start = game_handicap(real) if real is not None else 0
            players[name] = Player(name, category, real, start, source, start)
    return list(players.values())


def sorted_tournaments(tour: dict) -> list:
    return sorted(tour["tournaments"], key=lambda t: (t["start_date"], t["end_date"], t["tournamentId"]))


def build_season(tours: list, overrides: dict | None = None, max_attempts: int = 10, best_n: int = 8) -> Season:
    players = build_players(tours, overrides)
    by_name = {p.name: p for p in players}
    weeks, attempts, best, stats = [], [], {}, {}

    for tour in tours:
        for number, t in enumerate(sorted_tournaments(tour), start=1):
            stats[(tour["label"], number)] = parse_tournament_stats(t.get("stats"))
            weeks.append(Week(number, tour["tour_id"], tour["label"], t["tournamentId"], t["name"], t["courseName"],
                              t["start_date"][:10], t["end_date"][:10], t["status"]))
            cards = sorted(t["scorecards"], key=lambda c: (c["tournamentScorecardId"], c["round"]))
            per_player = {}
            for card in cards:
                per_player.setdefault(card["player_name"], []).append(card)

            for name, player_cards in per_player.items():
                player = by_name[name]
                hcp_before = player.current_hcp  # le handicap ne bouge qu'à la fin de la semaine
                chosen = None
                for n, card in enumerate(player_cards, start=1):
                    scores = [card[f"hole{i}_gross"] for i in range(1, 19)]
                    pars = [card[f"h{i}_Par"] for i in range(1, 19)]
                    strokes = [card[f"h{i}_index"] for i in range(1, 19)]
                    played = sum(1 for s in scores if s)
                    if played == 0:
                        continue
                    attempt = Attempt(number, player.category, name, n, card["tournamentScorecardId"],
                                      card["courseName"], card.get("teetype") or "", section_of(scores),
                                      scores, pars, played, STATUS_NOT_RETAINED)
                    attempt.counts = hole_counts(scores, pars)
                    if played not in (9, 18):
                        attempt.status = STATUS_INCOMPLETE
                    else:
                        attempt.result = score_round(scores, pars, strokes, hcp_before)
                        if n > max_attempts:
                            attempt.status = STATUS_OVER_QUOTA
                        elif chosen is None or attempt.result.stableford_net >= chosen.result.stableford_net:
                            chosen = attempt
                    attempts.append(attempt)
                if chosen:
                    chosen.status = STATUS_RETAINED
                    best[(player.category, name, number)] = chosen
                    player.current_hcp = int(chosen.result.hcp_after)

    season = Season(players, weeks, attempts, best, {}, best_n, max_attempts, stats)
    for category in dict.fromkeys(p.category for p in players):
        for kind in ("net", "brut"):
            season.rankings[(category, kind)] = rank_category(season, category, kind)
    return season


def week_points(season: Season, category: str, kind: str) -> dict:
    """joueur -> {semaine: points} pour les tentatives retenues d'une catégorie."""
    out = {}
    for (cat, name, week), a in season.best.items():
        if cat == category:
            out.setdefault(name, {})[week] = a.result.points_net if kind == "net" else a.result.points_gross
    return out


def total_of(points: dict, best_n: int) -> int:
    return sum(sorted(points.values(), reverse=True)[:best_n])


def ranks_of(totals: dict) -> dict:
    """Rang à la française : les ex æquo partagent le même rang."""
    return {name: 1 + sum(1 for other in totals.values() if other > total) for name, total in totals.items()}


def counted_and_replaced(points: dict, best_n: int):
    """Semaines comptées parmi les N meilleures, et le plus petit résultat compté (le plus ancien à égalité)."""
    ordered = sorted(points.items(), key=lambda kv: (-kv[1], -kv[0]))  # meilleurs d'abord, plus récents d'abord
    counted = ordered[:best_n]
    replaced = None
    if len(points) >= best_n and counted:
        low = min(p for _, p in counted)
        replaced = min(w for w, p in counted if p == low)
    return {w for w, _ in counted}, replaced


def rank_category(season: Season, category: str, kind: str) -> list:
    pts = week_points(season, category, kind)
    players = [p for p in season.players if p.category == category]
    played_weeks = sorted({w for d in pts.values() for w in d})
    totals_now = {n: total_of(d, season.best_n) for n, d in pts.items()}
    ranks_now = ranks_of(totals_now)

    ranks_before = {}
    if len(played_weeks) >= 2:
        last = played_weeks[-1]
        before = {n: {w: p for w, p in d.items() if w < last} for n, d in pts.items()}
        ranks_before = ranks_of({n: total_of(d, season.best_n) for n, d in before.items() if d})

    rows = []
    for p in players:
        d = pts.get(p.name, {})
        counted, replaced = counted_and_replaced(d, season.best_n)
        evolution = None
        if ranks_before and p.name in ranks_now:
            evolution = ranks_before[p.name] - ranks_now[p.name] if p.name in ranks_before else "Nouveau"
        rows.append(RankRow(ranks_now.get(p.name), evolution, p.name, p.start_hcp, p.current_hcp, len(d),
                            totals_now.get(p.name, 0), d, counted, replaced))
    rows.sort(key=lambda r: (r.rank is None, r.rank or 0, r.player.lower()))
    return rows
