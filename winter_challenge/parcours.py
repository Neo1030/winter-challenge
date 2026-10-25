"""Choix des parcours : lecture de la liste publique de SGT, filtres et suivi des parcours joués.

La liste (≈ 2'750 parcours GSPro) est intégrée en JSON dans la page https://simulatorgolftour.com/courses.
Les longueurs, vents et conseils du concepteur ne sont que sur l'image de la carte de score : ils se lisent
ensuite, sur une présélection seulement.
"""

from __future__ import annotations

import json
import os
import re
import time
import unicodedata
import urllib.request
from dataclasses import dataclass, field
from datetime import date

LIST_URL = "https://simulatorgolftour.com/courses"
CARD_URL = "https://simulatorgolftour.com/public/assets/courseImages/scorecards/scorecard_{id}.jpg?v=1.1"
CACHE = "data/parcours_sgt.json"
PLAYED_FILE = "config/parcours_joues.txt"
NEXT_FILE = "config/prochain_parcours.json"

STYLES = ["Beginner", "Coastal", "Desert", "Fantasy", "Heathland", "Historic", "Links", "Mountain", "Parkland",
          "Training", "Tropical", "Major Venue", "Tour Stop"]
# Familles de styles proposées dans le questionnaire
STYLE_GROUPS = {
    "links": ["Links", "Coastal", "Heathland"],
    "montagne": ["Mountain"],
    "parkland": ["Parkland", "Historic"],
    "spectaculaire": ["Desert", "Tropical", "Fantasy"],
    "tournoi": ["Major Venue", "Tour Stop"],
}
EUROPE = {"uk", "united kingdom", "england", "scotland", "wales", "ireland", "spain", "germany", "france", "sweden",
          "finland", "norway", "netherlands", "iceland", "italy", "portugal", "austria", "denmark", "switzerland",
          "cambridgeshire", "east lothian scotland", "hunstanton", "mar menor", "woking uk", "wales uk"}
US_STATES = set("AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND "
                "OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY".split())
NORTH_AMERICA_WORDS = {"usa", "canada", "ontario", "quebec", "alberta", "manitoba", "new brunswick", "bc", "ab", "qc",
                       "on", "florida", "colorado", "connecticut", "california", "kansas", "utah", "nebraska",
                       "illinois", "michigan", "wisconsin", "georgia", "alabama", "new york", "delaware",
                       "pennsylvania", "virginia", "oregon", "missouri", "minnesota", "nevada", "indiana",
                       "western pa", "northern kansas", "mukwonago wi", "nc usa", "mn usa"}
FICTIONAL_WORDS = {"fictional", "fantasy", "haunted forest", "nowhere", "north pole", "north woods", "sahara",
                   "animal driving range", "das verblassen fictional", "south pacific"}
ZONES = ("suisse", "europe", "amerique-nord", "monde", "fictif", "inconnu")


def normalize(text: str) -> str:
    text = unicodedata.normalize("NFKD", text or "").encode("ascii", "ignore").decode()
    return re.sub(r"\s+", " ", text).strip().lower()


def zone_of(location: str) -> str:
    """Suisse, Europe (Suisse comprise), Amérique du Nord, monde, fictif ou inconnu, d'après le lieu écrit sur SGT."""
    last = normalize((location or "").split(",")[-1])
    full = normalize(location)
    if "switzerland" in full:
        return "suisse"
    if not last:
        return "inconnu"
    if last in FICTIONAL_WORDS or "fictional" in full:
        return "fictif"
    if last in EUROPE or any(w in full for w in ("scotland", "england", "wales")):
        return "europe"
    if last in NORTH_AMERICA_WORDS or last.upper() in US_STATES:
        return "amerique-nord"
    return "monde" if len(last) > 3 else "inconnu"


def difficulty_label(score) -> str | None:
    if score is None:
        return None
    return "facile" if score <= 3.0 else ("moyen" if score <= 6.0 else "difficile")


@dataclass
class Course:
    id: int
    name: str
    location: str
    par: int
    difficulty: float | None
    styles: list
    has_card: bool
    video_id: str
    updated: str
    designer: str
    zone: str = ""
    difficulty_label: str | None = None
    already_played: bool = False
    score: int = 0
    reasons: list = field(default_factory=list)

    @property
    def scorecard_url(self) -> str:
        return CARD_URL.format(id=self.id)

    @property
    def video_url(self) -> str | None:
        return f"https://youtu.be/{self.video_id}" if self.video_id else None

    def as_dict(self) -> dict:
        d = {k: v for k, v in self.__dict__.items()}
        d.update(scorecard_url=self.scorecard_url, video_url=self.video_url)
        return d


def fetch_list(cache: str = CACHE, max_age_hours: float = 24, force: bool = False) -> dict:
    """Liste des parcours SGT, gardée 24 h dans data/ pour ne pas recharger la page à chaque question."""
    if not force and os.path.exists(cache) and time.time() - os.path.getmtime(cache) < max_age_hours * 3600:
        with open(cache, encoding="utf-8") as f:
            return json.load(f)
    req = urllib.request.Request(LIST_URL, headers={"User-Agent": "Mozilla/5.0 (WinterChallenge)"})
    html = urllib.request.urlopen(req, timeout=30).read().decode("utf-8")
    match = re.search(r"<script id='courses-data' type='application/json'>(.*?)</script>", html, re.S)
    if not match:
        raise RuntimeError("Liste des parcours introuvable : la page SGT a changé")
    data = json.loads(match.group(1))
    os.makedirs(os.path.dirname(cache), exist_ok=True)
    with open(cache, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False)
    return data


def parse_courses(data: dict, played: set | None = None) -> list:
    played = played or set()
    out = []
    for r in data["courses"]:
        styles = [name for i, name in enumerate(STYLES) if (r[5] or 0) & (1 << i)]
        c = Course(r[0], r[1], r[2] or "", r[3], r[4], styles, bool(r[6]), r[7] or "", r[8] or "", r[9] or "")
        c.zone = zone_of(c.location)
        c.difficulty_label = difficulty_label(c.difficulty)
        c.already_played = normalize(c.name) in played
        out.append(c)
    return out


def read_played(path: str = PLAYED_FILE) -> set:
    if not os.path.exists(path):
        return set()
    with open(path, encoding="utf-8") as f:
        return {normalize(line) for line in f if line.strip() and not line.startswith("#")}


def select(courses: list, *, difficulty=None, style_groups=None, zones=None, places=None, exclude_played=True,
           official_video_only=False, prefer_video=True, prefer_tournament=False, min_par=66,
           limit=16, today: date | None = None) -> list:
    """Présélection : filtres durs puis classement par points (style, vidéo officielle, mise à jour récente)."""
    today = today or date.today()
    wanted_styles = {s for g in (style_groups or []) for s in STYLE_GROUPS[g]}
    zones = set(zones or [])
    places = [normalize(x) for x in (places or [])]
    if "europe" in zones:
        zones.add("suisse")  # la Suisse fait partie de l'Europe
    picked = []
    for c in courses:
        if not c.has_card or c.par < min_par or c.difficulty is None:
            continue
        if difficulty and c.difficulty_label not in difficulty:
            continue
        if (zones or places) and c.zone not in zones and not any(
                re.search(rf"\b{re.escape(w)}\b", normalize(c.location)) for w in places):
            continue
        if wanted_styles and not wanted_styles & set(c.styles):
            continue
        if exclude_played and c.already_played:
            continue
        if official_video_only and not c.video_id:
            continue
        c.score, c.reasons = 0, []
        if wanted_styles:
            hits = len(wanted_styles & set(c.styles))
            c.score += hits
            c.reasons.append(f"{hits} style(s) demandé(s)")
        if prefer_video and c.video_id:
            c.score += 3
            c.reasons.append("vidéo officielle SGT")
        if prefer_tournament and {"Major Venue", "Tour Stop"} & set(c.styles):
            c.score += 2
            c.reasons.append("parcours de tournoi")
        if c.updated and (today - date.fromisoformat(c.updated)).days <= 365:
            c.score += 1
            c.reasons.append("mis à jour dans l'année")
        picked.append(c)
    picked.sort(key=lambda c: (-c.score, c.name.lower()))
    return picked[:limit]


def choose(course: Course, week: int, nine: str, played_path: str = PLAYED_FILE, next_path: str = NEXT_FILE,
           extra: dict | None = None) -> dict:
    """Enregistre le prochain parcours ; le précédent « prochain parcours » passe dans la liste des parcours joués."""
    os.makedirs(os.path.dirname(next_path), exist_ok=True)
    previous = None
    if os.path.exists(next_path):
        with open(next_path, encoding="utf-8") as f:
            previous = json.load(f).get("name")
    if previous and normalize(previous) not in read_played(played_path):
        with open(played_path, "a", encoding="utf-8") as f:
            f.write(previous + "\n")
    record = {"id": course.id, "name": course.name, "location": course.location, "par": course.par,
              "difficulty": course.difficulty, "styles": course.styles, "week": week, "nine": nine,
              "scorecard_url": course.scorecard_url, "video_url": course.video_url,
              "chosen_on": date.today().isoformat()}
    record.update({k: v for k, v in (extra or {}).items() if v is not None})
    with open(next_path, "w", encoding="utf-8") as f:
        json.dump(record, f, ensure_ascii=False, indent=1)
    return record
