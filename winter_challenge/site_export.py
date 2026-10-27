"""Données du site web : la saison calculée, au format JSON lu par la page (site/donnees/saison.json).

Le site ne calcule rien : classements, handicaps et statistiques viennent de season.py.
Seuls des pseudos GSPro sont publiés (ni nom, ni e-mail).
"""

from __future__ import annotations

from datetime import datetime

from .scoring import COUNT_LABELS
from .season import Season
from .stats import rank_of

STATS_KEYS = {"Albatross": "albatros", "Eagles": "eagles", "Birdies": "birdies", "Pars": "pars", "Bogeys": "bogeys",
              "Double-Bogeys": "doubles", "Triple-Bogeys": "triples", "More": "plus"}


def _evolution(value):
    return "nouveau" if value == "Nouveau" else value


def _ranking_rows(season: Season, category: str, kind: str) -> list:
    return [{
        "rang": r.rank, "evolution": _evolution(r.evolution), "joueur": r.player, "hdc_depart": r.start_hcp,
        "hdc_actuel": r.current_hcp, "nb_semaines": r.nb_weeks, "total": r.total,
        "points": {str(w): p for w, p in sorted(r.points.items())},
        "comptees": sorted(r.counted_weeks), "a_remplacer": r.replaced_week,
    } for r in season.rankings[(category, kind)]]


def _week_summaries(season: Season) -> list:
    groups = {}
    for w in season.weeks:
        groups.setdefault(w.number, []).append(w)
    out = []
    for number in sorted(groups):
        first = groups[number][0]
        categories = []
        for w in groups[number]:
            attempts = [a for a in season.attempts if a.week == number and a.category == w.category]
            retained = [a for (cat, _, wk), a in season.best.items() if wk == number and cat == w.category]
            entry = {"categorie": w.category, "joueurs": len({a.player for a in attempts}), "tentatives": len(attempts)}
            for kind, field in (("brut", "stableford_gross"), ("net", "stableford_net")):
                best = max((getattr(a.result, field) for a in retained), default=None)
                who = sorted(a.player for a in retained if getattr(a.result, field) == best) if retained else []
                entry[f"meilleur_{kind}"] = {"stableford": best, "joueurs": who}
            entry["stats"] = {STATS_KEYS[label]: sum(a.counts[label] for a in retained) for label in COUNT_LABELS}
            categories.append(entry)
        out.append({
            "numero": number, "parcours": first.course, "debut": first.start, "fin": first.end,
            "statut": "en_cours" if any(w.status == "In Progress" for w in groups[number]) else "terminee",
            "categories": categories,
        })
    return out


def _player_stats(season: Season, name: str) -> dict | None:
    """Statistiques d'un joueur : une ligne par semaine (avec son rang parmi les joueurs du tour) et un résumé.

    Elles couvrent tous ses tours de la semaine, pas seulement le tour retenu pour le classement.
    """
    courses = {(w.category, w.number): w.course for w in season.weeks}
    weeks = []
    for (label, number), st in sorted(season.stats.items(), key=lambda kv: kv[0][1]):
        mine = dict(st["joueurs"].get(name, {}))
        holes = []
        for hole, entries in sorted(st["ctp"].items()):
            for who, metres in entries:
                if who == name:
                    holes.append({"trou": hole, "m": round(metres, 1), "rang": rank_of(metres, [m for _, m in entries], False),
                                  "sur": len(entries)})
        if not mine and not holes:
            continue
        if "drive_m" in mine:
            drives = [p["drive_m"] for p in st["joueurs"].values() if "drive_m" in p]
            mine["drive_rang"], mine["drive_sur"] = rank_of(mine["drive_m"], drives), len(drives)
        mine.update({"semaine": number, "parcours": courses.get((label, number), ""), "ctp": holes})
        weeks.append(mine)
    if not weeks:
        return None

    summary = {}
    drives = [(w["drive_m"], w["semaine"]) for w in weeks if "drive_m" in w]
    if drives:
        best = max(drives)
        summary["meilleur_drive"] = {"m": best[0], "semaine": best[1]}
    shots = [(h["m"], w["semaine"], h["trou"]) for w in weeks for h in w["ctp"]]
    if shots:
        best = min(shots)
        summary["meilleur_ctp"] = {"m": best[0], "semaine": best[1], "trou": best[2]}
    for key in ("fairways", "greens", "putts"):  # moyenne par tour, pondérée par le nombre de tours de chaque semaine
        pairs = [(w[key], w.get("tours") or 1) for w in weeks if key in w]
        if pairs:
            summary[key] = round(sum(v * n for v, n in pairs) / sum(n for _, n in pairs), 1 if key == "putts" else 0)
    return {"resume": summary, "semaines": weeks}


def _players(season: Season) -> list:
    out = []
    for p in sorted(season.players, key=lambda p: (p.category, p.name.lower())):
        weeks, history = [], [{"semaine": 0, "hdc": p.start_hcp}]
        for number in sorted({w for (cat, name, w) in season.best if name == p.name and cat == p.category}):
            a = season.best[(p.category, p.name, number)]
            tries = sum(1 for x in season.attempts if x.player == p.name and x.week == number)
            r = a.result
            par = sum(par for score, par in zip(a.scores, a.pars) if score)  # par des trous réellement joués
            weeks.append({"semaine": number, "parcours": a.course, "trous": a.holes_played, "par": par,
                          "coups_brut": r.gross_total, "coups_net": r.net_total,
                          "points_net": r.points_net, "points_brut": r.points_gross,
                          "stableford_net": r.stableford_net, "stableford_brut": r.stableford_gross,
                          "hdc_avant": r.hcp_before, "hdc_apres": int(r.hcp_after), "tentatives": tries})
            history.append({"semaine": number, "hdc": int(r.hcp_after)})
        ranks = {kind: next((r for r in season.rankings[(p.category, kind)] if r.player == p.name), None)
                 for kind in ("net", "brut")}
        out.append({
            "joueur": p.name, "categorie": p.category, "hdc_depart": p.start_hcp, "hdc_actuel": p.current_hcp,
            "rang_net": ranks["net"].rank if ranks["net"] else None, "total_net": ranks["net"].total if ranks["net"] else 0,
            "rang_brut": ranks["brut"].rank if ranks["brut"] else None, "total_brut": ranks["brut"].total if ranks["brut"] else 0,
            "semaines": weeks, "hdc_historique": history, "stats": _player_stats(season, p.name),
        })
    return out


def build_site_data(season: Season, season_label: str, next_course: dict | None = None, demo: bool = False,
                    now: datetime | None = None) -> dict:
    categories = list(dict.fromkeys(p.category for p in season.players))
    return {
        "genere_le": (now or datetime.now()).isoformat(timespec="minutes"),
        "demo": demo,
        "saison": season_label,
        "regles": {"meilleurs": season.best_n, "tentatives": season.max_attempts},
        "categories": [{"nom": c, "classement": {"net": _ranking_rows(season, c, "net"),
                                                  "brut": _ranking_rows(season, c, "brut")}} for c in categories],
        "semaines": _week_summaries(season),
        "joueurs": _players(season),
        "parcours_semaine": next_course,
    }
