"""Ce que l'API de club ne donne pas, lu sur les pages publiques de SGT : réglages d'un tournoi et plus long drive.

Réglages (stimp, fermeté, départ, vent…) : tournaments/list n'a que le parcours et les dates. Ils sont écrits dans le HTML de
https://simulatorgolftour.com/tournament/<id>, sous « ROUND SETTINGS ». Une seule requête par tournoi, et jamais pour un
tournoi terminé dont les réglages sont déjà connus (voir sgt_api.py).

Plus long drive : tournaments/stats ne donne que la distance MOYENNE des drives (champ « longest_drive », mal nommé). Le vrai
plus long drive vient de l'onglet Long Drive du site SGT : une vue par trou, /sgt-api/leaderboard/<tournoi>/ld/<manche>-<trou>,
qui porte tous les drives du trou dans un attribut data-shots (JSON). Comme SGT, on ne compte que les par 4 et 5 et les drives
arrêtés sur le fairway (un drive au rough ou au sable porte « out »). Le plus long drive hors fairway a été essayé puis retiré
(décision de Mike, 20.11.2026).

Coup par coup : l'API ne donne que le score de chaque trou. Le détail des coups (distance, où la balle finit, ce qu'il reste,
putts) vient de l'onglet « Shot data » d'une carte de score du site SGT : /sgt-api/scorecard/<tournoi>/<joueur>/indv/shots.
Une page par joueur et par tournoi, relue seulement quand sa carte de score a changé (voir shots_of).

Ce sont des lectures de pages, plus fragiles qu'une API : SGT a refait son site le 14.11.2026 et la lecture des réglages
s'est arrêtée. Si une page change ou ne répond pas, on renvoie None : le site se passe alors de ces données.
"""

from __future__ import annotations

import hashlib
import html
import json
import re
import urllib.error
import urllib.request

PAGE_URL = "https://simulatorgolftour.com/tournament/{id}"
DRIVES_URL = "https://simulatorgolftour.com/sgt-api/leaderboard/{id}/ld/{round}-{hole}"
USER_AGENT = "WinterChallengeLetsGolf/1.0 (+https://winterchallenge.letsgolf.ch)"

# Libellé affiché par SGT -> clé du site
LABELS = {"STIMP": "stimp", "FAIRWAYS": "fairways", "GREENS": "greens", "TEES": "depart", "SLOPE": "pente",
          "RATING": "cotation", "PINS": "drapeaux", "WEATHER": "meteo", "WIND": "vent", "GIMMIES": "gimmies",
          "PUTTING": "putting", "COURSE TYPE": "type_parcours"}  # « Course type » (gazon et fermeté, p. ex. Bentgrass Soft) : ajouté par SGT en 11.2026
NUMBERS = {"stimp": float, "pente": int, "cotation": float}

# Deux écritures de la même paire libellé / valeur : <dt>STIMP</dt><dd>10</dd> (site SGT depuis le 14.11.2026),
# et deux <div> qui se suivent (avant).
_PAIRS = (re.compile(r"<dt[^>]*>\s*([A-Z ]+?)\s*</dt>\s*<dd[^>]*>\s*([^<]*?)\s*</dd>"),
          re.compile(r"<div[^>]*mb-1[^>]*>\s*([A-Z ]+?)\s*</div>\s*<div[^>]*>\s*([^<]*?)\s*</div>"))


def parse_settings(page: str) -> dict | None:
    """Réglages du premier tour (« ROUND 1 ») d'une page de tournoi ; None si la page n'en contient pas."""
    start = page.find("ROUND SETTINGS")
    if start < 0:
        return None
    block = page[start:]
    stop = re.search(r"ROUND\s+2\b", block, re.I)  # tournoi en plusieurs tours : on ne garde que le premier
    if stop:
        block = block[:stop.start()]
    out = {}
    for label, value in next((found for found in (pair.findall(block) for pair in _PAIRS) if found), []):
        key = LABELS.get(label.strip())
        value = html.unescape(value).strip()
        if not key or not value:
            continue
        if key in NUMBERS:
            try:
                number = NUMBERS[key](value)
                out[key] = int(number) if key == "stimp" and number == int(number) else number
            except ValueError:
                continue
        else:
            out[key] = value.title() if key != "depart" else value
    return out or None


def _read(url: str, timeout: int) -> str | None:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.read().decode("utf-8", errors="replace")
    except (urllib.error.URLError, TimeoutError, OSError):
        return None


def fetch_settings(tournament_id: int, timeout: int = 20) -> dict | None:
    page = _read(PAGE_URL.format(id=tournament_id), timeout)
    return parse_settings(page) if page is not None else None


# ---------- Plus long drive ----------

_SHOTS = re.compile(r"""data-shots=(['"])(.*?)\1""", re.S)
DRIVES_VERSION = 4   # dans l'empreinte : à augmenter quand la lecture change, les drives déjà publiés sont alors relus


def parse_drives(page: str) -> dict:
    """Plus long drive de chaque joueur sur un trou, en yards : {pseudo: yards}. Seuls les drives qui comptent chez SGT
    (arrêtés sur le fairway, donc sans « out ») sont gardés. Une page sans drive donne un résultat vide."""
    best: dict = {}
    for _, raw in _SHOTS.findall(page):
        try:
            points = json.loads(html.unescape(raw))
        except ValueError:
            continue
        for point in points if isinstance(points, list) else []:
            if not isinstance(point, dict) or "out" in point or not point.get("n"):
                continue
            try:
                yards = float(point["x"])
            except (KeyError, TypeError, ValueError):
                continue
            if yards > best.get(point["n"], 0):
                best[point["n"]] = yards
    return best


def drive_holes(scorecards: list) -> list:
    """Les (manche, trou) où un drive compte : les par 4 et 5 joués par au moins un joueur."""
    holes = set()
    for card in scorecards or []:
        for hole in range(1, 19):
            if (card.get(f"hole{hole}_gross") or 0) > 0 and (card.get(f"h{hole}_Par") or 0) >= 4:
                holes.add((int(card.get("round") or 1), hole))
    return sorted(holes)


def _finished(scorecards) -> list:
    """Les joueurs qui ont fini une carte (9 ou 18 trous) : les seuls dont on garde un drive (règle de Mike, 15.11.2026)."""
    from .stats import complete_players
    return sorted(complete_players(scorecards))


def drives_key(stats: dict | None, holes: list, finished: list | None = None) -> str:
    """Empreinte de ce que l'API dit des drives d'un tournoi : tant qu'elle ne change pas, personne n'a rejoué et les
    plus longs drives déjà lus restent valables (on ne relit pas le site SGT toutes les cinq minutes)."""
    rows = (stats or {}).get("drivingDistance") if isinstance(stats, dict) else None
    # les joueurs qui ont fini leur carte font partie de l'empreinte : un joueur qui termine son tour fait relire les drives
    text = json.dumps([rows or [], holes] + ([finished] if finished is not None else []) + [DRIVES_VERSION], sort_keys=True,
                      ensure_ascii=False)
    return hashlib.sha1(text.encode("utf-8")).hexdigest()[:12]


def fetch_long_drives(tournament_id: int, holes: list, timeout: int = 20) -> dict | None:
    """Plus long drive de chaque joueur dans le tournoi (sur le fairway), en yards : {"yd": {pseudo: yards}}.
    None dès qu'une page ne répond pas : mieux vaut pas de plus long drive qu'un chiffre calculé sur une partie des trous."""
    best: dict = {}
    for round_number, hole in holes:
        page = _read(DRIVES_URL.format(id=tournament_id, round=round_number, hole=hole), timeout)
        if page is None:
            return None
        for name, yards in parse_drives(page).items():
            if yards > best.get(name, 0):
                best[name] = yards
    return {"yd": {name: round(yards, 2) for name, yards in best.items()}}


def long_drives(tournament: dict, known: dict | None = None, fetch=fetch_long_drives) -> dict | None:
    """Plus longs drives d'un tournoi (sur le fairway) : {"cle": empreinte, "yd": {pseudo: yards}}, ou None s'il n'y en a pas.

    tournament : le tournoi avec ses « scorecards » et ses « stats ». known : ce qui a déjà été publié pour ce tournoi ;
    on le reprend tel quel si l'empreinte n'a pas changé, et on le garde aussi si le site SGT ne répond pas ou ne donne
    plus rien alors que l'API annonce des drives (page modifiée) : un chiffre un peu ancien vaut mieux qu'un trou.
    """
    stats = tournament.get("stats")
    holes = drive_holes(tournament.get("scorecards"))
    if not holes or not isinstance(stats, dict) or not stats.get("drivingDistance"):
        return known if not isinstance(stats, dict) else None  # pas de statistiques lues : on garde ; pas de drive : rien
    finished = _finished(tournament.get("scorecards"))
    key = drives_key(stats, holes, finished)
    if known and known.get("cle") == key:
        return known
    found = fetch(tournament["tournamentId"], holes)
    if not found or not found.get("yd"):
        return known
    # un joueur qui n'a pas fini sa carte n'a pas de drive, même dans cette liste gardée d'une mise à jour à l'autre
    return {"cle": key, "yd": {name: value for name, value in found["yd"].items() if name in finished}}


# ---------- Coup par coup (onglet « Shot data » d'une carte de score) ----------

SHOTS_URL = "https://simulatorgolftour.com/sgt-api/scorecard/{tournament}/{player}/indv/shots"
YARD, FOOT = 0.9144, 0.3048
SHOTS_VERSION = 2    # à augmenter quand la lecture change : toutes les cartes déjà publiées sont alors relues une fois

_TAGS = re.compile(r"<[^>]+>")
_HOLE = re.compile(r"data-hole=['\"](\d+)['\"]")
_NUMBER = re.compile(r"class=['\"]shot-number\s+lie-([a-z]+)[^'\"]*['\"][^>]*>\s*(\d+)\s*<")
_MAIN = re.compile(r"class=['\"]shot-main['\"]>(.*?)</span>", re.S)
_DETAIL = re.compile(r"class=['\"]shot-detail['\"]>(.*?)</span>", re.S)
_DIST = re.compile(r"([\d.]+)\s*(yds?|ft)\b", re.I)


def _text(fragment: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(_TAGS.sub(" ", fragment))).strip()


def _metres(text: str) -> float | None:
    """« 193 yds », « 18 ft » -> mètres, arrondis au décimètre. None si le texte ne contient pas de distance."""
    m = _DIST.search(text)
    if not m:
        return None
    return round(float(m.group(1)) * (FOOT if m.group(2).lower() == "ft" else YARD), 1)


def _shot(lie: str, main: str, detail: str) -> list:
    """Un coup, sans son numéro : [genre, mètres, lie d'arrivée, mètres restants] (parse_shots met le numéro devant).

    Genres : "c" un coup joué, "p" un putt, "g" un putt donné (gimme), "?" un texte que SGT écrit autrement (gardé tel quel
    à la place de la distance, pour ne rien inventer). Le reste vaut 0 quand la balle est dans le trou, None s'il est inconnu.
    """
    left = _metres(detail.split("left")[0]) if "left" in detail else None
    low = main.lower()
    if low.startswith("tap-in") or "gimme" in detail.lower():
        return ["g", None, "holecup", 0]
    if low.startswith("putt"):
        return ["p", _metres(main), lie, left]
    if low.startswith("made") and "putt" in low:
        return ["p", _metres(main), "holecup", 0]
    if low.startswith("holed out"):          # « Holed out » + « from 16 yds » (deux morceaux chez SGT) : rentré de l'extérieur du green
        distance = _metres(main + " " + detail)
        return ["c", distance, "holecup", 0] if distance is not None else ["?", (main + " " + detail).strip(), "holecup", 0]
    distance = _metres(main)
    if distance is None:
        return ["?", (main + " " + detail).strip(), lie, left]
    return ["c", distance, lie, 0 if lie == "holecup" else left]


def parse_shots(page: str) -> list | None:
    """Les trous du premier tour d'une page « Shot data » : [{"t": trou, "p": par, "s": score, "m": longueur en mètres,
    "c": [[numéro du coup, genre, mètres, lie, reste], …]}], dans l'ordre joué. None si la page n'a aucun trou lisible.
    Le numéro est celui de SGT : il saute un rang quand un coup de pénalité s'ajoute (1, 2, 3, 5…)."""
    stop = re.search(r"ROUND\s+2\b", page)
    if stop:
        page = page[:stop.start()]
    marks = list(_HOLE.finditer(page))
    holes = []
    for i, mark in enumerate(marks):
        block = page[mark.end():marks[i + 1].start() if i + 1 < len(marks) else len(page)]
        par = re.search(r"PAR\s+(\d)", block)
        score = re.search(r"class=['\"]hole-score[^'\"]*['\"]>\s*(\d+)\s*<", block)
        shots = []
        for row in re.split(r"class=['\"]shot-row\b", block.split("shot-map")[0])[1:]:   # une ligne par coup, avant le dessin
            number, main, detail = _NUMBER.search(row), _MAIN.search(row), _DETAIL.search(row)   # « Made 12 ft putt » n'a pas de détail
            if number and main:
                shots.append([int(number.group(2))] + _shot(number.group(1), _text(main.group(1)), _text(detail.group(1)) if detail else ""))
        if not par or not score or not shots:
            continue
        length = re.search(r"shot-map-labels.*?<span>\s*([\d.]+)\s*YDS", block, re.S)
        holes.append({"t": int(mark.group(1)), "p": int(par.group(1)), "s": int(score.group(1)),
                      "m": round(float(length.group(1)) * YARD) if length else None, "c": shots})
    return holes or None


def fetch_shots(tournament_id: int, player_id: int, timeout: int = 20) -> list | None:
    page = _read(SHOTS_URL.format(tournament=tournament_id, player=player_id), timeout)
    return parse_shots(page) if page else None


def shots_key(cards: list) -> str:
    """Empreinte des cartes de score d'un joueur dans un tournoi : tant qu'elle ne change pas, il n'a pas rejoué et ses
    coups déjà lus restent valables."""
    rows = sorted((int(c.get("round") or 1), [c.get(f"hole{i}_gross") or 0 for i in range(1, 19)]) for c in cards)
    return hashlib.sha1(json.dumps([SHOTS_VERSION, rows]).encode("utf-8")).hexdigest()[:10]


def shots_of(tournament: dict, known: dict | None = None, budget: list | None = None, fetch=fetch_shots) -> dict:
    """Coup par coup de chaque joueur d'un tournoi qui a fini une carte (9 ou 18 trous) : {pseudo: {"cle", "trous"}}.

    known : ce qui a déjà été publié pour ce tournoi ; un joueur dont la carte n'a pas changé n'est pas relu, et on garde
    ce qu'on a si le site SGT ne répond pas ou si sa page n'est plus lisible. budget : [nombre de pages qu'on peut encore
    lire pendant cette mise à jour] ; au-delà, les joueurs restants seront lus à la mise à jour suivante.
    """
    known = known or {}
    out = {}
    per_player: dict = {}
    for card in tournament.get("scorecards") or []:
        played = sum(1 for i in range(1, 19) if (card.get(f"hole{i}_gross") or 0) > 0)
        if played in (9, 18):              # carte pas finie : pas de coup par coup (règle de Mike, 15.11.2026)
            per_player.setdefault(card["player_name"], []).append(card)
    for name, cards in per_player.items():
        key = shots_key(cards)
        old = known.get(name)
        if isinstance(old, dict) and old.get("cle") == key and old.get("trous"):
            out[name] = old
            continue
        player_id = cards[0].get("playerId")
        holes = None
        if player_id and (budget is None or budget[0] > 0):
            if budget is not None:
                budget[0] -= 1
            holes = fetch(tournament["tournamentId"], player_id)
        if holes:
            out[name] = {"cle": key, "trous": holes}
        elif isinstance(old, dict) and old.get("trous"):
            out[name] = old                      # ancienne lecture, gardée : sa clé périmée la fera relire la prochaine fois
    return out
