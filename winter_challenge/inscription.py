"""Inscription des joueurs : lecture et contrôle de la liste (Excel, CSV ou texte), création chez SGT, inscriptions.

Règles (voir CLAUDE.md) :
- chaque joueur a six informations : pseudo (nickname SGT, identique dans GSPro), e-mail, prénom, nom, handicap réel,
  catégorie (Homme, Femme ou Senior) ; aucune ne peut manquer ;
- il est inscrit au Short Game (toujours, handicap 0 : brut seulement) et au tour de sa catégorie, avec son handicap réel ;
- rien n'est écrit tant que toute la liste n'est pas complète et valide ;
- ce qui existe déjà (compte, tour, inscription à un tournoi, ligne du fichier des handicaps) n'est jamais modifié.
"""

from __future__ import annotations

import csv
import re
import secrets
import unicodedata
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path

from .scoring import _round_half_up
from .sgt_api import SgtApiError, SgtClient

ROOT = Path(__file__).resolve().parent.parent
PLAYERS_FILE = ROOT / "config" / "joueurs.csv"          # pseudo;categorie;handicap_reel : lu par le calcul des classements
LOG_FILE = ROOT / "data" / "joueurs_inscrits.csv"       # identité complète : reste sur cet ordinateur (dossier data/ non versionné)

# Tours SGT du club LetsGolf (clubId 644). Le Short Game est mixte : tout le monde y joue.
CATEGORY_TOURS = {"Hommes": 3910, "Femmes": 3911, "Seniors": 3912}
SHORT_GAME_TOUR = 3909

FIELDS = ("pseudo", "email", "prenom", "nom", "handicap", "categorie")
LABELS = {"pseudo": "pseudo (nickname)", "email": "adresse e-mail", "prenom": "prénom", "nom": "nom",
          "handicap": "handicap réel", "categorie": "catégorie (Homme, Femme ou Senior)"}


def _plain(text) -> str:
    """Minuscules sans accents ni ponctuation, pour reconnaître les titres de colonnes."""
    text = unicodedata.normalize("NFKD", str(text or "")).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]", "", text.lower())


HEADERS = {
    "pseudo": {"pseudo", "surnom", "nickname", "nick", "username", "nomdutilisateur", "nomutilisateur", "pseudosgt", "pseudogspro", "identifiant"},
    "email": {"email", "mail", "emailadresse", "courriel", "adresseemail", "adressemail", "adresse"},
    "prenom": {"prenom", "firstname", "prenomjoueur"},
    "nom": {"nom", "nomdefamille", "lastname", "famille", "nomjoueur"},
    "handicap": {"handicap", "handicapreel", "hcp", "hcpreel", "hdc", "hdcreel", "handicapindex", "index"},
    "categorie": {"categorie", "type", "genre", "sexe", "hommefemmesenior", "homme/femme/senior", "typedepersonne", "cat"},
}
CATEGORY_WORDS = {
    "Hommes": {"homme", "hommes", "h", "m", "man", "men", "male", "masculin", "monsieur"},
    "Femmes": {"femme", "femmes", "f", "w", "woman", "women", "female", "feminin", "dame", "dames", "madame"},
    "Seniors": {"senior", "seniors", "sen", "s"},
}


@dataclass
class Player:
    pseudo: str = ""
    email: str = ""
    prenom: str = ""
    nom: str = ""
    handicap: float | None = None
    categorie: str = ""        # Hommes, Femmes ou Seniors (normalisée)
    source: str = ""           # d'où vient la ligne (pour les messages d'erreur)
    problems: list = field(default_factory=list)
    notes: list = field(default_factory=list)


def normalize_category(text) -> str | None:
    word = _plain(text)
    for category, words in CATEGORY_WORDS.items():
        if word in words:
            return category
    return None


def parse_handicap(text) -> tuple[float | None, str | None]:
    """« 11 », « 11,5 » -> 11.0, 11.5. « +2 » est un handicap plus (golf) : -2. Retourne (valeur, remarque ou None)."""
    raw = str(text if text is not None else "").strip().replace(",", ".").replace(" ", "")
    if not raw:
        return None, None
    plus = raw.startswith("+")
    try:
        value = float(raw.lstrip("+"))
    except ValueError:
        return None, None
    return (-value, "handicap plus (+%s) : compté comme -%s" % (raw[1:], raw[1:])) if plus else (value, None)


def check(player: Player) -> Player:
    """Remplit player.problems : informations manquantes ou invalides."""
    player.problems = []
    where = f" ({player.source})" if player.source else ""
    for name in FIELDS:
        value = getattr(player, name)
        if value is None or str(value).strip() == "":
            player.problems.append(f"manque : {LABELS[name]}{where}")
    if player.pseudo and not re.fullmatch(r"[A-Za-z0-9_\-]{3,30}", player.pseudo):
        player.problems.append(f"pseudo « {player.pseudo} » invalide : 3 à 30 caractères, lettres, chiffres, _ ou - (sans espace){where}")
    if player.email and not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]{2,}", player.email):
        player.problems.append(f"adresse e-mail « {player.email} » invalide{where}")
    if player.handicap is not None and not -10 <= player.handicap <= 36:
        player.problems.append(f"handicap réel {player.handicap:g} hors de la plage -10 à 36 (limite de SGT){where}")
    return player


def from_row(row: dict, source: str = "") -> Player:
    """Une ligne (titres de colonnes libres) -> Player. Les colonnes inconnues sont ignorées."""
    found = {}
    for title, value in row.items():
        key = _plain(title)
        for name, aliases in HEADERS.items():
            if key in aliases and name not in found:
                found[name] = value
    player = Player(source=source)
    for name in ("pseudo", "email", "prenom", "nom"):
        setattr(player, name, str(found.get(name) or "").strip())
    player.handicap, note = parse_handicap(found.get("handicap"))
    if note:
        player.notes.append(note)
    raw_category = found.get("categorie")
    player.categorie = normalize_category(raw_category) or ""
    if raw_category and not player.categorie:
        player.problems.append(f"catégorie « {raw_category} » non reconnue : Homme, Femme ou Senior ({source})")
    problems = list(player.problems)
    check(player)
    player.problems = problems + player.problems
    return player


def read_file(path: str | Path) -> list[Player]:
    """Lit un classeur Excel (.xlsx, première feuille) ou un CSV (virgule ou point-virgule). Première ligne = titres."""
    path = Path(path)
    if path.suffix.lower() in (".xlsx", ".xlsm"):
        from openpyxl import load_workbook
        sheet = load_workbook(path, read_only=True, data_only=True).worksheets[0]
        rows = [list(r) for r in sheet.iter_rows(values_only=True)]
    else:
        with open(path, encoding="utf-8-sig", newline="") as f:
            sample = f.read(2048)
            f.seek(0)
            rows = list(csv.reader(f, delimiter=";" if sample.count(";") >= sample.count(",") else ","))
    rows = [r for r in rows if any(str(c or "").strip() for c in r)]
    if not rows:
        return []
    titles = [str(c or "").strip() for c in rows[0]]
    players = []
    for number, values in enumerate(rows[1:], start=2):
        row = {t: v for t, v in zip(titles, values) if t}
        players.append(from_row(row, f"ligne {number}"))
    return players


def check_batch(players: list[Player]) -> list[str]:
    """Contrôle toute la liste : informations de chaque ligne, doublons de pseudo et d'e-mail. Retourne les problèmes."""
    problems = []
    seen_pseudo, seen_email = {}, {}
    for p in players:
        for key, seen, what in ((p.pseudo.lower(), seen_pseudo, "pseudo"), (p.email.lower(), seen_email, "e-mail")):
            if key and key in seen:
                p.problems.append(f"{what} en double dans la liste ({seen[key]} et {p.source or 'ce joueur'})")
            elif key:
                seen[key] = p.source or p.pseudo
    for p in players:
        problems += [f"{p.pseudo or '?'} : {m}" for m in p.problems]
    return problems


# ---------- Fichier des handicaps réels (lu par le calcul des classements) ----------

def read_players_csv(path: Path = PLAYERS_FILE) -> dict:
    """pseudo (minuscules) -> {categorie, handicap_reel}."""
    if not path.exists():
        return {}
    with open(path, encoding="utf-8-sig", newline="") as f:
        return {r["pseudo"].strip().lower(): r for r in csv.DictReader(f, delimiter=";") if r.get("pseudo")}


def add_to_players_csv(player: Player, path: Path = PLAYERS_FILE) -> bool:
    """Ajoute la ligne du joueur si son pseudo n'y est pas encore. Ne modifie jamais une ligne existante."""
    if player.pseudo.lower() in read_players_csv(path):
        return False
    new = not path.exists()
    with open(path, "a", encoding="utf-8", newline="") as f:
        if new:
            f.write("pseudo;categorie;handicap_reel\n")
        f.write(f"{player.pseudo};{player.categorie};{player.handicap:g}\n")
    return True


def log_player(player: Player, user_id, game_id, path: Path = LOG_FILE) -> None:
    """Garde l'identité complète sur cet ordinateur (pour créer les comptes GSPro) ; une ligne par pseudo."""
    path.parent.mkdir(exist_ok=True)
    known = set()
    if path.exists():
        with open(path, encoding="utf-8-sig", newline="") as f:
            known = {r["pseudo"].lower() for r in csv.DictReader(f, delimiter=";")}
    if player.pseudo.lower() in known:
        return
    with open(path, "a", encoding="utf-8", newline="") as f:
        w = csv.writer(f, delimiter=";")
        if not known and path.stat().st_size == 0:
            w.writerow(["pseudo", "prenom", "nom", "email", "categorie", "handicap_reel", "sgt_user_id", "sgt_game_id", "inscrit_le"])
        w.writerow([player.pseudo, player.prenom, player.nom, player.email, player.categorie, f"{player.handicap:g}",
                    user_id, game_id or "", date.today().strftime("%d.%m.%Y")])


# ---------- Chez SGT ----------

def _rows(res):
    return res.get("results", res) if isinstance(res, dict) else res


def tours_of(player: Player) -> list[tuple[int, int]]:
    """[(tour, handicap à fixer chez SGT)] : le tour de sa catégorie avec son handicap réel, et le Short Game à 0."""
    return [(CATEGORY_TOURS[player.categorie], _round_half_up(player.handicap)), (SHORT_GAME_TOUR, 0)]


def register_player(client: SgtClient, player: Player, simulate: bool, log) -> None:
    """Crée le compte si besoin, ajoute aux tours, inscrit à tous les tournois. Idempotent : ne touche pas à l'existant."""
    check_user = client.check_user(player.pseudo, player.email)
    user_id = check_user.get("user_id") or 0
    game_id = None
    if user_id:
        log(f"  compte SGT existant (pseudo et e-mail concordent) : id {user_id}")
    elif not check_user.get("username_available"):
        raise SgtApiError(f"le pseudo {player.pseudo} est déjà pris par un autre compte SGT")
    elif not check_user.get("email_available"):
        raise SgtApiError(f"l'adresse {player.email} est déjà utilisée par un autre compte SGT")
    else:
        log("  pseudo et e-mail libres : un compte SGT sera créé")
    if simulate and not user_id:
        for tour, hcp in tours_of(player):
            log(f"  serait ajouté au tour {tour} et à ses tournois (handicap {hcp})")
        return

    if not user_id:
        res = client.register_user(player.pseudo, player.email, secrets.token_urlsafe(12))  # mot de passe que personne ne connaît
        if not res.get("successful"):
            raise SgtApiError(f"création refusée : {res.get('feedback')}")
        game_id = res["userData"]["user_game_id"]
        user_id = client.check_user(player.pseudo, player.email).get("user_id")
        if not user_id:
            raise SgtApiError("compte créé, mais son identifiant n'est pas encore lisible : relance dans un moment")
        log(f"  compte créé, game ID {game_id}")
    elif not simulate:
        client.add_club_member(user_id)

    for tour, hcp in tours_of(player):
        members = {m["user_id"] for m in _rows(client.tour_members(tour))}
        if user_id in members:
            log(f"  tour {tour} : déjà membre")
        elif simulate:
            log(f"  tour {tour} : serait ajouté")
        else:
            log(f"  tour {tour} : {client.add_tour_member(tour, user_id).get('feedback')}")
        for t in _rows(client.tournaments(tour)):
            registered = {r["user_id"]: r for r in _rows(client.registrations(t["tournamentId"]))}
            if user_id in registered:
                have = registered[user_id].get("hcp_index")
                log(f"  {t['name']} : déjà inscrit (handicap {have})" + ("" if have in (None, hcp) else f", pas modifié : voulu {hcp}"))
            elif simulate:
                log(f"  {t['name']} : serait inscrit, handicap {hcp}")
            else:
                res = client.register_in_tournament(tour, t["tournamentId"], user_id, hcp)
                log(f"  {t['name']} : {str(res.get('feedback', res)).strip()} (handicap {hcp})")
    if not simulate:
        log("  fichier des handicaps : " + ("ligne ajoutée" if add_to_players_csv(player) else "déjà présent, pas modifié"))
        log_player(player, user_id, game_id)


def complete_registrations(client: SgtClient, simulate: bool, log) -> int:
    """Inscrit les membres des tours aux tournois où ils manquent (par exemple un nouveau tournoi créé par le capitaine).

    Handicap : celui du fichier des handicaps pour les tours de catégorie, 0 pour le Short Game.
    """
    known = read_players_csv()
    count = 0
    tours = _rows(client.tours())
    for tour in (*CATEGORY_TOURS.values(), SHORT_GAME_TOUR):
        admin = next((t.get("admin_uid") for t in tours if t["tourId"] == tour), None)
        members = [m for m in _rows(client.tour_members(tour)) if m["user_name"] != admin]
        for t in _rows(client.tournaments(tour)):
            registered = {r["user_id"] for r in _rows(client.registrations(t["tournamentId"]))}
            for m in members:
                if m["user_id"] in registered:
                    continue
                if tour == SHORT_GAME_TOUR:
                    hcp = 0
                else:
                    row = known.get(m["user_name"].lower())
                    hcp = _round_half_up(float(row["handicap_reel"].replace(",", "."))) if row and row.get("handicap_reel") else None
                log(f"  {t['name']} ({tour}) : {m['user_name']} " + ("serait inscrit" if simulate else "inscrit") + f", handicap {hcp}")
                if not simulate:
                    client.register_in_tournament(tour, t["tournamentId"], m["user_id"], hcp)
                count += 1
    return count
