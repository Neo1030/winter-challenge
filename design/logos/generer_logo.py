"""Logo Winter Challenge : arc en pointillés, balle-flocon en trame d'ombre (trame 15, points jamais collés), lettrage.

python3 generer_logo.py  -> écrit les variantes du flocon dans v9/ et la planche v9/flocon-relief.html
"""
import math
from pathlib import Path

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

# La police de Let's Golf (Gotham), prise dans la charte graphique PHIDA. Le lettrage est converti en tracés : le logo
# s'affiche pareil partout, sans installer la police (et la police elle-même n'est jamais publiée).
FONTS = Path.home() / ".claude/skills/synced/401e67f2-29e3-4704-b5e4-4ba9a4870fde_c3415ab3-bbb9-4047-84b8-62a224cc4867/phida-charte-graphique/assets/fonts"
_fonts = {}


def text_path(text, style, size, x, y, color, spacing=0.0):
    """Texte en tracés SVG, avec la Gotham ; x, y = début de la ligne de base ; spacing en part de la taille."""
    if style not in _fonts:
        _fonts[style] = TTFont(FONTS / f"Gotham HTF {style}.otf")
    font = _fonts[style]
    gs, cmap = font.getGlyphSet(), font.getBestCmap()
    scale = size / font["head"].unitsPerEm
    out, pen_x = [], x
    for ch in text:
        name = cmap.get(ord(ch))
        if name is None:
            continue
        pen = SVGPathPen(gs)
        gs[name].draw(TransformPen(pen, (scale, 0, 0, -scale, pen_x, y)))
        d = pen.getCommands()
        if d:
            out.append(d)
        pen_x += gs[name].width * scale + spacing * size
    return f'<path fill="{color}" d="{" ".join(out)}"/>', pen_x

NAVY, SKY, MID, DEEP, PALE = "#00335B", "#109CDC", "#3899D7", "#0B6FA4", "#9FD6F2"
FONT = "font-family=\"Figtree, 'Gotham', 'Helvetica Neue', Arial, sans-serif\""


def flake_lines(cx, cy, r):
    """Segments du flocon : (x1, y1, x2, y2, angle du bras)."""
    segs = []
    for k in range(6):
        a = math.radians(90 + 60 * k)
        segs.append((cx, cy, cx + r * math.cos(a), cy - r * math.sin(a), a))
        bx, by = cx + r * .58 * math.cos(a), cy - r * .58 * math.sin(a)
        for s in (-1, 1):
            b = a + s * math.radians(40); l = r * .32
            segs.append((bx, by, bx + l * math.cos(b), by - l * math.sin(b), a))
    return segs


def flake(cx, cy, r, color, w, dx=0.0, dy=0.0, segs=None):
    segs = segs or flake_lines(cx, cy, r)
    lines = "".join(f'<line x1="{x1 + dx:.2f}" y1="{y1 + dy:.2f}" x2="{x2 + dx:.2f}" y2="{y2 + dy:.2f}"/>' for x1, y1, x2, y2, _ in segs)
    return f'<g stroke="{color}" stroke-width="{w:.2f}" stroke-linecap="round" fill="none">{lines}</g>'


def flake_relief(cx, cy, r, style, w):
    if style == "ombre":       # ombre portée bleu foncé, décalée en bas à droite, sous le flocon bleu ciel
        o = w * 0.75
        return flake(cx, cy, r, DEEP, w, o, o) + flake(cx, cy, r, SKY, w)
    if style == "facettes":    # chaque bras : côté lumière bleu clair, côté ombre bleu foncé (cristal à facettes)
        out = []
        for x1, y1, x2, y2, a in flake_lines(cx, cy, r):
            nx, ny = -math.sin(a), -math.cos(a)            # normale au bras
            lit = (nx * -1 + ny * -1) > 0                  # la lumière vient d'en haut à gauche
            off = w * 0.28
            for side, color in ((1, PALE if lit else DEEP), (-1, DEEP if lit else PALE)):
                out.append(f'<line x1="{x1 + side*off*nx:.2f}" y1="{y1 + side*off*ny:.2f}" x2="{x2 + side*off*nx:.2f}" y2="{y2 + side*off*ny:.2f}" stroke="{color}" stroke-width="{w*0.6:.2f}" stroke-linecap="round"/>')
        return '<g fill="none">' + "".join(out) + "</g>" + flake(cx, cy, r, SKY, w * 0.42)
    if style == "contour":     # flocon cerné : trait bleu foncé dessous, bleu ciel clair dessus
        return flake(cx, cy, r, DEEP, w * 1.45) + flake(cx, cy, r, PALE, w * 0.7)
    return flake(cx, cy, r, SKY, w)


def shadow(cx, cy, r, x, y, soft=0.5):
    lx, ly, lr = cx - 0.28 * r, cy - 0.28 * r, 0.95 * r
    return max(0.0, min(1.0, (math.hypot(x - lx, y - ly) - lr * 0.62) / (lr * soft)))


def ball(cx, cy, r, style="plat", density=15, gamma=0.8, maxr=0.40, ring=True):
    """Balle en trame d'ombre : points plus gros dans l'ombre, plus petits vers la lumière et le bord, jamais collés."""
    step = 2 * r / density
    stroke = r / 20
    dots, j, y = [], 0, cy - r
    while y <= cy + r:
        x = cx - r + (step / 2 if j % 2 else 0)
        while x <= cx + r:
            d = math.hypot(x - cx, y - cy)
            s = shadow(cx, cy, r, x, y) ** gamma
            size = step * maxr * s
            t = d / r
            if t > 0.78:
                size *= max(0.0, 0.25 + 0.75 * (1 - t) / 0.22)
            size = min(size, r - (stroke / 2 if ring else 0) - d - step * 0.12)
            if s > 0 and size > step * 0.06:
                dots.append((x, y, size))
            x += step
        y += step * 0.866; j += 1
    svg = "".join(f'<circle cx="{x:.2f}" cy="{y:.2f}" r="{s:.2f}"/>' for x, y, s in dots)
    contour = f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="none" stroke="{SKY}" stroke-width="{stroke:.2f}"/>' if ring else ""
    return f'<g fill="{SKY}" opacity="0.88">{svg}</g>' + contour + flake_relief(cx, cy, r * .52, style, r / 13)


def logo(style, dark=False, ring=True):
    arc = f'<path d="M24 82 C 110 26, 270 14, 352 38" fill="none" stroke="{SKY}" stroke-width="2" stroke-dasharray="1 7" stroke-linecap="round"/>'
    first, tag = ("#FFFFFF", "#8FD0F0") if dark else (NAVY, MID)
    w1, x = text_path("WINTER ", "Black Italic", 29, 26, 100, first)
    w2, _ = text_path("CHALLENGE", "Black Italic", 29, x, 100, SKY)
    t, _ = text_path("PAR LET\u2019S GOLF", "Book", 9.5, 28, 121, tag, spacing=0.28)
    bg = '<rect width="420" height="130" fill="#001c33"/>' if dark else ""
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 130" width="420" height="130" role="img" aria-label="Winter Challenge">{bg}{arc}{ball(378, 42, 24, style, ring=ring)}{w1}{w2}{t}</svg>'


def icon(style, size=64, ring=True):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="{size}" height="{size}" role="img" aria-label="Winter Challenge">{ball(32, 32, 30, style, ring=ring)}</svg>'


if __name__ == "__main__":
    V = [("plat", "Flocon uni", "Le flocon bleu ciel uni, pour comparer."),
         ("ombre", "Ombre portée", "Une ombre bleu foncé décalée en bas à droite, comme la balle : le flocon se détache du fond."),
         ("facettes", "Facettes", "Chaque bras a un côté clair (lumière, en haut à gauche) et un côté foncé : un cristal taillé."),
         ("contour", "Cerné", "Un trait bleu foncé sous un bleu ciel clair : le flocon paraît en relief, comme gravé.")]
    Path("v9").mkdir(exist_ok=True)
    rows = []
    for ring, title in ((True, "Avec le contour de la balle"), (False, "Sans le contour de la balle")):
        cards = []
        for code, name, desc in V:
            suffix = "" if ring else "-sans-contour"
            open(f"v9/winter-challenge-logo-{code}{suffix}.svg", "w", encoding="utf-8").write(logo(code, ring=ring))
            open(f"v9/winter-challenge-icone-{code}{suffix}.svg", "w", encoding="utf-8").write(icon(code, ring=ring))
            cards.append(f'<div class="card"><h3>{name}</h3><p>{desc}</p>{icon(code, 200, ring)}<div>{logo(code, ring=ring)}</div><div>{icon(code, 48, ring)} {icon(code, 24, ring)}</div></div>')
        rows.append(f'<h2>{title}</h2><div class="row">{"".join(cards)}</div>')
    html = f'''<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Flocon en relief</title>
<style>body{{margin:0;padding:24px;background:#f4f7fa;font:15px Arial,sans-serif;color:#001c33}}.row{{display:flex;gap:18px;flex-wrap:wrap;align-items:flex-start}}
.card{{background:#fff;border-radius:14px;padding:16px;box-shadow:0 4px 18px rgba(0,28,51,.08);width:440px}} h3{{margin:0 0 4px;font-size:16px}} p{{margin:0 0 10px;color:#50677a}} svg{{max-width:100%;height:auto}}</style></head><body>
<h1 style="font-size:20px">Logo · lettrage en Gotham (police Let's Golf), flocon en relief, avec ou sans contour de balle</h1>{"".join(rows)}</body></html>'''
    open("v9/flocon-relief.html", "w", encoding="utf-8").write(html)
    print("ok")
