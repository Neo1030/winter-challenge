"""10 variantes du flocon « cerné » (taille et modèle), balle sans contour. Réutilise generer_logo.py."""
import math
from pathlib import Path

import generer_logo as g

DEEP, PALE = g.DEEP, g.PALE


def arms(cx, cy, r, branches, tip=None):
    """Segments d'un flocon à 6 bras. branches : liste de (position sur le bras 0-1, longueur 0-1, angle en degrés)."""
    segs, extra = [], []
    for k in range(6):
        a = math.radians(90 + 60 * k)
        ex, ey = cx + r * math.cos(a), cy - r * math.sin(a)
        segs.append((cx, cy, ex, ey))
        for pos, length, ang in branches:
            bx, by = cx + r * pos * math.cos(a), cy - r * pos * math.sin(a)
            for s in (-1, 1):
                b = a + s * math.radians(ang)
                segs.append((bx, by, bx + r * length * math.cos(b), by - r * length * math.sin(b)))
        if tip:
            extra.append((ex, ey))
    return segs, extra


def cerne(segs, w, dots=(), dot_r=0, hexagon=None):
    """Rendu « cerné » : trait bleu foncé épais dessous, bleu clair fin dessus."""
    def layer(color, width, grow):
        lines = "".join(f'<line x1="{a:.2f}" y1="{b:.2f}" x2="{c:.2f}" y2="{d:.2f}"/>' for a, b, c, d in segs)
        circles = "".join(f'<circle cx="{x:.2f}" cy="{y:.2f}" r="{dot_r + grow:.2f}" fill="{color}"/>' for x, y in dots)
        hexa = ""
        if hexagon:
            cx, cy, hr = hexagon
            pts = " ".join(f"{cx + (hr + grow) * math.cos(math.radians(60*i + 30)):.2f},{cy + (hr + grow) * math.sin(math.radians(60*i + 30)):.2f}" for i in range(6))
            hexa = f'<polygon points="{pts}" fill="{color}" stroke="{color}" stroke-width="{width*0.4:.2f}" stroke-linejoin="round"/>'
        return f'<g stroke="{color}" stroke-width="{width:.2f}" stroke-linecap="round" fill="none">{lines}</g>{hexa}{circles}'
    return layer(DEEP, w * 1.45, w * 0.37) + layer(PALE, w * 0.7, 0)


def flake_model(model, cx, cy, R, w):
    if model == "classique":
        return cerne(arms(cx, cy, R, [(0.58, 0.32, 40)])[0], w)
    if model == "double":
        return cerne(arms(cx, cy, R, [(0.42, 0.26, 45), (0.72, 0.2, 45)])[0], w)
    if model == "fleche":
        return cerne(arms(cx, cy, R, [(0.78, 0.22, 35)])[0], w)
    if model == "plaque":
        return cerne(arms(cx, cy, R, [(0.66, 0.24, 50)])[0], w, hexagon=(cx, cy, R * 0.26))
    if model == "boules":
        segs, tips = arms(cx, cy, R * 0.86, [(0.55, 0.26, 45)], tip=True)
        return cerne(segs, w, dots=tips, dot_r=w * 0.75)
    if model == "dendrite":
        return cerne(arms(cx, cy, R, [(0.35, 0.3, 50), (0.58, 0.24, 50), (0.8, 0.14, 50)])[0], w * 0.85)
    if model == "trapu":
        return cerne(arms(cx, cy, R * 0.8, [(0.5, 0.38, 55)])[0], w * 1.35)
    if model == "fin":
        return cerne(arms(cx, cy, R, [(0.6, 0.3, 38)])[0], w * 0.7)
    raise ValueError(model)


VARIANTES = [
    ("classique", 0.52, "Classique", "Le gagnant, tel quel, pour comparer."),
    ("classique", 0.62, "Classique, plus grand", "Le même flocon, plus grand dans la balle."),
    ("classique", 0.42, "Classique, plus petit", "Plus petit : la trame d'ombre prend plus de place."),
    ("double", 0.56, "Double branche", "Deux paires de branches par bras : plus riche, plus « neige »."),
    ("fleche", 0.56, "Pointes en flèche", "Une seule paire de branches au bout des bras, en pointe de flèche."),
    ("plaque", 0.56, "Plaque étoilée", "Un hexagone au centre, comme un cristal de glace."),
    ("boules", 0.6, "Bouts ronds", "Les bras se terminent par de petites boules, plus doux."),
    ("dendrite", 0.6, "Dendrite", "Trois paires de branches qui raccourcissent vers le bout : le flocon le plus fin."),
    ("trapu", 0.56, "Trapu", "Bras courts et épais, très lisible en petit."),
    ("fin", 0.6, "Fin et grand", "Trait plus fin, flocon plus grand : élégant, plus discret."),
]


def ball(cx, cy, r, model, size):
    base = g.ball(cx, cy, r, style="aucun", ring=False)
    base = base[:base.rfind('<g stroke=')]                     # on retire le flocon par défaut
    return base + flake_model(model, cx, cy, r * size, r / 13)


def logo(model, size):
    arc = f'<path d="M24 82 C 110 26, 270 14, 352 38" fill="none" stroke="{g.SKY}" stroke-width="2" stroke-dasharray="1 7" stroke-linecap="round"/>'
    w1, x = g.text_path("WINTER ", "Black Italic", 29, 26, 100, g.NAVY)
    w2, _ = g.text_path("CHALLENGE", "Black Italic", 29, x, 100, g.SKY)
    t, _ = g.text_path("PAR LET’S GOLF", "Book", 9.5, 28, 121, g.MID, spacing=0.28)
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 130" width="420" height="130" role="img" aria-label="Winter Challenge">{arc}{ball(378, 42, 24, model, size)}{w1}{w2}{t}</svg>'


def icon(model, size, px=64):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="{px}" height="{px}" role="img" aria-label="Winter Challenge">{ball(32, 32, 30, model, size)}</svg>'


if __name__ == "__main__":
    Path("v10").mkdir(exist_ok=True)
    cards = []
    for i, (model, size, name, desc) in enumerate(VARIANTES, start=1):
        open(f"v10/winter-challenge-logo-{i:02d}.svg", "w", encoding="utf-8").write(logo(model, size))
        open(f"v10/winter-challenge-icone-{i:02d}.svg", "w", encoding="utf-8").write(icon(model, size))
        cards.append(f'<div class="card"><h3>{i}. {name}</h3><p>{desc}</p>{icon(model, size, 200)}<div>{logo(model, size)}</div><div>{icon(model, size, 48)} {icon(model, size, 24)}</div></div>')
    html = f'''<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Flocon cerné, 10 variantes</title>
<style>body{{margin:0;padding:24px;background:#f4f7fa;font:15px Arial,sans-serif;color:#001c33}}.row{{display:flex;gap:18px;flex-wrap:wrap;align-items:flex-start}}
.card{{background:#fff;border-radius:14px;padding:16px;box-shadow:0 4px 18px rgba(0,28,51,.08);width:440px}} h3{{margin:0 0 4px;font-size:16px}} p{{margin:0 0 10px;color:#50677a}} svg{{max-width:100%;height:auto}}</style></head><body>
<h1 style="font-size:20px">Flocon cerné · 10 variantes de taille et de modèle (balle sans contour)</h1><div class="row">{"".join(cards)}</div></body></html>'''
    open("v10/flocon-cerne.html", "w", encoding="utf-8").write(html)
    print("ok")
