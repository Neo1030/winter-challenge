/* Winter Challenge Results · page télé (tv.html), dans l'habillage « Trajectoire » du site ; l'ancienne page est sous v1/tv.html.
   Même déroulé que tv.js : pour chaque compétition, les classements de chaque catégorie (net puis brut), puis les statistiques
   de la semaine en cours ; le Short Game est en brut seulement (ni net ni handicap). Lit donnees/saison.json, relu chaque minute.
   À gauche, le panneau de la semaine : numéro, dates, parcours et réglages, parcours suivant (jamais plus loin), meilleurs totaux.
   Écrit pour les anciens navigateurs des lecteurs d'affichage (Zebrix…) : pas de « ?. » ni de « ?? », pas de .at(), .flat(), replaceAll.
   Réglages dans l'adresse :  tv.html?duree=6  (secondes par page de classement, 4 par défaut)
   tv.html?stats=12  (secondes par page de statistiques, 8 par défaut, ou le double de ?duree=)   tv.html?lignes=5  (lignes par page au maximum)
   tv.html?debut=stats  (commence par les statistiques)   tv.html?debug=1  (navigateur, taille, erreurs, durée d'un tour complet) */
(() => {
  "use strict";

  const $ = (sel) => document.querySelector(sel);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const num = (n) => (n == null ? "–" : String(n).replace(/\B(?=(\d{3})+(?!\d))/g, "'"));
  const dec = (n, d) => (n == null ? "–" : Number(n).toFixed(d).replace(".", ","));
  const day = (iso) => (iso ? iso.slice(0, 10).split("-").reverse().join(".") : "");
  const key = (s) => String(s == null ? "" : s).toLowerCase().replace(/[^a-z0-9]/g, "");

  const params = new URLSearchParams(location.search);
  const DURATION = Math.max(2, Number(params.get("duree")) || 4) * 1000;                                    // une page de classement
  const DURATION_STATS = Math.max(2, Number(params.get("stats")) || (params.get("duree") ? DURATION / 500 : 8)) * 1000;   // une page de statistiques
  const durationOf = (s) => (s && s.kind === "stats" ? DURATION_STATS : DURATION);
  const MAX_ROWS = Number(params.get("lignes")) || 0;
  const START_STATS = params.get("debut") === "stats";
  const REFRESH = 60 * 1000;
  const ROW_VH = 0.07;                                           // hauteur visée d'une ligne, en part de la hauteur de l'écran
  const HEAD_VH = 0.044;                                         // hauteur des titres de colonnes

  const area = $("#tv-area");
  const card = $(".carte");
  const vol = $(".vol");
  let data = null;
  let comps = [];       // les compétitions : le Winter Challenge (racine du fichier), puis les autres (Short Game…)
  let shown = null;     // compétition dont le panneau de gauche est affiché
  let slides = [];
  let index = 0;
  let timer = null;

  /* Compteur qui monte jusqu'à la valeur ; la valeur finale est toujours posée, même si le navigateur n'anime pas */
  function countUp(el, end, fmt, ms) {
    const done = () => { el.innerHTML = fmt(end); };
    if (!window.requestAnimationFrame || !end) { done(); return; }
    let t0 = null;
    el.innerHTML = fmt(0);
    const tick = (t) => {
      if (t0 == null) t0 = t;
      const k = Math.min(1, (t - t0) / ms);
      el.innerHTML = fmt(end * (1 - Math.pow(1 - k, 3)));
      if (k < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    setTimeout(done, ms + 500);
  }

  /* ---------- Panneau de gauche (celui de la compétition affichée) ---------- */
  const SITE = "winterchallenge.letsgolf.ch";                    // adresse écrite à côté du QR code
  const isWC = (c) => c.prefixe === "WC";
  const NINE = { Front: "trous 1 à 9", Back: "trous 10 à 18", All: "les 18 trous" };
  const TEES = { par3: ["Par 3", "#35abe2"], white: ["Blanc", "#f4f7fa"], yellow: ["Jaune", "#ffd23f"], blue: ["Bleu", "#3b8eea"], black: ["Noir", "#1c232b"], red: ["Rouge", "#e5484d"],
    gold: ["Or", "#d4a72c"], green: ["Vert", "#3fb27f"], orange: ["Orange", "#f08c2e"], silver: ["Argent", "#b8c2cc"], junior: ["Junior", "#8fa8bb"] };
  const tee = (n) => { const t = TEES[key(n)]; return `<i class="tee" style="--c:${t ? t[1] : "#8fa8bb"}"></i>${esc(t ? t[0] : n)}`; };
  const metres = (v) => {                                        // les distances de SGT sont en pieds : on les affiche en mètres
    const m = /^(\d+(?:\.\d+)?)\s*(?:feet|ft)$/i.exec(String(v == null ? "" : v).trim());
    return m ? dec(Number(m[1]) * 0.3048, 1) + " m" : v;
  };
  const period = (e) => (!e.fin || e.fin <= e.debut ? "le " + day(e.debut) : "du " + day(e.debut) + " au " + day(e.fin));

  /* Maintenance : une donnée que l'API SGT donnait et ne donne plus (voir winter_challenge/surveillance.py). La mise à jour pose
     les zones touchées dans « maintenance » (classement, parcours, une par statistique) ; elles reviennent seules avec les données. */
  const down = (c, zone) => !!c && Object.prototype.toString.call(c.maintenance) === "[object Array]" && c.maintenance.indexOf(zone) >= 0;
  const WARN = '<svg class="panne" viewBox="0 0 24 24"><path d="M12 3.2 2.6 19.8h18.8z"/><path d="M12 9.6v4.6M12 16.9v.2"/></svg>';

  function leader(c, kind) {
    let best = null;
    for (const cat of c.categories) {
      const r = (cat.classement[kind] || []).find((x) => x.rang === 1);
      if (r && (!best || r.total > best.total)) best = { name: r.joueur, total: r.total, cat: cat.nom };
    }
    return best;
  }

  /* Semaine affichée : celle en cours d'après le calendrier de SGT, sinon la dernière qui a des résultats.
     Et le parcours d'après : un seul, celui de la semaine suivante, jamais plus loin. */
  function calendar(c) {
    const list = c.parcours || [];
    const last = c.semaines.length ? c.semaines[c.semaines.length - 1] : null;
    let cur = list.find((e) => e.statut === "en_cours") || null;
    if (!cur && last) cur = list.find((e) => e.semaine === last.numero) || { semaine: last.numero, nom: last.parcours, debut: last.debut, fin: last.fin, statut: last.statut };
    if (!cur) return { cur: null, next: null };
    let next = list.find((e) => e.semaine === cur.semaine + 1 && e.statut === "a_venir") || null;
    const pc = c.parcours_semaine;
    if (!next && pc && pc.semaine === cur.semaine + 1) next = pc;
    return { cur, next };
  }

  function settings(c, e) {
    const r = e.reglages || {};
    const per = (e.par_categorie || []).filter((p) => p.depart);
    const out = [];
    if (per.length > 1 && per.some((p) => p.depart !== per[0].depart)) {
      per.slice(0, 3).forEach((p) => out.push(["Départ " + esc(p.categorie), tee(p.depart)]));
    } else if (e.depart || r.depart) out.push(["Départ", tee(e.depart || r.depart)]);
    if (r.stimp != null) out.push(["Stimp", esc(r.stimp)]);
    if (r.gimmies) out.push(["Gimmies", esc(metres(r.gimmies))]);
    if (r.vent) out.push(["Vent", esc(r.vent)]);
    if (r.fairways) out.push(["Fairways", esc(r.fairways)]);
    if (r.greens) out.push(["Greens", esc(r.greens)]);
    return out.slice(0, 3 * Math.floor(out.length / 3) || out.length);   // des rangées de trois complètes
  }

  function renderPanel(c) {
    shown = c;
    const cal = calendar(c);
    const cur = cal.cur;
    const next = cal.next;
    const weeks = c.semaines;
    const multi = c.categories.length > 1;
    const word = isWC(c) ? "semaine" : "mois";
    const best = (kind, label) => {
      if (down(c, "classement")) return `<div class="p-bloc"><div class="lab">${label}</div><div class="val un">–</div><div class="note">En maintenance</div></div>`;
      const b = leader(c, kind);
      return `<div class="p-bloc"><div class="lab">${label}</div><div class="val un">${b ? esc(b.name) : "–"}</div>
        <div class="note">${b ? `<b>${num(b.total)}</b> points${multi ? " · " + esc(b.cat) : ""}` : "Pas encore de résultat"}</div></div>`;
    };
    let i = 0;
    let h = `<div class="p-tete" style="--i:${i++}"><div class="p-comp"><span>${esc(c.nom)}</span>${cur && cur.statut === "en_cours" ? '<span class="live">en cours</span>' : ""}</div>
      <div class="p-num"><span class="n"><i>${esc(c.prefixe)}</i>${cur ? cur.semaine : "–"}</span></div>
      <div class="p-dates">${cur ? period(cur) : ""}</div></div>`;
    if (cur) {
      const note = [NINE[cur.neuf] || "", cur.par ? "par " + cur.par : "", cur.lieu || ""].filter((s) => s).map(esc).join(" · ");
      h += `<div class="p-bloc" style="--i:${i++}"><div class="lab">Parcours</div><div class="val">${esc(cur.nom)}</div>${note ? `<div class="note">${note}</div>` : ""}</div>`;
      const st = down(c, "parcours") ? [["Réglages", "En maintenance"]] : settings(c, cur);
      if (st.length) h += `<div class="p-regl" style="--i:${i++}">${st.map((s) => `<div class="rg"><div class="lab">${s[0]}</div><b>${s[1]}</b></div>`).join("")}</div>`;
    }
    if (next) {
      h += `<div class="p-bloc p-suite" style="--i:${i++}"><div class="lab">${isWC(c) ? "Semaine prochaine" : "Mois prochain"} · ${esc(c.prefixe)}${next.semaine}</div>
        <div class="val un">${esc(next.nom)}</div><div class="note">${[next.debut ? "dès le " + day(next.debut) : "", NINE[next.neuf] || ""].filter((s) => s).join(" · ")}</div></div>`;
    }
    /* Short Game : brut seulement, pas de « Meilleur net » */
    h += `<div class="p-leaders${c.brut_seul ? " seul" : ""}" style="--i:${i++}">${c.brut_seul ? "" : best("net", "Meilleur net")}${best("brut", "Meilleur brut")}</div>`;
    const played = weeks.length + " " + (weeks.length > 1 && word === "semaine" ? "semaines" : word) + " " + (isWC(c) ? ["jouée", "jouées"] : ["joué", "joués"])[weeks.length > 1 ? 1 : 0];
    /* Le QR code mène au site des joueurs (assets/qr-site.svg, à régénérer si l'adresse change) */
    h += `<div class="p-qr" style="--i:${i++}"><span class="qr"><img src="assets/qr-site.svg" alt="QR code vers ${SITE}"></span>
      <div class="qt"><div class="lab">Le site sur ton téléphone</div><div class="adr">${SITE}</div>
      <div class="note"><b>${c.joueurs.length}</b> joueurs · <b>${weeks.length}</b>${played.replace(/^\d+/, "")}</div></div></div>`;
    const panel = $("#tv-panneau");
    panel.innerHTML = h;
    /* si le panneau déborde (noms de parcours sur deux lignes…), le QR code rétrécit un peu plutôt que d'être coupé */
    const qr = panel.querySelector(".p-qr");                     // mesuré à la position des blocs : l'animation d'arrivée fausse scrollHeight
    if (qr.offsetTop + qr.offsetHeight > panel.clientHeight - parseFloat(getComputedStyle(panel).paddingBottom) + 1) qr.className += " petit";
    $("#tv-demo").hidden = !data.demo;
  }

  /* ---------- Pages du classement ---------- */
  /* Toutes les lignes ont la même hauteur sur toutes les pages : on compte combien de lignes d'environ 7 % de la hauteur
     de l'écran tiennent sous les titres de colonnes, puis on les étire pour remplir la carte */
  const headH = () => HEAD_VH * window.innerHeight;
  const slots = () => Math.max(3, Math.floor((area.clientHeight - headH()) / (ROW_VH * window.innerHeight)));
  const rowHeight = () => (area.clientHeight - headH()) / slots();
  const rowsFit = () => (MAX_ROWS ? Math.min(MAX_ROWS, slots()) : slots());
  /* Largeurs en multiples de la hauteur de ligne : rang, évolution, [joueur : le reste], handicap, semaines…, total */
  const W = { rank: 1.05, evo: 1.15, name: 4.2, hdc: 1.1, week: 1.2, total: 1.9 };
  const innerW = () => area.clientWidth - 2 * parseFloat(getComputedStyle(area).paddingLeft || 0);
  const weeksFit = (comp, h) => {
    const fixed = (W.rank + W.evo + W.name + (comp.brut_seul ? 0 : W.hdc) + W.total) * h;
    return Math.max(0, Math.floor((innerW() - fixed) / (W.week * h)));
  };

  /* ---------- Statistiques de la semaine : les tuiles du site (FIR, GIR, drive, closest to the pin, putts rentrés) ---------- */
  const ring = (t) => `<svg viewBox="0 0 120 100"><circle class="dz f" cx="60" cy="50" r="40"/><circle class="dt" pathLength="100" style="--off:${(100 - Math.max(0, Math.min(100, t.valeur))).toFixed(1)}" cx="60" cy="50" r="40" transform="rotate(-90 60 50)"/></svg>`;
  const TILES = [
    ["fir", "FIR", "Fairways touchés", 1, "%", () => "", ring],
    ["gir", "GIR", "Greens en régulation", 1, "%", () => "", ring],
    ["drive", "Longest drive", "Plus long drive, fairway ou semi-rough", 1, "m", (t) => (t.orig == null ? "" : dec(t.orig, 2) + " yds"),
      () => '<svg viewBox="0 0 120 100"><path class="dz" d="M4 88H116"/><path class="dm" d="M12 88V80"/><path class="dt fin" pathLength="100" d="M12 80Q62 -30 108 86"/><circle class="db" cx="108" cy="84" r="4.5"/></svg>'],
    ["ctp", "Closest to the pin", "Coup de départ le plus près du drapeau, par 3", 2, "m", (t) => (t.orig == null ? "" : dec(t.orig, 2) + " ft") + (t.trou ? " · trou " + t.trou : ""),
      (t) => {                                                   // la cible : l'anneau extérieur vaut 10 m, la balle est posée à sa distance du drapeau
        const d = 6 + Math.min(1, Math.max(0, t.valeur) / 10) * 34;
        return `<svg viewBox="0 0 120 100"><circle class="dz" cx="60" cy="54" r="40"/><circle class="dz" cx="60" cy="54" r="26"/><circle class="dz" cx="60" cy="54" r="12"/>
          <path class="dm" d="M60 54V26"/><path class="dd" d="M61 26l14 5-14 6z"/><circle class="db" cx="${(60 + d * 0.82).toFixed(1)}" cy="${(54 + d * 0.57).toFixed(1)}" r="4.5"/></svg>`;
      }],
    ["putts_faits", "Total putt length", "Longueur totale des putts rentrés", 2, "m", (t) => (t.orig == null ? "" : dec(t.orig, 2) + " ft"),
      () => '<svg viewBox="0 0 120 100"><path class="dz" d="M6 62H114"/><path class="dt fin" pathLength="100" d="M10 62H100"/><ellipse cx="104" cy="62" rx="8" ry="3.2" fill="#000a14" stroke="rgba(234,246,253,.3)"/><path class="dm" d="M104 62V30"/><path class="dd" d="M105 30l13 5-13 5z"/><circle class="roule" cx="98" cy="58" r="4.5" fill="#fff"/></svg>'],
  ];
  /* Short Game (petit jeu, sans drive) : ni fairways touchés ni distance des drives */
  const SHORT_GAME_TILES = ["gir", "ctp", "putts_faits"];
  const tilesOf = (comp) => (comp.prefixe === "SG" ? TILES.filter((t) => SHORT_GAME_TILES.indexOf(t[0]) >= 0) : TILES);

  /* Semaine (ou mois) dont on montre les statistiques : le plus récent, ou à défaut la dernière qui en a */
  function statsWeek(comp, cat) {
    const keys = Object.keys(cat.stats || {}).map(Number).sort((a, b) => b - a);
    if (!keys.length) return null;
    const last = comp.semaines.length ? comp.semaines[comp.semaines.length - 1].numero : null;
    return keys.indexOf(last) >= 0 ? last : keys[0];
  }

  const above = (comp, s) => (comps.length > 1 ? comp.nom : "") + (comp.categories.length > 1 ? (comps.length > 1 ? " · " : "") + s.cat : "");

  function drawStats(s, comp) {
    $("#tv-sur").textContent = above(comp, s);
    $("#tv-title").innerHTML = `Statistiques <em>${isWC(comp) ? "de la semaine" : "du mois"} · ${esc(comp.prefixe)}${s.week}</em>`;
    $("#tv-page").textContent = "";
    const defs = tilesOf(comp);
    area.innerHTML = `<div class="tuiles${defs.length === 3 ? " n3" : ""}">${defs.map((def, i) => {
      const off = down(comp, def[0]);
      const t = s.tiles && !off ? s.tiles[def[0]] : null;
      if (off) return `<div class="tuile panne" style="--i:${i}"><div class="tt">${def[1]}</div><div class="th">${def[2]}</div>${WARN}<div class="tb">En maintenance</div><div class="to">Données SGT indisponibles</div><div class="tn"></div></div>`;
      const names = t && t.joueurs ? t.joueurs.slice(0, 3).map((n) => `<div>${esc(n)}</div>`).join("") + (t.joueurs.length > 3 ? `<div>+${t.joueurs.length - 3}</div>` : "") : "";
      return `<div class="tuile" style="--i:${i}"><div class="tt">${def[1]}</div><div class="th">${def[2]}</div>${t ? def[6](t) : '<svg viewBox="0 0 120 100"></svg>'}
        <div class="tb" data-i="${i}">${t ? "" : "–"}</div><div class="to">${t ? def[5](t) || "&nbsp;" : "Pas de donnée"}</div><div class="tn">${names}</div></div>`;
    }).join("")}</div>`;
    defs.forEach((def, i) => {
      const t = s.tiles && !down(comp, def[0]) ? s.tiles[def[0]] : null;
      if (t) countUp(area.querySelector('.tb[data-i="' + i + '"]'), Number(t.valeur), (v) => dec(v, def[3]) + "<small>" + def[4] + "</small>", 1500);
    });
  }

  function buildSlides() {
    const cap = rowsFit();
    const out = [];
    comps.forEach((comp, ci) => {
      if (down(comp, "classement")) out.push({ ci, comp: comp.nom, cat: "", kind: "maintenance", page: 1, pages: 1 });
      for (const c of (down(comp, "classement") ? [] : comp.categories)) {
        for (const kind of ["net", "brut"]) {
          const rows = (c.classement[kind] || []).filter((r) => r.rang);   // pas de classement net au Short Game
          if (!rows.length) continue;
          const pages = Math.ceil(rows.length / cap);
          const per = Math.ceil(rows.length / pages);              // pages équilibrées : 7 + 7 + 7 plutôt que 10 + 10 + 1
          for (let p = 0; p < pages; p++) out.push({ ci, comp: comp.nom, cat: c.nom, kind, page: p + 1, pages, per, rows: rows.slice(p * per, (p + 1) * per) });
        }
      }
      for (const c of comp.categories) {                         // puis les statistiques de la semaine en cours, une page par catégorie
        const week = statsWeek(comp, c);
        if (week != null) out.push({ ci, comp: comp.nom, cat: c.nom, kind: "stats", page: 1, pages: 1, week, tiles: c.stats[String(week)] });
      }
    });
    slides = out;
    /* un point par page ; un trait sépare les compétitions */
    $("#tv-points").innerHTML = out.length > 1 && out.length <= 30 ? out.map((s, i) => (i && s.ci !== out[i - 1].ci ? '<i class="sep"></i>' : "") + '<i data-p="' + i + '"></i>').join("") : "";
    /* Durée d'un tour complet (toutes les pages), à reporter dans Zebrix : visible avec ?debug=1 et dans window.TV_CYCLE */
    const nStats = out.filter((s) => s.kind === "stats").length;
    window.TV_CYCLE = { pages: out.length, secondes: Math.round(((out.length - nStats) * DURATION + nStats * DURATION_STATS) / 1000), lignes_par_page: cap };
    const box = document.getElementById("tv-debug");
    if (box) box.setAttribute("data-cycle", (out.length - nStats) + " pages de classement × " + DURATION / 1000 + " s + " + nStats + " de statistiques × " + DURATION_STATS / 1000 + " s = " + window.TV_CYCLE.secondes + " s pour un tour complet (" + cap + " joueurs par page)");
  }

  const evo = (e) => {
    if (e === "nouveau") return '<span class="evo neuf">Nouveau</span>';
    if (e == null) return "";
    if (e > 0) return `<span class="evo plus">▲ ${e}</span>`;
    if (e < 0) return `<span class="evo moins">▼ ${-e}</span>`;
    return '<span class="evo egal">=</span>';
  };

  function drawSlide(s) {
    const comp = comps[s.ci];
    if (shown !== comp) renderPanel(comp);                       // le panneau suit la compétition du classement affiché
    card.className = "carte" + (s.kind === "stats" ? " stats" : "") + (comp.brut_seul ? " sans-remplacer" : "");
    const dots = document.querySelectorAll("#tv-points i[data-p]");
    for (let i = 0; i < dots.length; i++) dots[i].className = Number(dots[i].getAttribute("data-p")) === index ? "ici" : "";
    if (s.kind === "stats") { drawStats(s, comp); return; }
    if (s.kind === "maintenance") {
      $("#tv-sur").textContent = comps.length > 1 ? comp.nom : "";
      $("#tv-title").innerHTML = "Classement <em>en maintenance</em>";
      $("#tv-page").textContent = "";
      area.innerHTML = `<div class="vide maint">${WARN}<div><b>Classement en maintenance</b><span>Simulator Golf Tour a changé la façon de donner ses données. Les résultats reviennent dès que c'est corrigé.</span></div></div>`;
      return;
    }
    /* peu de joueurs sur la page : les lignes grandissent un peu (au plus 35 %) pour mieux occuper la carte */
    const h = Math.min(rowHeight() * 1.35, (area.clientHeight - headH()) / s.rows.length);
    const all = comp.semaines.map((w) => w.numero).sort((a, b) => a - b);
    const fit = weeksFit(comp, h);
    const weeks = fit ? all.slice(-fit) : [];                    // les plus récentes, dans l'ordre, juste avant le total
    const cols = [W.rank * h + "px", W.evo * h + "px", "minmax(0, 1fr)"].concat(comp.brut_seul ? [] : [W.hdc * h + "px"], weeks.map(() => W.week * h + "px"), [W.total * h + "px"]).join(" ");
    $("#tv-sur").textContent = above(comp, s);
    $("#tv-title").innerHTML = `Classement ${s.kind === "net" ? "net <em>Stableford</em>" : "brut"}`;
    $("#tv-page").textContent = s.pages > 1 ? `Page ${s.page} / ${s.pages}` : "";
    area.innerHTML = `<div style="--h:${h.toFixed(2)}px;--ht:${headH().toFixed(2)}px;--cols:${cols}">
      <div class="tete"><span>#</span><span>Évol.</span><span class="nom">Joueur</span>${comp.brut_seul ? "" : "<span>Hdc</span>"}${weeks.map((w) => `<span class="sem">${esc(comp.prefixe)}${w}</span>`).join("")}<span>Total</span></div>
      ${s.rows.map((r, i) => `<div class="lg-j${r.rang <= 3 ? " top" : ""}${r.rang === 1 ? " un" : ""}" style="--i:${i}">
        <span class="rg-n"><b>${r.rang}</b></span><span>${evo(r.evolution)}</span><span class="nom"><span>${esc(r.joueur)}</span></span>${comp.brut_seul ? "" : `<span class="hdc">${r.hdc_actuel}</span>`}
        ${weeks.map((w) => {
          const p = r.points[String(w)];
          if (p == null) return '<span class="pt">·</span>';
          return `<span class="pt ${w === r.a_remplacer ? "remplace" : r.comptees.indexOf(w) >= 0 ? "compte" : ""}"><b>${p}</b></span>`;
        }).join("")}<span class="tot" data-t="${r.total}"></span></div>`).join("")}</div>`;
    const totals = area.querySelectorAll(".tot");
    for (let i = 0; i < totals.length; i++) countUp(totals[i], Number(totals[i].getAttribute("data-t")), (v) => num(Math.round(v)), 700 + i * 50);
  }

  /* La balle part du tee quand la page arrive et tombe dans le trou quand elle s'en va */
  function restartFlight() {
    vol.classList.remove("joue");
    void vol.offsetWidth;                                        // relance les animations
    document.documentElement.style.setProperty("--dur", durationOf(slides[index]) + "ms");
    vol.style.setProperty("--vol-w", vol.clientWidth + "px");
    vol.classList.add("joue");
  }

  function show(i, fade) {
    if (!slides.length) {
      area.innerHTML = '<div class="vide">En attente des premiers résultats…</div>';
      $("#tv-sur").textContent = "";
      $("#tv-title").textContent = "Classement";
      $("#tv-page").textContent = "";
      return;
    }
    index = ((i % slides.length) + slides.length) % slides.length;
    const fading = document.querySelectorAll(".fondu");
    const draw = () => { drawSlide(slides[index]); for (let k = 0; k < fading.length; k++) fading[k].classList.remove("out"); };
    if (fade) { for (let k = 0; k < fading.length; k++) fading[k].classList.add("out"); setTimeout(draw, 400); } else draw();
    restartFlight();
  }

  function loop() {
    clearTimeout(timer);
    timer = setTimeout(() => { show(index + 1, true); loop(); }, durationOf(slides[index]));
  }

  /* ---------- Données : relues chaque minute ---------- */
  async function load(first) {
    try {
      const r = await fetch((window.TV_DONNEES || "donnees/saison.json") + "?v=" + Date.now(), { cache: "no-store" });   // une page de démonstration peut imposer son fichier
      if (!r.ok) throw new Error(r.status);
      const json = await r.json();
      if (!first && data && json.genere_le === data.genere_le) return;   // rien de nouveau
      const here = slides[index];
      data = json;
      comps = [json].concat(json.competitions_autres || []);
      shown = null;
      renderPanel(comps[0]);
      if (!comps.some((c) => c.semaines.length)) { slides = []; show(0); return; }
      buildSlides();
      const same = here ? slides.findIndex((s) => s.ci === here.ci && s.cat === here.cat && s.kind === here.kind && s.page === here.page) : -1;
      if (first) { const at = START_STATS ? slides.findIndex((s) => s.kind === "stats") : 0; show(Math.max(0, at)); loop(); } else { index = same >= 0 ? same : Math.min(index, slides.length - 1); drawSlide(slides[index]); }
    } catch (e) {
      if (first) area.innerHTML = '<div class="vide">Résultats momentanément indisponibles…</div>';  // sinon, on garde l'affichage actuel
    }
  }

  /* ---------- Télévision : écran toujours allumé, plein écran, rechargement de nuit ---------- */
  async function keepAwake() {
    try { if ("wakeLock" in navigator) await navigator.wakeLock.request("screen"); } catch (e) { /* facultatif */ }
  }
  document.addEventListener("visibilitychange", () => { if (!document.hidden) keepAwake(); });
  const fullscreen = () => (document.fullscreenElement ? document.exitFullscreen() : (document.documentElement.requestFullscreen && document.documentElement.requestFullscreen()));
  document.addEventListener("dblclick", fullscreen);
  document.addEventListener("keydown", (e) => { if (e.key === "f" || e.key === "F") fullscreen(); });

  let resizing;
  window.addEventListener("resize", () => {
    clearTimeout(resizing);
    resizing = setTimeout(() => { if (data && slides.length) { buildSlides(); show(Math.min(index, slides.length - 1)); loop(); } }, 300);
  });

  /* la police maison change un peu les hauteurs une fois chargée : on recalcule les pages */
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (data && slides.length) { shown = null; buildSlides(); index = Math.min(index, slides.length - 1); drawSlide(slides[index]); } });

  keepAwake();
  load(true);
  setInterval(() => load(false), REFRESH);
  setTimeout(() => location.reload(), 6 * 60 * 60 * 1000);   // recharge le code lui-même, au cas où il aurait changé
})();
