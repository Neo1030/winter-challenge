"""Explore la Club Admin API en lecture seule : liste les tours et les tournois du club.

Usage :
  python3 scripts/sgt_discover.py                 # tours, puis tournois de chaque tour
  python3 scripts/sgt_discover.py --scorecards ID # enregistre les scorecards d'un tournoi dans data/

Les identifiants viennent du fichier .env (voir .env.example).
"""

import argparse
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from winter_challenge.sgt_api import SgtApiError, SgtClient  # noqa: E402


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--scorecards", type=int, metavar="TOURNAMENT_ID")
    args = parser.parse_args()
    try:
        client = SgtClient.from_env()
        if args.scorecards:
            cards = client.scorecards(args.scorecards)
            os.makedirs("data", exist_ok=True)
            out = f"data/scorecards_{args.scorecards}.json"
            with open(out, "w", encoding="utf-8") as f:
                json.dump(cards, f, ensure_ascii=False, indent=2)
            print(f"{len(cards)} scorecards enregistrées dans {out}")
            return
        for tour in client.tours():
            print(json.dumps(tour, ensure_ascii=False))
            tour_id = tour.get("tourId") or tour.get("id")
            if tour_id:
                for tournament in client.tournaments(tour_id).get("results", []):
                    print("   ", json.dumps(tournament, ensure_ascii=False))
    except SgtApiError as e:
        sys.exit(f"Erreur API : {e}")


if __name__ == "__main__":
    main()
