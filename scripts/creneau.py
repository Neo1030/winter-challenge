"""Dit si la mise à jour automatique doit tourner maintenant (heure de Suisse, été et hiver compris).

GitHub lance la tâche toutes les 5 minutes en journée et toutes les heures la nuit, en heure UTC.
Ce script décale tout sur l'heure de Zurich : toutes les 5 minutes de 08:00 à 21:59, puis une fois par heure.

Écrit « lancer=oui » ou « lancer=non » dans le fichier GITHUB_OUTPUT (ou à l'écran hors de GitHub),
et « entretien=oui » une fois par nuit (voir le fichier de la tâche : empêche GitHub de la désactiver).
"""

import os
import sys
from datetime import datetime
from zoneinfo import ZoneInfo

DAY_START, DAY_END = 8, 22      # de 08:00 inclus à 22:00 exclu : toutes les 5 minutes
NIGHT_MINUTES = 5               # la nuit : seulement dans les 5 premières minutes de l'heure
KEEPALIVE_HOUR = 3


def decide(now, forced=False):
    """now : datetime à l'heure de Zurich. Retourne (lancer, entretien)."""
    day = DAY_START <= now.hour < DAY_END
    run = forced or day or now.minute < NIGHT_MINUTES
    keepalive = now.hour == KEEPALIVE_HOUR and now.minute < NIGHT_MINUTES
    return run, keepalive


def main():
    forced = os.environ.get("FORCER") == "true" or os.environ.get("GITHUB_EVENT_NAME") not in (None, "schedule")
    run, keepalive = decide(datetime.now(ZoneInfo("Europe/Zurich")), forced)
    lines = [f"lancer={'oui' if run else 'non'}", f"entretien={'oui' if keepalive else 'non'}"]
    out = os.environ.get("GITHUB_OUTPUT")
    if out:
        with open(out, "a", encoding="utf-8") as f:
            f.write("\n".join(lines) + "\n")
    print(" ".join(lines))
    return 0


if __name__ == "__main__":
    sys.exit(main())
