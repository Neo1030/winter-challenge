"""Réglages d'un tournoi (stimp, fermeté, départ, vent…), lus sur la page publique du tournoi chez SGT.

L'API de club ne les donne pas (tournaments/list n'a que le parcours et les dates). Ils sont écrits dans le HTML de
https://simulatorgolftour.com/tournament/<id>, sous « ROUND SETTINGS » : c'est donc une lecture de page, plus fragile
qu'une API. Si la page change ou ne répond pas, on renvoie None : le site se passe alors de ces réglages.
Une seule requête par tournoi, et jamais pour un tournoi terminé dont les réglages sont déjà connus (voir sgt_api.py).
"""

from __future__ import annotations

import html
import re
import urllib.error
import urllib.request

PAGE_URL = "https://simulatorgolftour.com/tournament/{id}"
USER_AGENT = "WinterChallengeLetsGolf/1.0 (+https://winterchallenge.letsgolf.ch)"

# Libellé affiché par SGT -> clé du site
LABELS = {"STIMP": "stimp", "FAIRWAYS": "fairways", "GREENS": "greens", "TEES": "depart", "SLOPE": "pente",
          "RATING": "cotation", "PINS": "drapeaux", "WEATHER": "meteo", "WIND": "vent", "GIMMIES": "gimmies",
          "PUTTING": "putting"}
NUMBERS = {"stimp": float, "pente": int, "cotation": float}

_PAIR = re.compile(r"<div[^>]*mb-1[^>]*>\s*([A-Z ]+?)\s*</div>\s*<div[^>]*>\s*([^<]*?)\s*</div>")


def parse_settings(page: str) -> dict | None:
    """Réglages du premier tour (« ROUND 1 ») d'une page de tournoi ; None si la page n'en contient pas."""
    start = page.find("ROUND SETTINGS")
    if start < 0:
        return None
    block = page[start:]
    stop = re.search(r"ROUND\s+2\b", block)  # tournoi en plusieurs tours : on ne garde que le premier
    if stop:
        block = block[:stop.start()]
    out = {}
    for label, value in _PAIR.findall(block):
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


def fetch_settings(tournament_id: int, timeout: int = 20) -> dict | None:
    req = urllib.request.Request(PAGE_URL.format(id=tournament_id), headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return parse_settings(resp.read().decode("utf-8", errors="replace"))
    except (urllib.error.URLError, TimeoutError, OSError):
        return None
