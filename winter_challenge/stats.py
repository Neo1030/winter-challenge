"""Statistiques de tournoi SGT (tournaments/stats) : plus long drive, plus près du drapeau, fairways, greens, putts.

Attention : malgré son nom, « longest_drive » (drivingDistance) est la distance MOYENNE des drives du joueur (SGT le range
dans « Driving distance » ; ex. 274.78 yds pour des drives de 225.99 à 335.58). On ne l'affiche plus (décision de Mike,
15.11.2026) : le drive du site est le vrai plus long drive, lu dans l'onglet Long Drive du site SGT (voir sgt_page.py) et
passé ici dans « drives ». Sans cette lecture, il n'y a pas de drive du tout : jamais la moyenne à la place.
L'API ne donne pas les unités. Les drives sont en yards (confirmé le 27.10.2026 : 246.09 dans l'API = « 246.09 YDS / 224.94 M »
sur le site SGT) ; les distances au drapeau et les putts sont en pieds (documentation SGT). Tout est converti en mètres ici,
et seulement ici ; la valeur d'origine est gardée à côté pour pouvoir comparer avec ce qu'affiche SGT.
Ces statistiques portent sur le tour du joueur dans le tournoi (un seul tour par semaine).
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


def complete_players(scorecards) -> set:
    """Les joueurs qui ont au moins une carte complète (9 ou 18 trous joués) dans le tournoi.

    Règle de Mike (15.11.2026) : un joueur qui n'a pas fini sa carte n'a pas de statistiques. SGT compte pourtant ses trous
    joués (fairways, putts, drives…) : on les écarte ici, pour les tuiles, la fiche joueur et le coup par coup.
    """
    out = set()
    for card in scorecards or []:
        played = sum(1 for i in range(1, 19) if (card.get(f"hole{i}_gross") or 0) > 0)
        if played in (9, 18) and card.get("player_name"):
            out.add(card["player_name"])
    return out


def longest_putt(holes) -> float | None:
    """Plus long putt rentré d'une carte (coup par coup, voir sgt_page.parse_shots), en mètres. Les putts donnés (gimmies)
    et les coups rentrés de l'extérieur du green ne comptent pas. None s'il n'y en a aucun."""
    made = [shot[2] for hole in holes or [] for shot in hole.get("c") or []
            if len(shot) >= 4 and shot[1] == "p" and shot[3] == "holecup" and isinstance(shot[2], (int, float))]
    return max(made) if made else None


def parse_tournament_stats(raw: dict | None, drives: dict | None = None, complete: set | None = None,
                           shots: dict | None = None) -> dict:
    """Statistiques d'un tournoi, par joueur : {"joueurs": {pseudo: {...}}, "ctp": {trou: [(pseudo, mètres)]}}.

    drives : plus longs drives lus sur le site SGT, {"yd": {pseudo: yards}, "yd_tout": {…}} (voir sgt_page.long_drives).
    shots : coup par coup du tournoi, {pseudo: {"trous": […]}} (voir sgt_page.shots_of), pour le plus long putt rentré.
    complete : les joueurs qui ont fini une carte (complete_players) ; les autres sont écartés. None : tout le monde.
    Une réponse absente ou vide (tournoi sans tour joué) donne un résultat vide, jamais une erreur.
    """
    raw = raw if isinstance(raw, dict) else {}
    players: dict = {}
    for field, key in (("yd", "drive"), ("yd_tout", "drive_tout")):   # sur le fairway ; où que la balle s'arrête
        for name, yards in ((drives or {}).get(field) or {}).items():
            value = _num(yards)
            if value is not None:
                players.setdefault(name, {}).update({key + "_m": round(value * YARD_M, 1), key + "_yd": round(value, 2)})
    for name, card in (shots or {}).items():
        metres = longest_putt((card or {}).get("trous")) if isinstance(card, dict) else None
        if metres is not None:
            players.setdefault(name, {})["putt_long_m"] = metres

    def put(rows, field, key, factor=1.0, digits=1):
        for name, value in _by_player(rows, field).items():
            if value is not None:
                players.setdefault(name, {})[key] = round(value * factor, digits)

    put(raw.get("drivingAccuracy"), "fir_percent", "fairways")
    put(raw.get("greenAccuracy"), "gir_percent", "greens")
    put(raw.get("girProx"), "girProx", "gir_prox_m", FOOT_M, digits=2)  # distance moyenne au drapeau, greens en régulation
    put(raw.get("girProx"), "girProx", "gir_prox_ft", digits=2)
    put(raw.get("feetPuttsMade"), "putts_feet_per_round", "putts_faits_m", FOOT_M, digits=2)  # longueur des putts rentrés, par tour
    put(raw.get("feetPuttsMade"), "putts_feet_per_round", "putts_faits_ft", digits=2)
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
    if complete is not None:              # carte pas finie : pas de statistiques (ni tuile, ni fiche, ni closest to the pin)
        players = {name: v for name, v in players.items() if name in complete}
        ctp = {hole: kept for hole, kept in ((h, [e for e in entries if e[0] in complete]) for h, entries in ctp.items()) if kept}
    return {"joueurs": players, "ctp": ctp}


def rank_of(value, values, higher_is_better=True) -> int:
    """Rang à la française (les ex æquo partagent le même rang) de value parmi values."""
    return 1 + sum(1 for v in values if (v > value if higher_is_better else v < value))
