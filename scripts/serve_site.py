"""Sert le dossier site/ sur http://127.0.0.1:8765 pour le voir en local (python3 scripts/serve_site.py).

Avec --demo, le site affiche les données fictives de data/saison_demo.json à la place de site/donnees/saison.json,
sans toucher à ce dernier (le déploiement n'envoie donc jamais de données fictives). Voir LISEZ-MOI.md."""

import sys

import functools
import http.server
import os

ROOT = os.path.join(os.path.dirname(os.path.realpath(__file__)), "..", "site")
PORT = int(os.environ.get("PORT", "8765"))

DEMO_FILE = os.path.realpath(os.path.join(ROOT, "..", "data", "saison_demo.json"))


class Handler(http.server.SimpleHTTPRequestHandler):
    demo = False

    def translate_path(self, path):
        if self.demo and path.split("?")[0] == "/donnees/saison.json":
            return DEMO_FILE
        return super().translate_path(path)


if __name__ == "__main__":
    Handler.demo = "--demo" in sys.argv
    if Handler.demo and not os.path.exists(DEMO_FILE):
        sys.exit("Pas de données fictives : voir site/LISEZ-MOI.md, « Données de démonstration ».")
    handler = functools.partial(Handler, directory=os.path.realpath(ROOT))
    print(f"Site sur http://127.0.0.1:{PORT}" + (" (données fictives)" if Handler.demo else ""))
    http.server.ThreadingHTTPServer(("127.0.0.1", PORT), handler).serve_forever()
