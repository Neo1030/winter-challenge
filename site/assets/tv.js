/* Winter Challenge Results · page pour la télévision du centre.
   Fait défiler les classements tout seul : Hommes net, Hommes brut, Femmes net, Femmes brut, Seniors net, Seniors brut,
   puis les statistiques de la semaine en cours de chaque catégorie, puis le Short Game (classements et statistiques du mois),
   par pages qui remplissent tout l'écran. Lit donnees/saison.json et le relit chaque minute.
   Écrit pour les anciens navigateurs des lecteurs d'affichage (Zebrix…) : pas de « ?. » ni de « ?? ».
   Réglages dans l'adresse :  tv.html?duree=15  (secondes par page, 8 par défaut)   tv.html?lignes=5  (lignes par page au maximum)
   tv.html?debut=stats  (commence par les statistiques, pour les vérifier sans attendre) */
(() => {
  "use strict";

  const $ = (sel) => document.querySelector(sel);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const num = (n) => (n == null ? "–" : String(n).replace(/\B(?=(\d{3})+(?!\d))/g, "'"));
  const day = (iso) => (iso ? iso.slice(0, 10).split("-").reverse().join(".") : "");
  const pl = (n, word) => `${n} ${word}${n > 1 ? "s" : ""}`;

  const params = new URLSearchParams(location.search);
  const DURATION = Math.max(2, Number(params.get("duree")) || 8) * 1000;
  const MAX_ROWS = Number(params.get("lignes")) || 0;
  const START_STATS = params.get("debut") === "stats";
  const REFRESH = 60 * 1000;
  const ROW_VH = 0.062;                                          // hauteur visée d'une ligne, en part de la hauteur de l'écran

  const area = $("#tv-area");
  const bar = $("#tv-bar");
  let data = null;
  let comps = [];       // les compétitions : le Winter Challenge (racine du fichier), puis les autres (Short Game…)
  let shown = null;     // compétition dont les cartes du haut sont affichées
  let slides = [];
  let index = 0;
  let timer = null;

  /* ---------- Les cinq cartes (celles de la compétition affichée) ---------- */
  const isWC = (c) => c.prefixe === "WC";

  function leader(c, kind) {
    let best = null;
    for (const cat of c.categories) {
      const r = (cat.classement[kind] || []).find((x) => x.rang === 1);
      if (r && (!best || r.total > best.total)) best = { name: r.joueur, total: r.total, cat: cat.nom };
    }
    return best;
  }

  function renderStats(c) {
    shown = c;
    const weeks = c.semaines;
    const week = weeks[weeks.length - 1];
    const pc = c.parcours_semaine;
    const upcoming = pc && week && pc.semaine > week.numero;
    const course = upcoming ? pc.nom : week ? week.parcours : "–";
    const place = pc && week && (upcoming || pc.semaine === week.numero) ? pc.lieu : "";
    const multi = c.categories.length > 1;
    const word = isWC(c) ? "semaine" : "mois";
    const best = (kind) => {
      const b = leader(c, kind);
      return b ? [esc(b.name), `${multi ? esc(b.cat) + " · " : ""}${num(b.total)} points`] : ["–", "Pas encore de résultat"];
    };
    const [brutName, brutNote] = best("brut");
    const cards = [
      [isWC(c) ? "Semaine" : "Mois", week ? `${c.prefixe}${week.numero}${week.statut === "en_cours" ? ' <span class="live">en cours</span>' : ""}` : "–",
        week ? (week.fin <= week.debut ? `le ${day(week.debut)}` : `du ${day(week.debut)} au ${day(week.fin)}`) : ""],
      [upcoming ? "Prochain parcours" : "Parcours", esc(course), esc(place)],
      ["Joueurs", c.joueurs.length, `${weeks.length} ${weeks.length > 1 && word === "semaine" ? "semaines" : word} ${(isWC(c) ? ["jouée", "jouées"] : ["joué", "joués"])[weeks.length > 1 ? 1 : 0]}`],
    ];
    if (!c.brut_seul) {                                          // Short Game : brut seulement, pas de carte « Meilleur net »
      const [netName, netNote] = best("net");
      cards.push(["Meilleur net", netName, netNote]);
    }
    cards.push(["Meilleur brut", brutName, brutNote]);
    $("#tv-stats").style.gridTemplateColumns = "repeat(" + cards.length + ", 1fr)";
    $("#tv-stats").innerHTML = cards.map(([label, value, note]) =>
      `<div class="tv-stat"><div class="label">${label}</div><div class="value${String(value).replace(/<[^>]+>/g, "").length > 16 ? " long" : ""}">${value}</div><div class="note">${note || "&nbsp;"}</div></div>`).join("");
    $("#tv-demo").hidden = !data.demo;
    fitCards();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitCards);   // la police maison change les largeurs une fois chargée
  }

  /* Réduit un peu un texte de carte (jamais sous 62 % de sa taille) quand il déborde, pour qu'il reste lisible en entier */
  function fitCards() {
    document.querySelectorAll(".tv-stat .value:not(.long), .tv-stat .note").forEach((el) => {
      el.style.fontSize = "";
      const base = parseFloat(getComputedStyle(el).fontSize);
      let size = base;
      while (el.scrollWidth > el.clientWidth && size > base * 0.62) { size -= 0.5; el.style.fontSize = size + "px"; }
    });
  }

  /* ---------- Pages du classement ---------- */
  /* Toutes les lignes ont la même hauteur sur toutes les pages, donc les mêmes textes, quel que soit le nombre de joueurs :
     on compte combien de lignes de ~6,2 % de la hauteur de l'écran tiennent dans la carte, puis on les étire pour la remplir */
  const slots = () => Math.max(4, Math.floor(area.clientHeight / (ROW_VH * window.innerHeight)));   // lignes, titres de colonnes compris
  const rowHeight = () => area.clientHeight / slots();
  const rowsFit = () => (MAX_ROWS ? Math.min(MAX_ROWS, slots() - 1) : slots() - 1);
  /* Largeurs des colonnes en multiples de la hauteur de ligne : le tableau garde les mêmes proportions sur un écran 16:9
     comme sur une zone plus carrée (par exemple 1229 × 1080) ; seul le nombre de semaines affichées change */
  const COLS = [1.1, 1.25, 4.2, 1.1, 1.5];                       // rang, évolution, joueur, handicap, total
  const COLS_NO_HDC = [1.1, 1.25, 4.2, 1.5];                     // Short Game : pas de handicap
  const colsOf = (comp) => (comp.brut_seul ? COLS_NO_HDC : COLS);
  const WEEK_COL = 0.95;                                         // une colonne de semaine
  const weeksFit = (comp) => {
    const fixed = colsOf(comp).reduce((a, b) => a + b, 0) * rowHeight();
    return Math.max(0, Math.floor((area.clientWidth - fixed) / (WEEK_COL * rowHeight())));
  };

  /* ---------- Statistiques de la semaine : les cinq tuiles du site (FIR, GIR, drive, proximité GIR, putts rentrés) ---------- */
  const dec = (n, d) => (n == null ? "–" : Number(n).toFixed(d).replace(".", ","));
  const TILES = [
    ["fir", "FIR", "Fairways touchés", (t) => [dec(t.valeur, 1) + " %", ""]],
    ["gir", "GIR", "Greens en régulation", (t) => [dec(t.valeur, 1) + " %", ""]],
    ["drive", "Distance de drive", "Le plus long drive", (t) => [dec(t.valeur, 1) + " m", t.orig == null ? "" : dec(t.orig, 2) + " yds"]],
    ["gir_prox", "Proximité GIR", "Au plus près du drapeau, green atteint", (t) => [dec(t.valeur, 2) + " m", t.orig == null ? "" : dec(t.orig, 2) + " ft"]],
    ["putts_faits", "Putts rentrés", "Longueur des putts rentrés", (t) => [dec(t.valeur, 2) + " m", t.orig == null ? "" : dec(t.orig, 2) + " ft"]],
  ];

  /* Semaine (ou mois) dont on montre les statistiques : le plus récent, ou à défaut la dernière qui en a */
  function statsWeek(comp, cat) {
    const keys = Object.keys(cat.stats || {}).map(Number).sort((a, b) => b - a);
    if (!keys.length) return null;
    const last = comp.semaines.length ? comp.semaines[comp.semaines.length - 1].numero : null;
    return keys.indexOf(last) >= 0 ? last : keys[0];
  }

  function drawStats(s, comp) {
    const names = (t) => (t ? t.joueurs.slice(0, 3).map(esc).join("<br>") + (t.joueurs.length > 3 ? "<br>+" + (t.joueurs.length - 3) : "") : "–");
    $("#tv-title").textContent = `${comps.length > 1 ? comp.nom + " · " : ""}Statistiques ${isWC(comp) ? "de la semaine" : "du mois"} · ${comp.prefixe}${s.week}${comp.categories.length > 1 ? " · " + s.cat : ""}`;
    $("#tv-page").textContent = "";
    area.innerHTML = `<div class="tv-tiles">${TILES.map((def, i) => {
      const t = s.tiles[def[0]];
      const v = t ? def[3](t) : null;
      return `<div class="tv-tile" style="--i:${i}"><div class="tt">${def[1]}</div><div class="th">${def[2]}</div>
        <div class="tn">${names(t)}</div><div class="tb">${v ? v[0] : "Pas de donnée"}</div><div class="to">${v && v[1] ? v[1] : "&nbsp;"}</div></div>`;
    }).join("")}</div>`;
  }

  function buildSlides() {
    const cap = rowsFit();
    const out = [];
    comps.forEach((comp, ci) => {
      for (const c of comp.categories) {
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
  }

  const evo = (e) => {
    if (e === "nouveau") return '<span class="new">Nouveau</span>';
    if (e == null) return "";
    if (e > 0) return `<span class="evo up">▲ ${e}</span>`;
    if (e < 0) return `<span class="evo down">▼ ${-e}</span>`;
    return '<span class="evo same">=</span>';
  };

  function drawSlide(s) {
    const comp = comps[s.ci];
    if (shown !== comp) renderStats(comp);                       // les cartes du haut suivent la compétition du classement affiché
    $(".tv-card").className = "tv-card" + (s.kind === "stats" ? " stats" : "") + (comp.brut_seul ? " no-replace" : "");   // page de statistiques : sans la légende du classement
    if (s.kind === "stats") { drawStats(s, comp); return; }
    const weeks = comp.semaines.map((w) => w.numero).sort((a, b) => b - a).slice(0, weeksFit(comp));
    const rowH = rowHeight();
    const multi = comp.categories.length > 1;
    $("#tv-title").textContent = `${comps.length > 1 ? comp.nom + " · " : ""}Classement ${s.kind === "net" ? "net Stableford" : "brut"}${multi ? " · " + s.cat : ""}`;
    $("#tv-page").textContent = s.pages > 1 ? `Page ${s.page} / ${s.pages}` : "";
    area.innerHTML = `<table class="tv-table" style="--row-h:${rowH}px">
      <colgroup>${colsOf(comp).map((w) => `<col style="width:${(w * rowH).toFixed(1)}px">`).join("")}${weeks.map(() => "<col>").join("")}</colgroup>
      <thead><tr><th scope="col">#</th><th scope="col">Évol.</th><th class="name" scope="col">Joueur</th>${comp.brut_seul ? "" : '<th scope="col">Hdc</th>'}<th scope="col">Total</th>
        ${weeks.map((w) => `<th class="wk" scope="col">${comp.prefixe}${w}</th>`).join("")}</tr></thead>
      <tbody>${s.rows.map((r, i) => `<tr class="${r.rang <= 3 ? "top" : ""}" style="--i:${i}">
        <td class="rank ${r.rang <= 3 ? "r" + r.rang : ""}"><span>${r.rang}</span></td><td>${evo(r.evolution)}</td>
        <td class="name"><span class="nm">${esc(r.joueur)}</span></td>${comp.brut_seul ? "" : `<td>${r.hdc_actuel}</td>`}<td class="total">${num(r.total)}</td>
        ${weeks.map((w) => {
          const p = r.points[String(w)];
          if (p == null) return '<td class="pt none">·</td>';
          return `<td class="pt ${w === r.a_remplacer ? "replace" : r.comptees.includes(w) ? "counted" : ""}">${p}</td>`;
        }).join("")}</tr>`).join("")}</tbody></table>`;
  }

  function restartBar() {
    bar.classList.remove("run");
    void bar.offsetWidth;                                        // relance l'animation de la barre de progression
    document.documentElement.style.setProperty("--dur", DURATION + "ms");
    bar.classList.add("run");
  }

  function show(i, fade) {
    if (!slides.length) {
      area.innerHTML = '<div class="tv-empty">En attente des premiers résultats…</div>';
      $("#tv-title").textContent = "Classement";
      $("#tv-page").textContent = "";
      return;
    }
    index = ((i % slides.length) + slides.length) % slides.length;
    const fadeable = document.querySelectorAll(".fadeable");
    const draw = () => { drawSlide(slides[index]); fadeable.forEach((el) => el.classList.remove("out")); };
    if (fade) { fadeable.forEach((el) => el.classList.add("out")); setTimeout(draw, 400); } else draw();
    restartBar();
  }

  function loop() {
    clearTimeout(timer);
    timer = setTimeout(() => { show(index + 1, true); loop(); }, DURATION);
  }

  /* ---------- Données : relues chaque minute ---------- */
  async function load(first) {
    try {
      const r = await fetch((window.TV_DONNEES || "donnees/saison.json") + "?v=" + Date.now(), { cache: "no-store" });   // les pages de démonstration imposent leur fichier
      if (!r.ok) throw new Error(r.status);
      const json = await r.json();
      if (!first && data && json.genere_le === data.genere_le) return;   // rien de nouveau
      const here = slides[index];
      data = json;
      comps = [json].concat(json.competitions_autres || []);
      shown = null;
      if (!comps.some((c) => c.semaines.length)) { slides = []; show(0); return; }
      renderStats(comps[0]);
      buildSlides();
      const same = here && slides.findIndex((s) => s.ci === here.ci && s.cat === here.cat && s.kind === here.kind && s.page === here.page);
      if (first) { const at = START_STATS ? slides.findIndex((s) => s.kind === "stats") : 0; show(Math.max(0, at)); loop(); } else { index = same >= 0 ? same : Math.min(index, slides.length - 1); drawSlide(slides[index]); }
    } catch (e) {
      if (first) area.innerHTML = '<div class="tv-empty">Résultats momentanément indisponibles…</div>';  // sinon, on garde l'affichage actuel
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
    resizing = setTimeout(() => { if (data && comps.length) { buildSlides(); show(Math.min(index, slides.length - 1)); } }, 300);
  });

  keepAwake();
  load(true);
  setInterval(() => load(false), REFRESH);
  setTimeout(() => location.reload(), 6 * 60 * 60 * 1000);   // recharge le code lui-même, au cas où il aurait changé
})();
