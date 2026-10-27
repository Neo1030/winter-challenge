"""Statistiques de tournoi SGT (tournaments/stats) : plus long drive, plus près du drapeau, fairways, greens, putts.

L'API ne donne pas les unités. Hypothèse tirée de la documentation du site SGT (à confirmer, voir LISEZ-MOI) :
les drives sont en yards, les distances au drapeau en pieds. Tout est converti en mètres ici, et seulement ici.
Ces statistiques portent sur tous les tours du joueur dans le tournoi, pas seulement sur la tentative retenue.
"""

from __future__ import annotations

YARD_M = 0.9144
FOOT_M = 0.3048


def _num(value):
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _by_player(rows, field):
    return {r["user_name"]: _num(r.get(field)) for r in rows or [] if r.get("user_name")}


def parse_tournament_stats(raw: dict | None) -> dict:
    """Statistiques d'un tournoi, par joueur : {"joueurs": {pseudo: {...}}, "ctp": {trou: [(pseudo, mètres)]}}.

    Une réponse absente ou vide (tournoi sans tour joué) donne un résultat vide, jamais une erreur.
    """
    raw = raw if isinstance(raw, dict) else {}
    players: dict = {}

    def put(rows, field, key, factor=1.0, digits=1):
        for name, value in _by_player(rows, field).items():
            if value is not None:
                players.setdefault(name, {})[key] = round(value * factor, digits)

    put(raw.get("drivingDistance"), "longest_drive", "drive_m", YARD_M)
    put(raw.get("drivingAccuracy"), "fir_percent", "fairways", digits=0)
    put(raw.get("greenAccuracy"), "gir_percent", "greens", digits=0)
    put(raw.get("puttsPerRound"), "putts_per_round", "putts")
    put(raw.get("puttsPerGIR"), "putts_per_gir", "putts_par_green", digits=2)
    put(raw.get("sandSave"), "sand_save_percent", "sable", digits=0)
    put(raw.get("scrambling"), "scramble_percent", "recuperation", digits=0)
    for row in raw.get("drivingDistance") or []:
        if row.get("user_name") in players and row.get("numrounds"):
            players[row["user_name"]]["tours"] = int(row["numrounds"])

    ctp: dict = {}
    by_round = raw.get("closestToPin")
    for holes in (by_round.values() if isinstance(by_round, dict) else []):
        for hole, info in holes.items():
            for entry in info.get("ctps", []):
                feet = _num(entry.get("distanceToPin"))
                if feet is not None and entry.get("user_name"):
                    ctp.setdefault(int(hole), []).append((entry["user_name"], feet * FOOT_M))
    # un joueur qui a plusieurs tours garde sa meilleure distance sur chaque trou
    for hole, entries in ctp.items():
        best: dict = {}
        for name, metres in entries:
            best[name] = min(metres, best.get(name, metres))
        ctp[hole] = sorted(best.items(), key=lambda kv: kv[1])
    return {"joueurs": players, "ctp": ctp}


def rank_of(value, values, higher_is_better=True) -> int:
    """Rang à la française (les ex æquo partagent le même rang) de value parmi values."""
    return 1 + sum(1 for v in values if (v > value if higher_is_better else v < value))
