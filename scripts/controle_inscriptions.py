"""Contrôle une liste d'inscriptions (Excel ou CSV) chez SGT, SANS RIEN ÉCRIRE, et rend un Excel propre avec un statut par joueur.

Usage :
  python3 scripts/controle_inscriptions.py data/inscriptions/liste.xlsx
  python3 scripts/controle_inscriptions.py liste.tsv --sortie data/inscriptions/Inscriptions_controle.xlsx

Statuts : Inscrit (tout est en place) · À compléter (compte existant, il manque un tour, un tournoi ou le handicap) ·
À inscrire (pseudo et e-mail libres) · Problème pseudo · Problème e-mail · Problème handicap · Information manquante · Doublon.
La liste peut être renvoyée autant de fois qu'on veut : le contrôle relit l'état réel chez SGT, rien n'est inscrit deux fois.
Ensuite, l'inscription se fait avec scripts/inscrire_joueurs.py (voir le skill inscrire-joueurs).
Le fichier produit contient des noms et des e-mails : il reste dans data/ (jamais versionné).
"""

import argparse
import csv
import os
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from winter_challenge import inscription as ins  # noqa: E402
from winter_challenge.sgt_api import SgtApiError, SgtClient  # noqa: E402

SGT_MAX_HCP = 36   # SGT n'accepte pas un handicap d'inscription au-delà
CATEGORY_LABEL = {"Hommes": "Homme", "Femmes": "Femme", "Seniors": "Senior"}
COLUMNS = ["Prénom", "Nom", "E-mail", "Hcp réel", "Pseudo", "Catégorie"]
STATUS_COLORS = {"Inscrit": "C6EFCE", "À compléter": "DDEBF7", "À inscrire": "FFF2CC"}   # les problèmes sont en rouge


def read_rows(path):
    """Lignes du fichier (titres libres) : liste de dict, dans l'ordre."""
    path = Path(path)
    if path.suffix.lower() in (".xlsx", ".xlsm"):
        from openpyxl import load_workbook
        rows = [list(r) for r in load_workbook(path, read_only=True, data_only=True).worksheets[0].iter_rows(values_only=True)]
    else:
        with open(path, encoding="utf-8-sig", newline="") as f:
            sample = f.read(2048)
            f.seek(0)
            delim = "\t" if "\t" in sample else (";" if sample.count(";") >= sample.count(",") else ",")
            rows = list(csv.reader(f, delimiter=delim))
    rows = [r for r in rows if any(str(c or "").strip() for c in r)]
    titles = [str(c or "").strip() for c in rows[0]]
    return titles, [dict(zip(titles, r)) for r in rows[1:]]


def clean(player):
    """Mise au propre sans rien inventer : espaces, majuscule du prénom, e-mail en minuscules."""
    player.prenom = player.prenom[:1].upper() + player.prenom[1:] if player.prenom else player.prenom
    player.email = player.email.strip().lower()
    return player


class SgtState:
    """L'état du club chez SGT, lu une seule fois : membres des tours, tournois et inscriptions."""

    def __init__(self, client):
        self.client = client
        self.tour_members, self.tournaments, self.registrations = {}, {}, {}
        for tour in (*ins.CATEGORY_TOURS.values(), ins.SHORT_GAME_TOUR):
            self.tour_members[tour] = {m["user_id"]: m["user_name"] for m in ins._rows(client.tour_members(tour))}
            self.tournaments[tour] = ins._rows(client.tournaments(tour))
            for t in self.tournaments[tour]:
                self.registrations[t["tournamentId"]] = {r["user_id"]: r for r in ins._rows(client.registrations(t["tournamentId"]))}
        members = client._get("members/list")
        self.club = {m["user_id"]: m for m in (members.get("members", members) if isinstance(members, dict) else members)}

    def missing(self, user_id, player):
        """Ce qui manque à un compte existant : tours, tournois, handicaps différents, ligne du fichier des handicaps."""
        out = []
        if user_id not in self.club:
            out.append("pas membre du club")
        for tour, hcp in ins.tours_of(player):
            name = "Short Game" if tour == ins.SHORT_GAME_TOUR else player.categorie
            if user_id not in self.tour_members[tour]:
                out.append(f"pas dans le tour {name}")
            absent = [t["name"] for t in self.tournaments[tour] if user_id not in self.registrations[t["tournamentId"]]]
            if absent:
                out.append(f"{name} : pas inscrit à {len(absent)} tournoi(s)")
            wrong = sorted({r.get("hcp_index") for t in self.tournaments[tour]
                            for r in [self.registrations[t["tournamentId"]].get(user_id)] if r and r.get("hcp_index") not in (None, hcp)})
            if wrong:
                out.append(f"{name} : handicap {', '.join(str(w) for w in wrong)} chez SGT, voulu {hcp} (pas modifié automatiquement)")
        return out


def status_of(player, state, known_csv):
    hcp_notes = [m for m in player.problems if "au-dessus de" in m]
    if hcp_notes and len(hcp_notes) == len(player.problems):   # seul le handicap pose question : on regarde quand même SGT
        player.problems = []
        status, detail = status_of(player, state, known_csv)
        player.problems = hcp_notes
        return "Problème handicap", f"{hcp_notes[0]} ; chez SGT : {status.lower()} ({detail})"
    if player.problems:
        kind = "Information manquante" if any(m.startswith("manque") for m in player.problems) else \
               "Doublon" if any("en double" in m for m in player.problems) else \
               "Problème e-mail" if any("e-mail" in m for m in player.problems) else \
               "Problème pseudo" if any("pseudo" in m for m in player.problems) else \
               "Problème handicap" if any("handicap" in m for m in player.problems) else "Problème"
        return kind, " ; ".join(m.split(" (")[0] if m.endswith(")") and "ligne" in m else m for m in player.problems)
    check = state.client.check_user(player.pseudo, player.email)
    user_id = check.get("user_id") or 0
    if user_id:
        exact = state.club.get(user_id, {}).get("user_name") or next(
            (n for members in state.tour_members.values() for u, n in members.items() if u == user_id), player.pseudo)
        notes = [f"pseudo exact chez SGT : {exact} (à corriger dans le fichier)"] if exact != player.pseudo else []
        missing = state.missing(user_id, player)
        if player.pseudo.lower() not in known_csv:
            missing.append("pas dans le fichier des handicaps")
        if missing:
            return "À compléter", " ; ".join(notes + missing)
        return "Inscrit", " ; ".join(notes + [f"compte SGT {user_id}"])
    owner_email = next((m["user_name"] for m in state.club.values() if (m.get("user_email") or "").lower() == player.email), None)
    owner_pseudo = next((m.get("user_email") for m in state.club.values() if m["user_name"].lower() == player.pseudo.lower()), None)
    if not check.get("username_available") and not check.get("email_available"):
        return "Problème pseudo", "pseudo déjà pris par un autre joueur, et l'e-mail a déjà un compte SGT sous un autre pseudo" + \
            (f" ({owner_email})" if owner_email else " : demander au joueur son pseudo SGT")
    if not check.get("username_available"):
        return "Problème pseudo", "pseudo déjà pris chez SGT" + (f" par un membre du club, avec l'e-mail {owner_pseudo}" if owner_pseudo else " par un autre joueur")
    if not check.get("email_available"):
        return "Problème e-mail", "cet e-mail a déjà un compte SGT sous un autre pseudo" + \
            (f" ({owner_email})" if owner_email else " : demander au joueur son pseudo SGT")
    return "À inscrire", "pseudo et e-mail libres"


def write_xlsx(path, titles, rows, players, statuses):
    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Font, PatternFill
    wb = Workbook()
    ws = wb.active
    ws.title = "Inscriptions"
    known = {a for aliases in ins.HEADERS.values() for a in aliases} | {"statut", "detail"}   # l'ancien statut est recalculé
    others = [t for t in titles if t and ins._plain(t) not in known]
    header = others[:1] + COLUMNS + others[1:] + ["Statut", "Détail"]
    ws.append(header)
    for row, p, (status, detail) in zip(rows, players, statuses):
        values = {"Prénom": p.prenom, "Nom": p.nom, "E-mail": p.email, "Hcp réel": p.handicap, "Pseudo": p.pseudo,
                  "Catégorie": CATEGORY_LABEL.get(p.categorie, p.categorie), "Statut": status, "Détail": detail}
        ws.append([values.get(h, row.get(h)) for h in header])
        fill = STATUS_COLORS.get(status, "F8CBAD")
        ws.cell(ws.max_row, len(header) - 1).fill = PatternFill("solid", fgColor=fill)
    for c in ws[1]:
        c.font, c.fill = Font(bold=True, color="FFFFFF"), PatternFill("solid", fgColor="1F3A5F")
    widths = {"Prénom": 14, "Nom": 16, "E-mail": 32, "Hcp réel": 9, "Pseudo": 18, "Catégorie": 10, "Statut": 20, "Détail": 70}
    for i, h in enumerate(header, start=1):
        ws.column_dimensions[ws.cell(1, i).column_letter].width = widths.get(h, 10)
    for row in ws.iter_rows(min_row=2):
        row[-1].alignment = Alignment(wrap_text=True, vertical="top")
    ws.freeze_panes = "A2"
    ws.auto_filter.ref = ws.dimensions
    wb.save(path)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("fichier")
    parser.add_argument("--sortie", help=f"par défaut data/inscriptions/Inscriptions_Winter_Challenge_{date.today():%Y-%m-%d}.xlsx")
    args = parser.parse_args()

    titles, rows = read_rows(args.fichier)
    players = [clean(ins.from_row(r, f"ligne {i}")) for i, r in enumerate(rows, start=2)]
    for p in players:   # from_row a déjà contrôlé chaque ligne
        if p.handicap is not None and p.handicap > SGT_MAX_HCP:   # le contrôle de base l'a déjà signalé : on précise
            p.problems = [m for m in p.problems if "hors de la plage" not in m] + \
                [f"handicap réel {p.handicap:g} au-dessus de {SGT_MAX_HCP}, le maximum d'une inscription chez SGT : à décider"]
    ins.check_batch(players)
    try:
        state = SgtState(SgtClient.from_env())
        known_csv = ins.read_players_csv()
        statuses = [status_of(p, state, known_csv) for p in players]
    except SgtApiError as e:
        sys.exit(f"Erreur API : {e} (relance dans un moment)")

    out = Path(args.sortie or f"data/inscriptions/Inscriptions_Winter_Challenge_{date.today():%Y-%m-%d}.xlsx")
    out.parent.mkdir(parents=True, exist_ok=True)
    write_xlsx(out, titles, rows, players, statuses)
    counts = {}
    for p, (status, detail) in zip(players, statuses):
        counts[status] = counts.get(status, 0) + 1
        print(f"{p.pseudo or '?':18} {status:20} {detail}")
    print("\n" + " · ".join(f"{k} : {v}" for k, v in counts.items()) + f"\n-> {out}")


if __name__ == "__main__":
    main()
