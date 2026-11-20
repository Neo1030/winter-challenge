"""Surveillance des données SGT : repère ce que l'API donnait et ne donne plus, et met les zones touchées en maintenance.

Le principe : chaque mise à jour décrit le fichier de données en une liste de « faits » (le tournoi WC3 existe, tel joueur a un
score en WC3, la tuile Longest drive de WC3 Hommes a une valeur, le stimp de WC3 est connu…). Un fait présent dans le fichier
déjà publié et absent du nouveau a disparu : SGT a changé quelque chose. Il est gardé dans le fichier publié
(« surveillance ») tant qu'il manque, pour que la maintenance tienne d'une mise à jour à l'autre, et retiré dès qu'il revient.

On ne regarde que les disparitions (pas les valeurs qui changent) : un score corrigé n'est pas une panne.
Les semaines sont reconnues par leur date de début, pas par leur numéro : un tournoi ajouté plus tôt dans le calendrier
renumérote les semaines sans rien faire disparaître.

Chaque fait appartient à une zone, celle que le site et la télé mettent en maintenance :
  classement   scores, joueurs, résultats des semaines (classement, course au titre, semaines, meilleurs du panneau télé)
  parcours     tournois et réglages des parcours (départ, stimp, gimmies…)
  fir, gir, drive, gir_prox, putts_faits, ctp, putts   une statistique (tuile du site et de la télé, fiche du joueur)

Une disparition passagère (une page SGT qui ne répond pas une fois) met la zone en maintenance tout de suite, mais l'alerte
n'est envoyée qu'à partir de la deuxième mise à jour d'affilée qui ne la retrouve pas (CONFIRMATION).
"""

from __future__ import annotations

import json
import os
import urllib.request
from datetime import datetime

CONFIRMATION = 2   # nombre de mises à jour d'affilée sans la donnée avant d'avertir

ZONES = {
    "classement": "Classement et scores",
    "parcours": "Tournois et réglages des parcours",
    "fir": "Statistique FIR (fairways touchés)",
    "gir": "Statistique GIR (greens en régulation)",
    "drive": "Statistique du drive",
    "gir_prox": "Statistique GIR proximity",
    "putts_faits": "Statistique Total putt length",
    "ctp": "Statistique Closest to the pin",
    "putts": "Statistique Putts par tour",
}

# statistiques d'un joueur (fiche) -> zone ; « ctp » est une liste de trous, traitée à part
PLAYER_STATS = {"fairways": "fir", "greens": "gir", "drive_m": "drive", "gir_prox_m": "gir_prox",
                "putts_faits_m": "putts_faits", "putts": "putts"}
# tuiles que le site produit encore (site_export.LEADER_TILES et le closest to the pin) : une tuile retirée du code (comme le
# Longest drive toutes zones, 20.11.2026) n'est plus attendue, sinon sa disparition mettrait le classement en maintenance
TUILES = {"fir", "gir", "drive", "gir_prox", "putts_faits", "putt_long", "ctp"}
COURSE_FIELDS = ("depart", "par", "neuf")
SEP = "|"


def _competitions(data: dict) -> list:
    """Le Winter Challenge (racine du fichier) puis les autres compétitions."""
    if not isinstance(data, dict) or not data.get("prefixe"):
        return []
    return [data] + [c for c in data.get("competitions_autres") or [] if isinstance(c, dict) and c.get("prefixe")]


def read_published(site_url: str | None = None, path: str = "site/donnees/saison.json") -> dict:
    """Le fichier déjà publié : en ligne (site_url) quand on tourne chez GitHub, sinon le fichier local. Illisible : {}."""
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


def facts(data: dict) -> dict:
    """Les faits d'un fichier de données : {fait: zone}. Un fait est une chaîne « WC|score|pseudo|2026-11-02 »."""
    out = {}
    for comp in _competitions(data):
        p = comp["prefixe"]
        starts = {}   # numéro de semaine -> date de début
        for e in comp.get("parcours") or []:
            if isinstance(e, dict) and e.get("semaine") is not None and e.get("debut"):
                starts[e["semaine"]] = e["debut"]
        for w in comp.get("semaines") or []:
            if isinstance(w, dict) and w.get("numero") is not None and w.get("debut"):
                starts.setdefault(w["numero"], w["debut"])

        def week(number):
            try:
                return starts.get(int(number)) or f"n{number}"
            except (TypeError, ValueError):
                return f"n{number}"

        def put(zone, *parts):
            out[SEP.join([p, *[str(x) for x in parts]])] = zone

        for e in comp.get("parcours") or []:
            if not isinstance(e, dict) or e.get("statut") == "a_venir" or not e.get("debut"):
                continue   # une semaine à venir peut encore changer : on ne la surveille pas
            put("parcours", "tournoi", e["debut"])
            for k in COURSE_FIELDS:
                if e.get(k) not in (None, ""):
                    put("parcours", "info", e["debut"], k)
            for k, v in (e.get("reglages") or {}).items():
                if v not in (None, ""):
                    put("parcours", "reglage", e["debut"], k)

        for w in comp.get("semaines") or []:
            for c in (w.get("categories") or []) if isinstance(w, dict) else []:
                if (c.get("meilleur_brut") or {}).get("stableford") is not None:
                    put("classement", "resultats", w.get("debut"), c.get("categorie"))

        for cat in comp.get("categories") or []:
            for number, tiles in (cat.get("stats") or {}).items():
                for key, tile in (tiles or {}).items():
                    if key in TUILES and isinstance(tile, dict) and tile.get("valeur") is not None:
                        put(key if key in ZONES else "classement", "tuile", cat.get("nom"), week(number), key)

        for j in comp.get("joueurs") or []:
            name = j.get("joueur")
            if not name:
                continue
            put("classement", "joueur", name)
            for s in j.get("semaines") or []:
                if s.get("coups_brut") is not None:
                    put("classement", "score", name, week(s.get("semaine")))
            scored = {s.get("semaine") for s in j.get("semaines") or [] if s.get("coups_brut") is not None}
            for s in ((j.get("stats") or {}).get("semaines") or []):
                if s.get("semaine") not in scored:
                    continue   # pas de carte complète cette semaine : pas de statistiques à surveiller (règle de Mike, 15.11.2026)
                for field, zone in PLAYER_STATS.items():
                    if s.get(field) is not None:
                        put(zone, "stat", name, week(s.get("semaine")), field)
                if s.get("ctp"):
                    put("ctp", "stat", name, week(s.get("semaine")), "ctp")
    return out


def describe(fact: str) -> str:
    """Un fait en français, pour l'alerte : « WC · score de Pseudo, semaine du 02.11.2026 »."""
    parts = fact.split(SEP)
    comp, kind, rest = parts[0], parts[1] if len(parts) > 1 else "", parts[2:]

    def day(iso):
        return iso if not iso or len(iso) < 10 or iso[4] != "-" else f"{iso[8:10]}.{iso[5:7]}.{iso[:4]}"

    if kind == "tournoi":
        text = f"tournoi de la semaine du {day(rest[0])}"
    elif kind == "info":
        text = f"{rest[1]} du parcours, semaine du {day(rest[0])}"
    elif kind == "reglage":
        text = f"réglage « {rest[1]} », semaine du {day(rest[0])}"
    elif kind == "resultats":
        text = f"résultats de la semaine du {day(rest[0])}, {rest[1]}"
    elif kind == "tuile":
        text = f"tuile {rest[2]}, {rest[0]}, semaine du {day(rest[1])}"
    elif kind == "joueur":
        text = f"joueur {rest[0]}"
    elif kind == "score":
        text = f"score de {rest[0]}, semaine du {day(rest[1])}"
    elif kind == "stat":
        text = f"{rest[2]} de {rest[0]}, semaine du {day(rest[1])}"
    else:
        text = SEP.join(parts[1:])
    return f"{comp} · {text}"


def _still_watched(fact: str, *fact_sets: dict) -> bool:
    """Une statistique de joueur déjà signalée reste surveillée tant que le joueur a un résultat cette semaine-là (dans le
    fichier publié ou le nouveau). Sinon elle n'est plus attendue : un joueur qui n'a pas fini sa carte n'a pas de
    statistiques (règle de Mike, 15.11.2026)."""
    parts = fact.split(SEP)
    if len(parts) >= 5 and parts[1] == "tuile" and parts[4] not in TUILES:
        return False   # tuile retirée du code : plus attendue
    if len(parts) < 4 or parts[1] != "stat":
        return True
    score = SEP.join([parts[0], "score", parts[2], parts[3]])
    return any(score in facts_ for facts_ in fact_sets)


def check(new: dict, published: dict, accept: bool = False, now: datetime | None = None) -> dict:
    """Compare le nouveau fichier au fichier publié et pose dans new :
    - « maintenance » sur chaque compétition : la liste des zones en maintenance (vide si tout va bien) ;
    - « surveillance » à la racine : les faits qui manquent, et ceux déjà signalés à Mike.

    accept : Mike confirme que ce qui a disparu devait disparaître (joueur retiré, tournoi supprimé) : on repart de zéro.
    Rend {"alerte": "nouvelle" | "resolue" | "", "manquants": {fait: {...}}, "nouveaux": [faits à signaler]}.
    """
    stamp = (now or datetime.now()).isoformat(timespec="minutes")
    state = published.get("surveillance") if isinstance(published.get("surveillance"), dict) else {}
    before = state.get("manquants") if isinstance(state.get("manquants"), dict) else {}
    reported = set(state.get("signales") or [])

    current = facts(new)
    expected = dict(facts(published))
    for fact, info in before.items():
        if isinstance(info, dict) and info.get("zone") in ZONES and _still_watched(fact, expected, current):
            expected.setdefault(fact, info["zone"])

    missing = {} if accept else {f: z for f, z in expected.items() if f not in current}
    manquants = {}
    for fact, zone in sorted(missing.items()):
        old = before.get(fact) if isinstance(before.get(fact), dict) else {}
        manquants[fact] = {"zone": zone, "depuis": old.get("depuis") or stamp, "vu": int(old.get("vu") or 0) + 1}

    confirmed = {f for f, m in manquants.items() if m["vu"] >= CONFIRMATION}
    nouveaux = sorted(confirmed - reported)
    still_reported = (reported & set(manquants)) | confirmed
    alerte = "nouvelle" if nouveaux else "resolue" if reported and not manquants else ""

    zones = {}
    for fact, m in manquants.items():
        zones.setdefault(fact.split(SEP)[0], set()).add(m["zone"])
    for comp in _competitions(new):
        comp["maintenance"] = sorted(zones.get(comp["prefixe"], ()))
    new["surveillance"] = {"manquants": manquants, "signales": sorted(still_reported)} if manquants else {}
    return {"alerte": alerte, "manquants": manquants, "nouveaux": nouveaux}


def report(result: dict, site_url: str = "https://winterchallenge.letsgolf.ch", limit: int = 40) -> str:
    """Le texte de l'alerte (Markdown), pour l'issue GitHub et le résumé de la mise à jour."""
    manquants = result["manquants"]
    if result["alerte"] == "resolue":
        return ("Toutes les données qui avaient disparu de l'API SGT sont revenues : le site et la télé ne sont plus en "
                f"maintenance.\n\n{site_url}")
    by_zone = {}
    for fact, m in manquants.items():
        by_zone.setdefault(m["zone"], []).append(fact)
    lines = ["Des données que l'API SGT donnait jusqu'ici **ne sont plus là**. Les parties concernées du site et de la "
             "télé sont **en maintenance** (elles reviennent seules dès que les données reviennent).", "",
             "| Zone en maintenance | Données manquantes | Depuis |", "|---|---|---|"]
    for zone in sorted(by_zone, key=lambda z: list(ZONES).index(z)):
        items = by_zone[zone]
        since = min(manquants[f]["depuis"] for f in items)
        lines.append(f"| {ZONES[zone]} | {len(items)} | {since.replace('T', ' à ')} |")
    lines += ["", "**Nouvelles disparitions :**", ""]
    nouveaux = result["nouveaux"] or sorted(manquants)
    lines += [f"- {describe(f)}" for f in nouveaux[:limit]]
    if len(nouveaux) > limit:
        lines.append(f"- … et {len(nouveaux) - limit} autres")
    lines += ["", "Que faire :",
              "- si SGT a changé son API : corriger la lecture (winter_challenge/sgt_api.py, stats.py, sgt_page.py) ; "
              "la maintenance se lève seule à la mise à jour suivante ;",
              "- si la disparition est voulue (joueur retiré, tournoi supprimé) : onglet Actions, « Mise à jour des "
              "résultats », Run workflow avec la case « accepter les disparitions » cochée.", "", site_url]
    return "\n".join(lines)


def signal(result: dict, report_path: str | None = None, site_url: str = "https://winterchallenge.letsgolf.ch") -> None:
    """Annonce le résultat : dans le journal, et chez GitHub (sortie « alerte » de l'étape, résumé de l'exécution,
    texte de l'alerte dans report_path, repris par le workflow pour l'issue qui avertit Mike)."""
    manquants = result["manquants"]
    if manquants:
        zones = sorted({m["zone"] for m in manquants.values()}, key=lambda z: list(ZONES).index(z))
        print(f"::warning::Données SGT disparues : {len(manquants)} ; en maintenance : {', '.join(ZONES[z] for z in zones)}")
    if result["alerte"] == "resolue":
        print("Données SGT : tout est revenu, fin de la maintenance.")
    text = report(result, site_url) if manquants or result["alerte"] else ""
    if report_path and text:
        with open(report_path, "w", encoding="utf-8") as f:
            f.write(text + "\n")
    if os.environ.get("GITHUB_OUTPUT"):
        with open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf-8") as f:
            f.write(f"alerte={result['alerte']}\n")
    if os.environ.get("GITHUB_STEP_SUMMARY") and text:
        with open(os.environ["GITHUB_STEP_SUMMARY"], "a", encoding="utf-8") as f:
            f.write("## Surveillance des données SGT\n\n" + text + "\n")
