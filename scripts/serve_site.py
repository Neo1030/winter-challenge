"""Sert le dossier site/ sur http://127.0.0.1:8765 pour le voir en local (python3 scripts/serve_site.py)."""

import functools
import http.server
import os

ROOT = os.path.join(os.path.dirname(os.path.realpath(__file__)), "..", "site")
PORT = int(os.environ.get("PORT", "8765"))

if __name__ == "__main__":
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=os.path.realpath(ROOT))
    print(f"Site sur http://127.0.0.1:{PORT}")
    http.server.ThreadingHTTPServer(("127.0.0.1", PORT), handler).serve_forever()
