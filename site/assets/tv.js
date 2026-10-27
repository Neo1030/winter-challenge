/* Winter Challenge Results · page pour la télévision du centre.
   Fait défiler les classements tout seul : Hommes net, Hommes brut, Femmes net, Femmes brut, Seniors net, Seniors brut,
   par pages qui remplissent tout l'écran. Lit donnees/saison.json et le relit chaque minute.
   Écrit pour les anciens navigateurs des lecteurs d'affichage (Zebrix…) : pas de « ?. » ni de « ?? ».
   Réglages dans l'adresse :  tv.html?duree=15  (secondes par page, 10 par défaut)   tv.html?lignes=5  (lignes par page au maximum) */
(() => {
  "use strict";

  const $ = (sel) => document.querySelector(sel);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const num = (n) => (n == null ? "–" : String(n).replace(/\B(?=(\d{3})+(?!\d))/g, "'"));
  const day = (iso) => (iso ? iso.slice(0, 10).split("-").reverse().join(".") : "");
  const pl = (n, word) => `${n} ${word}${n > 1 ? "s" : ""}`;

  const params = new URLSearchParams(location.search);
  const DURATION = Math.max(2, Number(params.get("duree")) || 10) * 1000;
  const MAX_ROWS = Number(params.get("lignes")) || 0;
  const REFRESH = 60 * 1000;
  const ROW_VH = 0.062;                                          // hauteur visée d'une ligne, en part de la hauteur de l'écran

  const area = $("#tv-area");
  const bar = $("#tv-bar");
  let data = null;
  let slides = [];
  let index = 0;
  let timer = null;

  /* ---------- Les cinq cartes ---------- */
  const latestWeek = () => data.semaines[data.semaines.length - 1];

  function leader(kind) {
    let best = null;
    for (const c of data.categories) {
      const r = c.classement[kind].find((x) => x.rang === 1);
      if (r && (!best || r.total > best.total)) best = { name: r.joueur, total: r.total, cat: c.nom };
    }
    return best;
  }

  function renderStats() {
    const week = latestWeek();
    const pc = data.parcours_semaine;
    const upcoming = pc && pc.semaine > week.numero;
    const course = upcoming ? pc.nom : week.parcours;
    const place = pc && (upcoming || pc.semaine === week.numero) ? pc.lieu : "";
    const multi = data.categories.length > 1;
    const best = (kind) => {
      const b = leader(kind);
      return b ? [esc(b.name), `${multi ? esc(b.cat) + " · " : ""}${num(b.total)} points`] : ["–", "Pas encore de résultat"];
    };
    const [netName, netNote] = best("net");
    const [brutName, brutNote] = best("brut");
    const cards = [
      ["Semaine", `WC${week.numero}${week.statut === "en_cours" ? ' <span class="live">en cours</span>' : ""}`, (week.fin <= week.debut ? `le ${day(week.debut)}` : `du ${day(week.debut)} au ${day(week.fin)}`)],
      [upcoming ? "Prochain parcours" : "Parcours", esc(course), esc(place)],
      ["Joueurs", data.joueurs.length, `${pl(data.semaines.length, "semaine")} jouée${data.semaines.length > 1 ? "s" : ""}`],
      ["Meilleur net", netName, netNote],
      ["Meilleur brut", brutName, brutNote],
    ];
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
  const WEEK_COL = 0.95;                                         // une colonne de semaine
  const weeksFit = () => {
    const fixed = COLS.reduce((a, b) => a + b, 0) * rowHeight();
    return Math.max(0, Math.floor((area.clientWidth - fixed) / (WEEK_COL * rowHeight())));
  };

  function buildSlides() {
    const cap = rowsFit();
    const out = [];
    for (const c of data.categories) {
      for (const kind of ["net", "brut"]) {
        const rows = c.classement[kind].filter((r) => r.rang);
        if (!rows.length) continue;
        const pages = Math.ceil(rows.length / cap);
        const per = Math.ceil(rows.length / pages);              // pages équilibrées : 7 + 7 + 7 plutôt que 10 + 10 + 1
        for (let p = 0; p < pages; p++) out.push({ cat: c.nom, kind, page: p + 1, pages, per, rows: rows.slice(p * per, (p + 1) * per) });
      }
    }
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
    const weeks = data.semaines.map((w) => w.numero).sort((a, b) => b - a).slice(0, weeksFit());
    const rowH = rowHeight();
    const multi = data.categories.length > 1;
    $("#tv-title").textContent = `Classement ${s.kind === "net" ? "net Stableford" : "brut"}${multi ? " · " + s.cat : ""}`;
    $("#tv-page").textContent = s.pages > 1 ? `Page ${s.page} / ${s.pages}` : "";
    area.innerHTML = `<table class="tv-table" style="--row-h:${rowH}px">
      <colgroup>${COLS.map((w) => `<col style="width:${(w * rowH).toFixed(1)}px">`).join("")}${weeks.map(() => "<col>").join("")}</colgroup>
      <thead><tr><th scope="col">#</th><th scope="col">Évol.</th><th class="name" scope="col">Joueur</th><th scope="col">Hdc</th><th scope="col">Total</th>
        ${weeks.map((w) => `<th class="wk" scope="col">WC${w}</th>`).join("")}</tr></thead>
      <tbody>${s.rows.map((r, i) => `<tr class="${r.rang <= 3 ? "top" : ""}" style="--i:${i}">
        <td class="rank ${r.rang <= 3 ? "r" + r.rang : ""}"><span>${r.rang}</span></td><td>${evo(r.evolution)}</td>
        <td class="name"><span class="nm">${esc(r.joueur)}</span></td><td>${r.hdc_actuel}</td><td class="total">${num(r.total)}</td>
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
      const r = await fetch("donnees/saison.json?v=" + Date.now(), { cache: "no-store" });
      if (!r.ok) throw new Error(r.status);
      const json = await r.json();
      if (!first && data && json.genere_le === data.genere_le) return;   // rien de nouveau
      const here = slides[index];
      data = json;
      if (!data.semaines.length) { slides = []; show(0); return; }
      renderStats();
      buildSlides();
      const same = here && slides.findIndex((s) => s.cat === here.cat && s.kind === here.kind && s.page === here.page);
      if (first) { show(0); loop(); } else { index = same >= 0 ? same : Math.min(index, slides.length - 1); drawSlide(slides[index]); }
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
    resizing = setTimeout(() => { if (data && data.semaines.length) { buildSlides(); show(Math.min(index, slides.length - 1)); } }, 300);
  });

  keepAwake();
  load(true);
  setInterval(() => load(false), REFRESH);
  setTimeout(() => location.reload(), 6 * 60 * 60 * 1000);   // recharge le code lui-même, au cas où il aurait changé
})();
