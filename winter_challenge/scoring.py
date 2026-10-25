"""Règles de calcul du Winter Challenge (reprises du VBA du classeur 2025-2026).

Handicap de jeu : les valeurs négatives sont des handicaps « plus » (le joueur rend des coups).
"""

from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal


def net_score(gross: int, hcp: int, stroke: int) -> int:
    """Score net d'un trou, selon le handicap de jeu et l'index (stroke) du trou."""
    if hcp == stroke + 36:
        return gross - 3
    if stroke + 18 <= hcp <= stroke + 35:
        return gross - 2
    if stroke <= hcp <= stroke + 17:
        return gross - 1
    if hcp < stroke - 19 and hcp < stroke - 36:
        return gross + 2
    if hcp < stroke - 1 and hcp < stroke - 18:
        return gross + 1
    return gross


def stableford_hole(score: int, par: int) -> int:
    """Points Stableford d'un trou (0 dès deux coups au-dessus du par)."""
    diff = par - score
    return 0 if diff <= -2 else diff + 2


def ranking_points(stableford_total: int, holes_played: int) -> int:
    """100 points pour 36 Stableford (18 trous) ou 18 Stableford (9 trous), 10 points par point, minimum 30."""
    base = 36 if holes_played == 18 else 18
    return max(30, 100 + (stableford_total - base) * 10)


def new_handicap(before: float, points_net: int) -> float:
    """+1 sous les 100 points, sinon on retire (points - 100) / 10."""
    if points_net < 100:
        return before + 1
    return before - (points_net - 100) / 10


def _round_half_up(x: float) -> int:
    """Arrondi d'Excel : .5 s'éloigne de zéro (round() de Python arrondit au pair)."""
    return int(Decimal(str(x)).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def game_handicap(real: float) -> int:
    """Handicap de jeu de départ à 50 % du handicap réel (règle du formulaire « nouveau joueur »)."""
    if real >= 1.1:
        return _round_half_up(real / 2)
    if real >= 0.5:
        return 0
    if real > -1:
        return -1
    return _round_half_up(real * 1.5)


COUNT_LABELS = ["Albatross", "Eagles", "Birdies", "Pars", "Bogeys", "Double-Bogeys", "Triple-Bogeys", "More"]


def hole_counts(scores, pars) -> dict:
    """Nombre d'albatros, eagles, birdies, pars, bogeys, doubles, triples et plus (score brut contre par)."""
    counts = dict.fromkeys(COUNT_LABELS, 0)
    for score, par in zip(scores, pars):
        if not score:
            continue
        diff = score - par
        if diff <= -3:
            counts["Albatross"] += 1
        elif diff >= 4:
            counts["More"] += 1
        else:
            counts[COUNT_LABELS[diff + 3]] += 1
    return counts


@dataclass
class RoundResult:
    gross_total: int
    net_total: int
    stableford_gross: int
    stableford_net: int
    points_gross: int
    points_net: int
    hcp_before: float
    hcp_after: float


def score_round(scores, pars, strokes, hcp_before) -> RoundResult:
    """Calcule un résultat complet.

    scores : 18 valeurs (None ou 0 pour un trou non joué)
    pars, strokes : 18 valeurs du parcours
    hcp_before : handicap de jeu avant le tour
    """
    played = [i for i, s in enumerate(scores) if s]
    nets = {i: net_score(scores[i], hcp_before, strokes[i]) for i in played}
    sb = sum(stableford_hole(scores[i], pars[i]) for i in played)
    sn = sum(stableford_hole(nets[i], pars[i]) for i in played)
    pn = ranking_points(sn, len(played))
    return RoundResult(
        gross_total=sum(scores[i] for i in played),
        net_total=sum(nets.values()),
        stableford_gross=sb,
        stableford_net=sn,
        points_gross=ranking_points(sb, len(played)),
        points_net=pn,
        hcp_before=hcp_before,
        hcp_after=new_handicap(hcp_before, pn),
    )
