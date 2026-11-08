/* Winter Challenge · Let's Golf
   Lit donnees/saison.json (généré par scripts/export_site_data.py) et affiche classements, parcours et résultats.
   Aucune dépendance : un navigateur suffit. */
(() => {
  "use strict";

  const $ = (sel, el = document) => el.querySelector(sel);
  const app = $("#app");
  const dialog = $("#player-dialog");
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const num = (n) => (n == null ? "–" : String(n).replace(/\B(?=(\d{3})+(?!\d))/g, "'"));
  const nm = (s) => esc(s).replace(/_/g, "_<wbr>"); // un pseudo ne se coupe qu'après un tiret bas
  const pl = (n, word) => `${n} ${word}${n > 1 ? "s" : ""}`;
  const day = (iso) => (iso ? iso.slice(0, 10).split("-").reverse().join(".") : "");
  const stamp = (iso) => (iso ? `${day(iso)} à ${iso.slice(11, 16)}` : "");

  const NINE = { Front: "trous 1 à 9", Back: "trous 10 à 18", All: "les 18 trous" };
  const STATS = [["eagles", "eagles"], ["birdies", "birdies"], ["pars", "pars"], ["bogeys", "bogeys"]];

  let raw = null;     // le fichier de données tel quel
  let comps = [];     // les compétitions : le Winter Challenge (à la racine du fichier), puis les autres (Short Game…)
  let data = null;    // la compétition affichée, avec les réglages communs (règles, démo…)
  const state = { comp: "wc", kind: "net", cat: null, q: "", tw: null };
  /* Les mots de la compétition : des semaines pour le Winter Challenge, des mois pour le Short Game */
  const unit = () => {
    const wc = data.prefixe === "WC";
    const u = wc
      ? { Cap: "Semaine", cap: "semaine", plural: "semaines", caps: "Semaines", short: "Sem.", this: "Cette semaine", next: "Semaine prochaine",
          end: "de la semaine", played: ["jouée", "jouées"], none: "Aucune semaine jouée pour le moment." }
      : { Cap: "Mois", cap: "mois", plural: "mois", caps: "Mois", short: "Mois", this: "Ce mois", next: "Mois prochain",
          end: "du mois", played: ["joué", "joués"], none: "Aucun mois joué pour le moment." };
    u.count = (n) => `${n} ${n > 1 ? u.plural : u.cap}`;
    return u;
  };
  const P = () => data.prefixe;
  /* Short Game : brut seulement, handicap de 0 pour tous. Pas de classement net, pas de handicap à afficher. */
  const grossOnly = () => !!data.brut_seul;
  const kind = () => (grossOnly() ? "brut" : state.kind);
  const bestN = () => data.meilleurs || data.regles.meilleurs;   // résultats comptés : 8 au Winter Challenge, 5 au Short Game (tous)

  /* ---------- Routage : #/classement?cat=Femmes&kind=brut ---------- */
  function parseHash() {
    const [path, query = ""] = location.hash.replace(/^#\/?/, "").split("?");
    return { route: path || "classement", params: Object.fromEntries(new URLSearchParams(query)) };
  }
  function go(route, params = {}) {
    const q = new URLSearchParams(state.comp === "wc" ? params : { ...params, comp: state.comp }).toString();
    history.replaceState(null, "", `#/${route}${q ? "?" + q : ""}`);
  }

  /* ---------- Compétitions : Winter Challenge, Short Game… ---------- */
  function useComp(id) {
    const c = comps.find((x) => x.id === id) || comps[0];
    state.comp = c.id;
    data = { ...raw, ...c };
  }
  const compBar = () => (comps.length < 2 ? "" : `<div class="toolbar"><div class="seg comp-switch" role="group" aria-label="Compétition">${comps.map((c) =>
    `<button type="button" data-comp="${esc(c.id)}" aria-pressed="${c.id === state.comp}">${esc(c.nom)}</button>`).join("")}</div></div>`);
  function bindComp(route) {
    app.querySelectorAll("[data-comp]").forEach((b) => b.addEventListener("click", () => {
      state.comp = b.dataset.comp; state.cat = null; state.tw = null;
      go(route, {}); render();
    }));
  }
  const noPlayers = () => `${compBar()}<p class="empty">Pas encore de joueur dans le ${esc(data.nom)}.</p>`;

  /* Parcours de la compétition : en cours (d'après les dates de début), à venir (le suivant seulement) et terminés */
  function courseState() {
    const entries = [...(Array.isArray(data.parcours) ? data.parcours : [])];
    const current = entries.filter((e) => e.statut === "en_cours").pop();
    let next = entries.find((e) => e.statut === "a_venir");
    const lastNo = Math.max(0, ...entries.filter((e) => e.statut !== "a_venir").map((e) => e.semaine));
    const chosen = data.parcours_semaine;  // parcours choisi par le capitaine, pas encore créé chez SGT
    if (!next && chosen && chosen.semaine === lastNo + 1) next = { ...chosen, statut: "a_venir", depart: null, reglages: null };
    return { current, next, history: entries.filter((e) => e.statut === "terminee").sort((a, b) => b.semaine - a.semaine) };
  }

  /* ---------- Éléments communs ---------- */
  const latestWeek = () => data.semaines[data.semaines.length - 1];
  const weekNumbersDesc = () => data.semaines.map((w) => w.numero).sort((a, b) => b - a);
  const evo = (e) => {
    if (e === "nouveau") return '<span class="new">Nouveau</span>';
    if (e == null) return "";
    if (e > 0) return `<span class="evo up" title="${pl(e, "place")} gagnée${e > 1 ? "s" : ""}">▲ ${e}</span>`;
    if (e < 0) return `<span class="evo down" title="${pl(-e, "place")} perdue${-e > 1 ? "s" : ""}">▼ ${-e}</span>`;
    return '<span class="evo same" title="Inchangé">=</span>';
  };

  /* ---------- Classement ---------- */
  function viewRanking(params) {
    const cats = data.categories;
    if (!cats.length) { app.innerHTML = noPlayers(); bindComp("classement"); return; }
    state.cat = cats.some((c) => c.nom === (params.cat || state.cat)) ? params.cat || state.cat : cats[0].nom;
    if (!grossOnly()) state.kind = (params.kind || state.kind) === "brut" ? "brut" : "net";   // le Short Game reste en brut sans toucher au choix du Winter Challenge
    const week = latestWeek();
    const { current, next } = courseState();
    const course = current ? current.nom : week && week.parcours;
    const u = unit();
    const leaders = cats.map((c) => c.classement[kind()][0]).filter((r) => r && r.rang);

    app.innerHTML = `${compBar()}
      <section class="grid stats" aria-label="En bref">
        <div class="card stat"><div class="label">${u.Cap}</div>
          <div class="value">${P()}${esc(week?.numero)} ${week?.statut === "en_cours" ? '<span class="live">en cours</span>' : ""}</div>
          <div class="note">${week ? dates(week) : ""}</div></div>
        <div class="card stat"><div class="label">Parcours</div><div class="value">${esc(course ?? "–")}</div>
          <div class="note"><a href="#/parcours${state.comp === "wc" ? "" : "?comp=" + state.comp}">${next ? `Ensuite : ${esc(next.nom)}` : "Voir la fiche du parcours"}</a></div></div>
        <div class="card stat"><div class="label">Joueurs</div><div class="value">${data.joueurs.length}</div>
          <div class="note">${u.count(data.semaines.length)} ${u.played[data.semaines.length > 1 ? 1 : 0]}</div></div>
        <div class="card stat"><div class="label">Meilleur ${kind() === "net" ? "net" : "brut"}</div>
          <div class="value">${leaders.length ? esc(leaders.sort((a, b) => b.total - a.total)[0].joueur) : "–"}</div>
          <div class="note">${leaders.length ? num(leaders[0].total) + " points" : "Pas encore de résultat"}</div></div>
      </section>

      <h2>Classement ${kind() === "net" ? "net Stableford" : "brut"}</h2>
      <p class="sub">${grossOnly() ? `Tes ${bestN()} résultats (un par mois) comptent tous.` : `Les ${bestN()} meilleurs résultats de la saison comptent.`} Touche un joueur pour voir sa fiche.</p>
      <div class="toolbar">
        ${grossOnly() ? "" : `<div class="seg" role="group" aria-label="Type de classement">
          <button type="button" data-kind="net" aria-pressed="${state.kind === "net"}">Net</button>
          <button type="button" data-kind="brut" aria-pressed="${state.kind === "brut"}">Brut</button>
        </div>`}
        ${cats.length > 1 ? `<div class="chips" role="group" aria-label="Catégorie">${cats.map((c) =>
          `<button type="button" data-cat="${esc(c.nom)}" aria-pressed="${c.nom === state.cat}">${esc(c.nom)}</button>`).join("")}</div>` : ""}
        <input class="search" id="q" type="search" placeholder="Chercher un joueur" aria-label="Chercher un joueur" value="${esc(state.q)}">
      </div>
      <div id="podium"></div>
      <div id="ranking"></div>
      <section id="tuiles" aria-labelledby="tuiles-titre"></section>`;
    bindComp("classement");

    app.querySelectorAll("[data-kind]").forEach((b) => b.addEventListener("click", () => { go("classement", { cat: state.cat, kind: b.dataset.kind }); render(); }));
    app.querySelectorAll("[data-cat]").forEach((b) => b.addEventListener("click", () => { go("classement", { cat: b.dataset.cat, kind: state.kind }); render(); }));
    $("#q").addEventListener("input", (e) => { state.q = e.target.value; drawRanking(); });
    drawRanking();
    drawTiles();
  }

  /* Les meilleurs de chaque statistique SGT pour une semaine : FIR, GIR, drive, proximité GIR, putts rentrés */
  const TILES = [
    ["fir", "FIR", "Fairways touchés", (t) => ({ big: dec(t.valeur, 1) + " %" })],
    ["gir", "GIR", "Greens en régulation", (t) => ({ big: dec(t.valeur, 1) + " %" })],
    ["drive", "Avg driving distance", "Distance moyenne des drives de la partie, mesurée par SGT", (t) => ({ big: dec(t.valeur, 1) + " m", small: t.orig == null ? "" : dec(t.orig, 2) + " yds" })],
    ["ctp", "Closest to the pin", "Le coup de départ le plus près du drapeau sur un par 3", (t) => ({ big: dec(t.valeur, 2) + " m", small: (t.orig == null ? "" : dec(t.orig, 2) + " ft") + (t.trou ? " · trou " + t.trou : "") })],
    ["putts_faits", "Total putt length", "Longueur totale des putts rentrés, par tour", (t) => ({ big: dec(t.valeur, 2) + " m", small: t.orig == null ? "" : dec(t.orig, 2) + " ft" })],
  ];
  /* Short Game (petit jeu, sans drive) : ni fairways touchés ni longest drive */
  const SHORT_GAME_TILES = ["gir", "ctp", "putts_faits"];
  const tiles = () => (P() === "SG" ? TILES.filter((t) => SHORT_GAME_TILES.indexOf(t[0]) >= 0) : TILES);

  function drawTiles() {
    const box = $("#tuiles");
    if (!box) return;
    const cat = data.categories.find((c) => c.nom === state.cat);
    const stats = (cat && cat.stats) || {};
    const weeks = Object.keys(stats).map(Number).sort((a, b) => b - a);
    const u = unit();
    if (!weeks.length) {
      box.innerHTML = `<h3 id="tuiles-titre">Statistiques ${u.end}</h3><p class="empty">Les statistiques (fairways, greens, drive, putts) apparaîtront après les premiers tours.</p>`;
      return;
    }
    if (!weeks.includes(state.tw)) state.tw = weeks[0];
    const st = stats[String(state.tw)];
    box.innerHTML = `
      <h3 id="tuiles-titre">Statistiques ${u.end}</h3>
      <div class="toolbar"><label class="sub" for="tw">${u.Cap}</label>
        <select id="tw" class="select">${weeks.map((w) => `<option value="${w}"${w === state.tw ? " selected" : ""}>${P()}${w}</option>`).join("")}</select></div>
      <div class="tiles">${tiles().map(([key, title, hint, fmt]) => {
        const t = st[key];
        const v = t ? fmt(t) : null;
        return `<div class="tile" title="${esc(hint)}"><div class="tile-title">${esc(title)}</div>
          <div class="tile-name">${t ? t.joueurs.map(nm).join("<br>") : "–"}</div>
          <div class="tile-value">${v ? v.big : "Pas de donnée"}</div>${v && v.small ? `<div class="tile-orig">${v.small}</div>` : ""}</div>`;
      }).join("")}</div>
      <p class="hint">Le meilleur de chaque statistique parmi les joueurs de la catégorie ${esc(state.cat)}, pour ${esc(P())}${state.tw}.
        Avg driving distance : distance moyenne des drives de la partie (SGT ne donne pas le plus long drive dans son API).
        Closest to the pin : le coup de départ le plus près du drapeau sur un par 3 (le plus petit gagne).
        Total putt length : longueur totale des putts rentrés par tour. Distances en mètres, valeur d'origine de SGT en dessous.</p>`;
    $("#tw").addEventListener("change", (e) => { state.tw = Number(e.target.value); drawTiles(); });
  }

  function drawRanking() {
    const cat = data.categories.find((c) => c.nom === state.cat);
    const all = cat.classement[kind()];
    const q = state.q.trim().toLowerCase();
    const rows = q ? all.filter((r) => r.joueur.toLowerCase().includes(q)) : all;
    const weeks = weekNumbersDesc();

    const top = all.filter((r) => r.rang && r.rang <= 3).slice(0, 3);
    $("#podium").innerHTML = !q && top.length >= 3 ? `<div class="grid podium">${top.map((r, i) => `
      <div class="card pod p${i + 1}"><button type="button" data-player="${esc(r.joueur)}">
        <div class="medal">${r.rang}</div><div class="name">${nm(r.joueur)}</div>
        <div class="pts">${num(r.total)}</div><div class="meta">${unit().count(r.nb_semaines)}${grossOnly() ? "" : ` · hdc ${r.hdc_actuel}`}</div></button></div>`).join("")}</div>` : "";

    if (!rows.length) { $("#ranking").innerHTML = `<p class="empty">Aucun joueur ne correspond à « ${esc(state.q)} ».</p>`; bindPlayers(); return; }

    $("#ranking").innerHTML = `
      <div class="table-wrap"><table>
        <caption class="sr">Classement ${kind() === "net" ? "net" : "brut"} ${esc(state.cat)}</caption>
        <thead><tr><th class="sticky-1" scope="col">#</th><th class="sticky-2 name" scope="col">Joueur</th><th scope="col">Évol.</th>
          ${grossOnly() ? "" : '<th scope="col">Hdc</th>'}<th scope="col">Total</th>${weeks.map((w) => `<th scope="col">${P()}${w}</th>`).join("")}</tr></thead>
        <tbody>${rows.map((r) => `<tr data-player="${esc(r.joueur)}">
          <td class="sticky-1 rank">${r.rang ?? "–"}</td>
          <td class="sticky-2 name"><button type="button" data-player="${esc(r.joueur)}">${nm(r.joueur)}</button><small>${unit().count(r.nb_semaines)}</small></td>
          <td>${evo(r.evolution)}</td>${grossOnly() ? "" : `<td>${r.hdc_actuel}</td>`}<td class="total">${num(r.total)}</td>
          ${weeks.map((w) => {
            const p = r.points[String(w)];
            if (p == null) return '<td class="pt none">·</td>';
            const cls = w === r.a_remplacer ? "replace" : r.comptees.includes(w) ? "counted" : "";
            return `<td class="pt ${cls}">${p}</td>`;
          }).join("")}</tr>`).join("")}</tbody></table></div>
      <div class="legend"><span><i style="background:var(--counted)"></i>Résultat compté</span>
        ${grossOnly() ? "" : '<span><i style="background:var(--replace)"></i>Premier à être remplacé</span>'}${grossOnly() ? "<span>Tout le monde joue à 0 : pas de handicap</span>" : "<span>Hdc : handicap de jeu actuel</span>"}</div>`;
    bindPlayers();
  }

  function bindPlayers() {
    app.querySelectorAll("[data-player]").forEach((el) => el.addEventListener("click", (e) => {
      e.stopPropagation();
      openPlayer(el.dataset.player);
    }));
  }

  /* ---------- Fiche joueur ---------- */
  const sign = (n) => (n > 0 ? "+" + n : String(n));
  const plain = (html) => html.replace(/<br>/g, ". ").replace(/<[^>]+>/g, "");

  /* Bulle d'information au survol (souris), au toucher et au clavier */
  function setupTips(root) {
    root.querySelectorAll(".chart").forEach((chart) => {
      const tip = $(".tip", chart);
      const hide = () => tip.classList.remove("show");
      const show = (el) => {
        tip.innerHTML = el.dataset.tip;
        tip.classList.add("show");
        const c = chart.getBoundingClientRect(), r = (el.querySelector(".fill, .dot") || el).getBoundingClientRect();
        const w = tip.offsetWidth, h = tip.offsetHeight;
        let left = Math.max(0, Math.min(r.left - c.left + r.width / 2 - w / 2, c.width - w));
        let top = r.top - c.top - h - 8;
        if (top < 0) { // pas de place au-dessus du point : sur le côté
          top = Math.max(0, r.top - c.top);
          left = r.right - c.left + 8;
          if (left + w > c.width) left = Math.max(0, r.left - c.left - w - 8);
        }
        tip.style.left = left + "px";
        tip.style.top = top + "px";
      };
      chart.querySelectorAll("[data-tip]").forEach((el) => {
        el.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse") show(el); });
        el.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse") hide(); });
        el.addEventListener("focus", () => show(el));
        el.addEventListener("blur", hide);
        el.addEventListener("click", (e) => { e.stopPropagation(); show(el); });
      });
      chart.addEventListener("pointerdown", (e) => { if (!e.target.closest("[data-tip]")) hide(); });
    });
  }

  /* Évolution du handicap de jeu : un point par semaine jouée */
  function chartHandicap(p) {
    const hist = p.hdc_historique;
    if (hist.length < 2) return "";
    const byWeek = Object.fromEntries(p.semaines.map((w) => [w.semaine, w]));
    const W = 360, H = 170, pad = { l: 30, r: 14, t: 16, b: 28 };
    const values = hist.map((h) => h.hdc);
    const min = Math.min(...values), max = Math.max(...values), span = max - min || 1;
    const x = (i) => pad.l + (i * (W - pad.l - pad.r)) / (hist.length - 1);
    const y = (v) => pad.t + ((max - v) * (H - pad.t - pad.b)) / span;
    const pts = hist.map((h, i) => [x(i), y(h.hdc)]);
    const tipOf = (h) => {
      if (h.semaine === 0) return `<b>Départ</b><br>Handicap de jeu : ${h.hdc}`;
      const w = byWeek[h.semaine];
      return `<b>${P()}${h.semaine} · ${esc(w.parcours)}</b><br>Handicap de jeu : ${w.hdc_avant} → ${w.hdc_apres}<br>${w.points_net} points nets (Stableford net ${w.stableford_net})`;
    };
    return `<div class="chart">
      <svg viewBox="0 0 ${W} ${H}" role="group" aria-label="Évolution du handicap de jeu : ${values[0]} au départ, ${values[values.length - 1]} actuellement">
        <text x="4" y="${pad.t + 4}">${max}</text><text x="4" y="${H - pad.b}">${min}</text>
        <polyline class="line" points="${pts.map((q) => q.join(",")).join(" ")}"/>
        ${pts.map((q, i) => { const t = tipOf(hist[i]); return `<g class="pt" transform="translate(${q[0]},${q[1]})" tabindex="0" role="img"
          aria-label="${esc(plain(t))}" data-tip="${esc(t)}"><circle class="hit" r="16"/><circle class="dot${i === pts.length - 1 ? " last" : ""}" r="4.5"/></g>`; }).join("")}
        ${hist.map((h, i) => (i === 0 || i === hist.length - 1 || hist.length < 9)
          ? `<text x="${pts[i][0]}" y="${H - 8}" text-anchor="middle">${h.semaine === 0 ? "départ" : P() + h.semaine}</text>` : "").join("")}
      </svg><div class="tip" role="status"></div></div>
      <p class="hint">Un handicap plus bas est meilleur. Survole ou touche un point pour voir le détail.</p>`;
  }

  /* Points de chaque semaine jouée (le score joué) */
  function chartScores(p, row) {
    const weeks = [...p.semaines].sort((a, b) => a.semaine - b.semaine);
    if (!weeks.length) return "";
    const W = 360, H = 200, pad = { l: 30, r: 10, t: 16, b: 28 };
    const pts = grossOnly() ? "points_brut" : "points_net";   // les points du classement affiché
    const maxV = Math.max(130, ...weeks.map((w) => w[pts]));
    const slot = (W - pad.l - pad.r) / weeks.length, bw = Math.min(34, slot * 0.64);
    const y = (v) => pad.t + ((maxV - v) * (H - pad.t - pad.b)) / maxV;
    const base = H - pad.b;
    const kindOf = (w) => (row && w.semaine === row.a_remplacer ? "replace" : row && row.comptees.includes(w.semaine) ? "counted" : "other");
    const KIND_TXT = { counted: "Compte dans le classement", replace: "Compte, mais sera le premier remplacé", other: "Ne compte pas (hors des meilleurs résultats)" };
    const tipOf = (w) => grossOnly()
      ? `<b>${P()}${w.semaine} · ${esc(w.parcours)}</b><br>Score : ${w.coups_brut} coups (${sign(w.coups_brut - w.par)} par)<br>Stableford : ${w.stableford_brut}<br>Points : <b>${w.points_brut}</b><br><i>${KIND_TXT[kindOf(w)]}</i>`
      : `<b>${P()}${w.semaine} · ${esc(w.parcours)}</b><br>Score : ${w.coups_brut} coups (${sign(w.coups_brut - w.par)} par) · net ${w.coups_net}<br>Stableford : ${w.stableford_net} net · ${w.stableford_brut} brut<br>Points : <b>${w.points_net} net</b> · ${w.points_brut} brut<br><i>${KIND_TXT[kindOf(w)]}</i>`;
    const showValues = slot >= 24;
    return `<div class="chart">
      <svg viewBox="0 0 ${W} ${H}" role="group" aria-label="Points ${grossOnly() ? "bruts" : "nets"} par ${unit().cap}">
        <line class="ref" x1="${pad.l}" x2="${W - pad.r}" y1="${y(100)}" y2="${y(100)}"/>
        <text x="4" y="${y(100) + 4}">100</text><text x="4" y="${base + 4}">0</text>
        ${weeks.map((w, i) => { const cx = pad.l + slot * i + slot / 2, t = tipOf(w); return `
          <g class="bar ${kindOf(w)}" tabindex="0" role="img" aria-label="${esc(plain(t))}" data-tip="${esc(t)}">
            <rect class="hit" x="${cx - slot / 2}" y="${pad.t}" width="${slot}" height="${base - pad.t}"/>
            <rect class="fill" x="${cx - bw / 2}" y="${y(w[pts])}" width="${bw}" height="${Math.max(2, base - y(w[pts]))}" rx="4"/>
            ${showValues ? `<text class="val" x="${cx}" y="${y(w[pts]) - 4}" text-anchor="middle">${w[pts]}</text>` : ""}
            <text x="${cx}" y="${H - 8}" text-anchor="middle">${weeks.length > 10 && i % 2 ? "" : P() + w.semaine}</text>
          </g>`; }).join("")}
      </svg><div class="tip" role="status"></div></div>
      <div class="legend"><span><i class="k-counted"></i>Compte</span>${grossOnly() ? "" : '<span><i class="k-replace"></i>Premier remplacé</span>'}<span><i class="k-other"></i>Ne compte pas</span><span>Ligne : 100 points</span></div>`;
  }

  /* Statistiques de jeu (longest drive, nearest to the pin, fairways, greens, putts), en mètres.
     Elles couvrent tous les tours de la semaine, pas seulement le tour retenu pour le classement. */
  const dec = (n, d = 1) => (n == null ? "–" : n.toFixed(d).replace(".", ","));
  const place = (rang, sur) => `${rang === 1 ? "1er" : rang + "e"} sur ${sur}`;
  const pct = (n) => (n == null ? "–" : dec(n, Number.isInteger(n) ? 0 : 1) + " %");

  function sectionStats(p) {
    const st = p.stats;
    if (!st) return "";
    const r = st.resume, weeks = [...st.semaines].sort((a, b) => b.semaine - a.semaine);
    const bd = r.meilleur_drive, bc = r.meilleur_ctp;
    const driveWeek = bd && st.semaines.find((w) => w.semaine === bd.semaine);
    const ctpHole = bc && st.semaines.find((w) => w.semaine === bc.semaine).ctp.find((h) => h.trou === bc.trou);
    const ctpCell = (w) => {
      if (!w.ctp.length) return "–";
      const best = w.ctp.reduce((a, b) => (b.m < a.m ? b : a));
      return `${dec(best.m, 2)} m <small>trou ${best.trou}${w.ctp.length > 1 ? ` · +${w.ctp.length - 1}` : ""}</small>`;
    };
    const avg = (k) => (r[k] == null ? "–" : k === "putts" ? dec(r[k]) : pct(r[k]));
    const sg = P() === "SG";   // Short Game : ni drive ni fairways
    return `
      <section><h3>Statistiques</h3>
        <div class="kpis">
          ${sg ? "" : `<div class="fact"><div class="label">Avg driving distance</div><div class="value">${bd ? dec(bd.m, 1) + " m" : "–"}</div>
            <div class="note">${bd ? `meilleure moyenne · ${P()}${bd.semaine} · ${place(driveWeek.drive_rang, driveWeek.drive_sur)}` : "pas encore"}</div></div>`}
          <div class="fact"><div class="label">Closest to the pin</div><div class="value">${bc ? dec(bc.m, 2) + " m" : "–"}</div>
            <div class="note">${bc ? `${P()}${bc.semaine} · trou ${bc.trou} · ${place(ctpHole.rang, ctpHole.sur)}` : "pas encore"}</div></div>
          <div class="fact"><div class="label">Putts par tour</div><div class="value">${avg("putts")}</div><div class="note">en moyenne</div></div>
        </div>
        <div class="table-wrap"><table class="mini-table"><caption class="sr">Statistiques par ${unit().cap}</caption>
          <thead><tr><th scope="col">${unit().short}</th>${sg ? "" : '<th scope="col">Avg drive</th>'}<th scope="col">Closest to the pin</th>${sg ? "" : '<th scope="col">FIR</th>'}<th scope="col">GIR</th><th scope="col">Putts</th></tr></thead>
          <tbody>${weeks.map((w) => `<tr><td>${P()}${w.semaine}</td>
            ${sg ? "" : `<td>${w.drive_m == null ? "–" : `<b>${dec(w.drive_m, 1)} m</b> <small>${place(w.drive_rang, w.drive_sur)}</small>`}</td>`}
            <td>${ctpCell(w)}</td>${sg ? "" : `<td>${pct(w.fairways)}</td>`}<td>${pct(w.greens)}</td><td>${dec(w.putts)}</td></tr>`).join("")}</tbody>
          <tfoot><tr><th scope="row" colspan="${sg ? 2 : 3}">Moyenne par tour</th>${sg ? "" : `<td>${avg("fairways")}</td>`}<td>${avg("greens")}</td><td>${avg("putts")}</td></tr></tfoot></table></div>
        <p class="hint">Distances en mètres.${sg ? "" : ` Avg drive : distance moyenne de tes drives ${unit().end}, mesurée par SGT (la meilleure en haut).`} Closest to the pin : ton coup de départ le plus près du drapeau sur un par 3, green atteint (le trou est indiqué, « +2 » = deux autres par 3 réussis).${sg ? "" : " FIR : fairways touchés."} GIR : greens en régulation. Statistiques de ta partie ${unit().end}.</p>
      </section>`;
  }

  function openPlayer(name) {
    const p = data.joueurs.find((j) => j.joueur === name);
    if (!p) return;
    const cat = data.categories.find((c) => c.nom === p.categorie);
    const size = (k) => cat.classement[k].filter((r) => r.rang).length;
    const row = cat.classement[kind()].find((r) => r.joueur === p.joueur);
    const weeks = [...p.semaines].sort((a, b) => b.semaine - a.semaine);
    dialog.innerHTML = `
      <div class="dlg-head"><h2 id="player-name">${esc(p.joueur)}</h2><p>${esc(p.categorie)}</p>
        <button type="button" class="dlg-close" aria-label="Fermer">×</button></div>
      <div class="dlg-body">
        <div class="kpis">
          ${grossOnly() ? `<div class="fact"><div class="label">Rang brut</div><div class="value">${p.rang_brut ?? "–"}</div><div class="note">${num(p.total_brut)} pts sur ${size("brut")} classés</div></div>`
            : `<div class="fact"><div class="label">Rang net</div><div class="value">${p.rang_net ?? "–"}</div><div class="note">${num(p.total_net)} pts sur ${size("net")} classés</div></div>
          <div class="fact"><div class="label">Rang brut</div><div class="value">${p.rang_brut ?? "–"}</div><div class="note">${num(p.total_brut)} pts</div></div>
          <div class="fact"><div class="label">Handicap de jeu</div><div class="value">${p.hdc_actuel}</div><div class="note">au départ : ${p.hdc_depart}</div></div>`}
        </div>
        ${p.semaines.length ? `
        <section><h3>Points par partie</h3>${chartScores(p, row)}</section>
        ${grossOnly() ? "" : `<section><h3>Évolution du handicap</h3>${chartHandicap(p)}</section>`}
        <div class="table-wrap"><table class="mini-table"><caption class="sr">Résultats retenus par ${unit().cap}</caption>
          ${grossOnly()
            ? `<thead><tr><th scope="col">${unit().short}</th><th class="name" scope="col">Parcours</th><th scope="col">Score</th><th scope="col">Stableford</th><th scope="col">Points</th></tr></thead>
          <tbody>${weeks.map((w) => `<tr><td>${P()}${w.semaine}</td><td class="name">${esc(w.parcours)}</td>
            <td>${w.coups_brut} <small>(${sign(w.coups_brut - w.par)})</small></td><td>${w.stableford_brut}</td><td><b>${w.points_brut}</b></td></tr>`).join("")}</tbody>`
            : `<thead><tr><th scope="col">${unit().short}</th><th class="name" scope="col">Parcours</th><th scope="col">Score</th><th scope="col">Stab. net</th><th scope="col">Pts net</th><th scope="col">Pts brut</th><th scope="col">Hdc</th></tr></thead>
          <tbody>${weeks.map((w) => `<tr><td>${P()}${w.semaine}</td><td class="name">${esc(w.parcours)}</td>
            <td>${w.coups_brut} <small>(${sign(w.coups_brut - w.par)})</small></td><td>${w.stableford_net}</td>
            <td><b>${w.points_net}</b></td><td>${w.points_brut}</td><td>${w.hdc_avant} → ${w.hdc_apres}</td></tr>`).join("")}</tbody>`}</table></div>`
        : '<p class="empty">Pas encore de résultat pour ce joueur.</p>'}
        ${sectionStats(p)}
      </div>`;
    dialog.showModal();
    setupTips(dialog);
    $(".dlg-close", dialog).addEventListener("click", () => dialog.close());
  }
  dialog.addEventListener("click", (e) => { if (e.target === dialog) dialog.close(); });

  /* ---------- Parcours : semaine en cours, semaine suivante et historique, une catégorie à la fois ---------- */
  const key = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const tr = (map, v) => (v == null ? null : map[key(v)] ?? String(v));
  // Les termes techniques de golf restent en anglais, comme sur SGT et sur la carte de score
  const FIRMNESS = { soft: "Soft", medium: "Medium", middle: "Medium", firm: "Firm", hard: "Hard" };
  const TEES = { par3: "Par 3", white: "Blanc", yellow: "Jaune", blue: "Bleu", black: "Noir", red: "Rouge", gold: "Or", green: "Vert", orange: "Orange", silver: "Argent" };
  const WINDS = { nowind: "No wind", calm: "Calm", breezy: "Breezy", gusty: "Gusty", windy: "Windy" };
  const WEATHER = { clear: "Dégagé", sunny: "Ensoleillé", cloudy: "Nuageux", partlycloudy: "Peu nuageux", overcast: "Couvert", rain: "Pluie", rainy: "Pluie", fog: "Brouillard", foggy: "Brouillard" };
  const DAYS = { monday: "lundi", tuesday: "mardi", wednesday: "mercredi", thursday: "jeudi", friday: "vendredi", saturday: "samedi", sunday: "dimanche" };
  const PUTTING = { normal: "Normal", nogimmes: "Sans gimmie", nogimmies: "Sans gimmie" };
  const metres = (v) => { // les distances de SGT sont en pieds : on les affiche en mètres
    const m = /^(\d+(?:\.\d+)?)\s*(?:feet|ft)$/i.exec(String(v ?? "").trim());
    return m ? `${dec(Number(m[1]) * 0.3048)} m` : v;
  };

  /* Les réglages du parcours, sous forme de [titre, valeur, note]. Une valeur { html, text } liste une valeur par catégorie
     (chez SGT, chaque catégorie a son tournoi : départ, slope et gimmies peuvent différer) */
  function perCategory(e, key, fmt) {
    const per = e.par_categorie;
    if (!per || new Set(per.map((p) => JSON.stringify([p[key], key === "depart" ? p.pente : null]))).size < 2) return null;
    return {
      html: per.map((p) => `<span class="percat"><b>${esc(p.categorie)}</b> ${esc(fmt(p) ?? "–")}</span>`).join(""),
      text: per.map((p) => `${p.categorie} ${fmt(p) ?? "–"}`).join(" · "),
    };
  }
  function courseParams(e) {
    const r = e.reglages || {};
    const tee = perCategory(e, "depart", (p) => (p.depart ? `${tr(TEES, p.depart)}${p.pente ? ` · slope ${p.pente} · CR ${p.cotation ?? "–"}` : ""}` : null));
    const gim = perCategory(e, "gimmies", (p) => (p.gimmies ? metres(p.gimmies) : null));
    const rows = [
      tee ? ["Départ", tee, null] : ["Départ", e.depart ? tr(TEES, e.depart) : null, r.pente ? `slope ${r.pente} · course rating ${r.cotation ?? "–"}` : null],
      ["On joue", e.neuf ? NINE[e.neuf] ?? e.neuf : null, e.par ? `par ${e.par}` : null],
      ["Longueur", e.longueur_jaune_m ? `${num(e.longueur_jaune_m)} m` : null, e.longueur_jaune_m ? "18 trous, départ jaune" : null],
      ["Stimp", r.stimp ?? null, "vitesse des greens"],
      ["Greens", tr(FIRMNESS, r.greens)],
      ["Fairways", tr(FIRMNESS, r.fairways)],
      ["Vent", r.vent ? tr(WINDS, r.vent) : e.vent ? tr(WINDS, e.vent) : null, r.vent ? null : e.vent ? "conseillé" : null],
      ["Météo", tr(WEATHER, r.meteo)],
      ["Drapeaux", r.drapeaux ? tr(DAYS, r.drapeaux) : null],
      ["Gimmies", gim || (r.gimmies ? metres(r.gimmies) : null)],
      ["Putting", tr(PUTTING, r.putting)],
    ];
    return rows.filter(([, v]) => v != null && v !== "");
  }
  const dates = (e) => (!e.fin || e.fin <= e.debut ? `le ${day(e.debut)}` : `du ${day(e.debut)} au ${day(e.fin)}`);
  const factsHtml = (e) => courseParams(e).map(([l, v, n]) =>
    `<div class="fact${typeof v === "object" ? " wide" : ""}"><div class="label">${esc(l)}</div><div class="value">${typeof v === "object" ? v.html : esc(v)}</div>${n ? `<div class="note">${esc(n)}</div>` : ""}</div>`).join("");
  const chipsHtml = (e) => courseParams(e).map(([l, v]) => `<span><b>${esc(l)}</b> ${esc(typeof v === "object" ? v.text : v)}</span>`).join("");

  /* Grande fiche : semaine en cours ou semaine suivante */
  function courseCard(e, kicker) {
    const diff = e.difficulte == null ? null : e.difficulte <= 3 ? "facile" : e.difficulte <= 6 ? "moyen" : "difficile";
    const facts = factsHtml(e) + (diff ? `<div class="fact"><div class="label">Difficulté</div><div class="value">${e.difficulte}/10</div><div class="note">${diff}</div></div>` : "");
    return `<article class="card course">
      <div class="course-head"><span class="kicker">${esc(kicker)}</span><h2>${esc(e.nom)}</h2><p>${esc(e.lieu || "")}${e.debut ? `${e.lieu ? " · " : ""}${dates(e)}` : ""}</p></div>
      <div class="course-body">
        ${facts ? `<div class="facts">${facts}</div>` : ""}
        ${e.description ? `<p>${esc(e.description)}</p>` : ""}
        ${e.styles?.length ? `<div class="tags">${e.styles.map((s) => `<span class="tag">${esc(s)}</span>`).join("")}</div>` : ""}
        ${e.lien_carte ? `<figure class="scorecard"><a href="${esc(e.lien_carte)}" target="_blank" rel="noopener" title="Ouvrir la carte en grand">
          <img src="${esc(e.lien_carte)}" alt="Carte de score de ${esc(e.nom)} : longueurs par départ, pars et index des trous" loading="lazy" referrerpolicy="no-referrer"></a>
          <figcaption>Carte de score · Simulator Golf Tour · touche l'image pour l'agrandir</figcaption></figure>` : ""}
        ${e.lien_video ? `<div class="actions"><a class="btn" href="${esc(e.lien_video)}" target="_blank" rel="noopener">Voir le survol du parcours</a></div>` : ""}
      </div></article>`;
  }

  function viewCourse() {
    const { current, next, history } = courseState();
    const u = unit();
    app.innerHTML = `${compBar()}
      <h2>Parcours</h2>
      <p class="sub">Les réglages ${u.end}, le parcours à venir et ceux déjà joués. C'est le même parcours pour toutes les catégories ; le départ, et parfois les gimmies, changent selon la catégorie.</p>
      ${current ? `<section><h3>${u.this}</h3>${courseCard(current, `${u.Cap} ${P()}${current.semaine} · en cours`)}
        <p class="sub" style="margin-top:12px">Joue ton tour sur Simulator Golf Tour avant la fin ${u.end} (jusqu'au ${day(current.fin)}) : tu n'as droit qu'à un seul tour.</p></section>`
        : `<section><h3>${u.this}</h3><p class="empty">Aucun tournoi en cours pour le ${esc(data.nom)}.</p></section>`}
      ${next ? `<section><h3>${u.next}</h3>${courseCard(next, `${u.Cap} ${P()}${next.semaine} · à venir`)}</section>` : ""}
      ${history.length ? `<section><h3>Historique</h3><div class="grid history">${history.map((e) => `
        <article class="card week">
          <header><span class="no">${P()}${e.semaine}</span><span class="badge">Terminée</span></header>
          <div class="course-name">${esc(e.nom)}</div><div class="dates">${dates(e)}</div>
          <div class="mini">${chipsHtml(e)}</div>
          ${e.lien_carte ? `<div class="note"><a href="${esc(e.lien_carte)}" target="_blank" rel="noopener">Carte de score</a></div>` : ""}
        </article>`).join("")}</div></section>` : ""}`;
    bindComp("parcours");
    guardScorecard();
  }

  /* Si l'image de la carte ne charge pas, on garde un lien pour l'ouvrir sur SGT */
  function guardScorecard() {
    app.querySelectorAll(".scorecard img").forEach((img) => img.addEventListener("error", () => {
      const a = img.closest("a");
      img.closest("figure").innerHTML = `<a class="btn alt" href="${esc(a.href)}" target="_blank" rel="noopener">Voir la carte de score</a>`;
    }));
  }

  /* ---------- Semaines ---------- */
  function viewWeeks() {
    const weeks = [...data.semaines].sort((a, b) => b.numero - a.numero);
    const u = unit();
    app.innerHTML = `${compBar()}<h2>${u.caps}</h2><p class="sub">Les meilleurs scores en Stableford de chaque ${u.cap}.</p>
      ${weeks.length ? "" : `<p class="empty">${u.none}</p>`}
      <div class="grid weeks">${weeks.map((w) => {
        const totals = Object.fromEntries(STATS.map(([k]) => [k, w.categories.reduce((s, c) => s + c.stats[k], 0)]));
        return `<article class="card week">
          <header><span class="no">${P()}${w.numero}</span><span class="badge ${w.statut === "en_cours" ? "live-badge" : ""}">${w.statut === "en_cours" ? "En cours" : "Terminée"}</span></header>
          <div class="course-name">${esc(w.parcours)}</div><div class="dates">${dates(w)}</div>
          <dl>${w.categories.map((c) => `<dt>${esc(c.categorie)} · ${pl(c.joueurs, "joueur")}</dt>
            <dd>${c.meilleur_brut.stableford == null ? "Pas de résultat" : grossOnly()
              ? `Brut ${c.meilleur_brut.stableford} (${esc(c.meilleur_brut.joueurs.join(", "))})`
              : `Net ${c.meilleur_net.stableford} (${esc(c.meilleur_net.joueurs.join(", "))}) · Brut ${c.meilleur_brut.stableford} (${esc(c.meilleur_brut.joueurs.join(", "))})`}</dd>`).join("")}</dl>
          <div class="mini">${STATS.map(([k, label]) => `<span><b>${totals[k]}</b> ${label}</span>`).join("")}</div>
        </article>`;
      }).join("")}</div>`;
    bindComp("semaines");
  }

  /* ---------- Joueurs ---------- */
  function viewPlayers() {
    app.innerHTML = `${compBar()}<h2>Joueurs</h2><p class="sub">Touche un joueur pour voir sa fiche.</p>
      <div class="toolbar"><input class="search" id="pq" type="search" placeholder="Chercher un joueur" aria-label="Chercher un joueur"></div>
      <div class="grid players" id="plist"></div>`;
    const draw = () => {
      const q = $("#pq").value.trim().toLowerCase();
      const list = data.joueurs.filter((j) => j.joueur.toLowerCase().includes(q));
      $("#plist").innerHTML = list.length ? list.map((j) => `<button type="button" class="card pcard" data-player="${esc(j.joueur)}">
        <span><span class="n">${nm(j.joueur)}</span><br><span class="c">${esc(j.categorie)}${grossOnly() ? "" : ` · hdc ${j.hdc_actuel}`}</span></span>
        <span class="r">${(grossOnly() ? j.rang_brut : j.rang_net) ? "#" + (grossOnly() ? j.rang_brut : j.rang_net) : "–"}</span></button>`).join("") : '<p class="empty">Aucun joueur.</p>';
      bindPlayers();
    };
    $("#pq").addEventListener("input", draw);
    bindComp("joueurs");
    draw();
  }

  /* ---------- Règles ---------- */
  /* Fin de la saison du Winter Challenge (donnée par Mike, 08.11.2026) : sert à la durée affichée dans les règles */
  const SEASON_END = "2027-03-25";
  function seasonWeeks() {
    const starts = (Array.isArray(comps[0].parcours) ? comps[0].parcours : []).map((e) => e.debut).filter(Boolean).sort();
    if (!starts.length) return null;
    const days = (Date.parse(SEASON_END) - Date.parse(starts[0])) / 86400000;
    return Math.ceil((days + 1) / 7);   // semaines du début de la WC1 jusqu'au dernier jour de la saison compris
  }

  function viewRules() {
    const r = data.regles;
    const wc = comps[0], others = comps.slice(1);
    const catNames = ["Hommes", "Femmes", "Seniors"];
    raw.categories.forEach((c) => { if (catNames.indexOf(c.nom) < 0) catNames.push(c.nom); });   // toutes les catégories, même sans joueur pour l'instant
    const cats = catNames.map((n) => `<strong>${esc(n)}</strong>`).join(", ");
    const rule = (title, html) => `<div class="card rule"><h3>${title}</h3><p>${html}</p></div>`;
    const short = (c) => { const n = c.meilleurs || r.meilleurs; return [
      rule(`${n} mois, ${n} parcours`, `Le ${esc(c.nom)} dure <strong>${n} mois</strong> : un tournoi par mois sur Simulator Golf Tour (${esc(c.prefixe)}1 à ${esc(c.prefixe)}${n}), sur <strong>${n} parcours</strong> différents, propres au ${esc(c.nom)}. Tu joues les <strong>18 trous</strong>. Tu es inscrit d'office, en même temps que dans le ${esc(wc.nom)}.`),
      rule(`Un seul tour par mois`, `Comme au ${esc(wc.nom)}, tu n'as droit qu'à <strong>un seul tour</strong> par tournoi : pas de seconde chance.`),
      c.brut_seul
        ? rule(`Brut seulement, sans handicap`, `<strong>Tout le monde joue avec un handicap de 0</strong>, sans exception. Il n'y a donc ni classement net, ni handicap de jeu à suivre : seul compte ton score brut.`)
        : rule(`Net et brut`, `Le ${esc(c.nom)} a un classement net et un classement brut, comme le ${esc(wc.nom)}.`),
      rule(`Un seul classement pour tous`, `${c.brut_seul ? "Hommes, Femmes et Seniors jouent ensemble : " : ""}il y a un seul classement${c.categories.length > 1 ? " par catégorie" : ""}. Les points se calculent comme au ${esc(wc.nom)} (Stableford, 100 points de référence), et <strong>tes ${n} résultats comptent tous</strong> au classement : pas de résultat à remplacer.`),
    ].join(""); };
    const sg = others.find((c) => c.id === state.comp);   // la compétition choisie en haut de la page
    const stat = (label, value, note) => `<div class="card stat"><div class="label">${label}</div><div class="value">${value}</div><div class="note">${note}</div></div>`;
    const play = (c) => `
      <h3 class="rules-title">Pour jouer</h3>
      <div class="rules">
        ${c ? "" : rule("Le tee de départ", "Le capitaine se réserve le droit de <strong>déplacer le tee de départ</strong> des joueurs en haut du classement, si l'écart avec les autres devient trop important.")}
        ${rule("Ton compte", "Ton pseudo est ton nom d'utilisateur Simulator Golf Tour, le même dans GSPro : c'est lui qui apparaît ici. Pour choisir ou changer ton mot de passe, utilise « mot de passe oublié » sur simulatorgolftour.com avec l'adresse e-mail de ton inscription.")}
        ${rule("Où jouer", "Sur les simulateurs du Let's Golf, à Bussigny, avec GSPro : ton tour est envoyé tout seul au tournoi de Simulator Golf Tour.")}
        ${rule("Les statistiques", c
          ? `Sous le classement, trois tuiles donnent le meilleur ${unit().end} : greens en régulation (GIR), closest to the pin et total putt length. Ta fiche joueur garde les tiennes.`
          : "Sous chaque classement, cinq tuiles donnent le meilleur de la semaine : fairways touchés (FIR), greens en régulation (GIR), avg driving distance, closest to the pin et total putt length. Ta fiche joueur garde les tiennes.")}
        ${rule("Les résultats", "Ce site se met à jour tout seul, toutes les 5 minutes environ en journée : ton score apparaît peu après la fin de ton tour.")}
      </div>`;

    app.innerHTML = sg ? `${compBar()}<h2>Règles</h2>
      <p class="sub">Tout ce qu'il faut savoir pour jouer au ${esc(sg.nom)}. Tu y es inscrit d'office, en même temps qu'au ${esc(wc.nom)}.</p>
      <section class="grid stats five" aria-label="Les règles en bref">
        ${stat("Essais", "1 seul tour", "par mois, sans seconde chance")}
        ${stat("Format", "18 trous", "sur le parcours du mois")}
        ${stat("Durée", `${sg.meilleurs || r.meilleurs} mois`, `un parcours par mois`)}
        ${stat("Classement", `${sg.meilleurs || r.meilleurs} résultats`, "ils comptent tous")}
        ${stat("Handicap", "0 pour tous", sg.brut_seul ? "brut seulement" : "net et brut")}
      </section>
      <h3 class="rules-title">${esc(sg.nom)}</h3>
      <div class="rules">${short(sg)}</div>
      ${play(sg)}`
    : `${compBar()}<h2>Règles</h2>
      <p class="sub">Tout ce qu'il faut savoir pour jouer au ${esc(wc.nom)}.${others.length ? ` Tu es aussi inscrit d'office au ${others.map((c) => esc(c.nom)).join(" et au ")} : ses règles sont dans l'autre onglet.` : ""}</p>
      <section class="grid stats five" aria-label="Les règles en bref">
        ${stat("Essais", "1 seul tour", "par semaine, sans seconde chance")}
        ${stat("Format", "9 trous", "sur le parcours de la semaine")}
        ${stat("Durée", seasonWeeks() ? `${seasonWeeks()} semaines` : "–", `jusqu'au ${day(SEASON_END)}`)}
        ${stat("Classement", `${r.meilleurs} meilleurs`, "résultats de la saison")}
        ${stat("Handicap", "75 %", "de ton handicap réel au départ")}
      </section>
      <h3 class="rules-title">${esc(wc.nom)}</h3>
      <div class="rules">
        ${rule("Une semaine, un parcours", "Chaque semaine, un parcours est choisi sur Simulator Golf Tour. Tu joues <strong>9 trous</strong> depuis ton simulateur, quand tu veux pendant la semaine. Le parcours et ses réglages sont sur la page Parcours.")}
        ${rule("Un seul tour par semaine", "Tu n'as droit qu'à <strong>un seul tour</strong> par semaine : pas de seconde chance. Ton <strong>Stableford</strong> de ce tour donne tes points, pour les classements brut et net.")}
        ${rule("Les points", "Sur 9 trous, <strong>18 points Stableford valent 100 points</strong> de classement, et chaque point de plus ou de moins vaut 10 points (minimum 30). Sur 18 trous, la référence est de 36 points.")}
        ${rule("Brut et net", "Le classement <strong>brut</strong> compte ton score tel quel. Le classement <strong>net</strong> tient compte de ton handicap de jeu : tu reçois des coups sur les trous les plus difficiles.")}
        ${rule("Le handicap de jeu", "Il part des <strong>trois quarts (75 %) de ton handicap réel</strong> (sans handicap réel connu, tu pars à 0). Il ne change qu'à la fin de chaque semaine : il monte de 1 si tu fais moins de 100 points nets, sinon il baisse d'un point par tranche de 10 points au-dessus de 100. Un handicap plus bas est meilleur.")}
        ${rule("Les catégories", `${cats} : chaque catégorie a son propre classement, en net et en brut.`)}
        ${rule("Le classement final", `Seuls tes <strong>${r.meilleurs} meilleurs résultats</strong> de la saison comptent. Dans le tableau, ils sont en vert, et le plus petit d'entre eux est en rouge : c'est le premier que tu remplaceras si tu fais mieux. La flèche indique les places gagnées ou perdues depuis la semaine précédente.`)}
      </div>
      ${play(null)}`;
    bindComp("regles");
  }

  /* ---------- Démarrage ---------- */
  const VIEWS = { classement: viewRanking, parcours: viewCourse, semaines: viewWeeks, joueurs: viewPlayers, regles: viewRules };
  function render() {
    const { route, params } = parseHash();
    const name = VIEWS[route] ? route : "classement";
    useComp(params.comp || state.comp);
    const weeksTab = document.querySelector('.tabs a[data-route="semaines"]');
    if (weeksTab) weeksTab.textContent = unit().caps;   // l'onglet s'appelle « Mois » pour le Short Game
    document.querySelectorAll(".tabs a").forEach((a) => (a.dataset.route === name ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current")));
    VIEWS[name](params);
  }
  window.addEventListener("hashchange", () => { render(); window.scrollTo(0, 0); });

  fetch("donnees/saison.json?v=" + Date.now())
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then((json) => {
      raw = json;
      comps = [{ id: "wc", ...json }, ...(json.competitions_autres || []).map((c) => ({ ...c, id: String(c.prefixe).toLowerCase() }))];
      data = { ...raw };
      $("#season-label").textContent = data.saison;
      $("#updated").textContent = "Mis à jour le " + stamp(data.genere_le);
      $("#demo-banner").hidden = !data.demo;
      if (!data.semaines.length) { app.innerHTML = '<p class="empty">La saison n\'a pas encore commencé.</p>'; return; }
      render();
    })
    .catch(() => { app.innerHTML = '<p class="empty">Impossible de charger les données pour le moment. Réessaie dans quelques minutes.</p>'; });
})();
