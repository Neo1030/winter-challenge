"""Client minimal de la Club Admin API de Simulator Golf Tour (v2.0.4).

Documentation : https://simulatorgolftour.com/docs/clubapi
Sans dépendance externe (bibliothèque standard uniquement).
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.parse
import urllib.request

BASE_URL = "https://simulatorgolftour.com/sgt-api/club-admin"


class SgtApiError(RuntimeError):
    pass


def load_env(path: str = ".env") -> None:
    """Charge un fichier .env simple (CLE=valeur) dans os.environ, sans écraser l'existant."""
    if not os.path.exists(path):
        return
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


class SgtClient:
    def __init__(self, club_url: str, api_key: str | None = None):
        # Accepte « LetsGolf » ou l'adresse complète https://simulatorgolftour.com/club/LetsGolf
        self.club_url = club_url.strip().rstrip("/").split("/")[-1]
        self.api_key = api_key

    @classmethod
    def from_env(cls) -> "SgtClient":
        """Crée un client depuis SGT_CLUB_URL et SGT_API_KEY, ou se connecte avec SGT_USERNAME / SGT_PASSWORD."""
        load_env()
        club = os.environ.get("SGT_CLUB_URL")
        if not club:
            raise SgtApiError("SGT_CLUB_URL manquant (voir .env.example)")
        client = cls(club, os.environ.get("SGT_API_KEY"))
        if not client.api_key:
            user, pwd = os.environ.get("SGT_USERNAME"), os.environ.get("SGT_PASSWORD")
            if not (user and pwd):
                raise SgtApiError("SGT_API_KEY ou SGT_USERNAME + SGT_PASSWORD manquants")
            client.login(user, pwd)
        return client

    def _url(self, endpoint: str, params: dict | None = None) -> str:
        url = f"{BASE_URL}/{urllib.parse.quote(self.club_url)}/{endpoint}"
        if params:
            url += "?" + urllib.parse.urlencode(params)
        return url

    def _send(self, req: urllib.request.Request):
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            raise SgtApiError(f"HTTP {e.code} sur {req.full_url.split('?')[0]}") from None

    def _post(self, endpoint: str, data: dict):
        body = urllib.parse.urlencode(data).encode("utf-8")
        req = urllib.request.Request(self._url(endpoint), data=body, method="POST")
        return self._send(req)

    def _get(self, endpoint: str, **params):
        if not self.api_key:
            raise SgtApiError("Pas de clé API : appelle login() d'abord")
        params["api-key"] = self.api_key
        return self._send(urllib.request.Request(self._url(endpoint, params)))

    # Clé API (valable 24 h à la création, 1 h après un refresh)
    def login(self, username: str, password: str) -> str:
        res = self._post("apikey/create", {"username": username, "password": password})
        if not res.get("success"):
            raise SgtApiError("Connexion refusée")
        self.api_key = res["key"]
        return self.api_key

    def refresh(self) -> str:
        res = self._post("apikey/refresh", {"api-key": self.api_key})
        if not res.get("success"):
            raise SgtApiError("Renouvellement de la clé refusé")
        self.api_key = res["key"]
        return self.api_key

    # Lecture seule
    def tours(self):
        return self._get("tours/list")

    def tour_members(self, tour_id: int):
        return self._get("tours/members", tourId=tour_id)

    def tour_standings(self, tour_id: int, gross_or_net: str | None = None):
        params = {"tourId": tour_id}
        if gross_or_net:
            params["grossOrNet"] = gross_or_net
        return self._get("tours/standings", **params)

    def tournaments(self, tour_id: int):
        return self._get("tournaments/list", tourId=tour_id)

    def scorecards(self, tournament_id: int):
        return self._get("tournaments/scorecards", tournamentId=tournament_id)

    def tournament_stats(self, tournament_id: int):
        return self._get("tournaments/stats", tournamentId=tournament_id)

    def registrations(self, tournament_id: int):
        return self._get("registrations/view", tournamentId=tournament_id)

    def fetch_tour(self, tour_id: int, label: str) -> dict:
        """Tout ce qu'il faut pour un tour : membres et, pour chaque tournoi, les scorecards."""
        info = next((t for t in self.tours() if t["tourId"] == tour_id), None)
        if info is None:
            raise SgtApiError(f"Tour {tour_id} introuvable dans ce club")
        tournaments = self.tournaments(tour_id).get("results", [])
        for t in tournaments:
            t["scorecards"] = self.scorecards(t["tournamentId"])
            try:  # les statistiques sont un plus : leur absence ne doit jamais bloquer les classements
                t["stats"] = self.tournament_stats(t["tournamentId"])
            except SgtApiError:
                t["stats"] = None
        return {
            "tour_id": tour_id,
            "label": label,
            "name": info["name"],
            "admin": info.get("admin_uid"),
            "members": self.tour_members(tour_id),
            "tournaments": tournaments,
        }
