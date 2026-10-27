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

  const STYLES = {
    Mountain: "Montagne", Coastal: "Côtier", Links: "Links", Parkland: "Parkland", Desert: "Désert", Fantasy: "Fantasy",
    Heathland: "Heathland", Historic: "Historique", Tropical: "Tropical", "Major Venue": "Parcours de majeur",
    "Tour Stop": "Étape de tournoi", Beginner: "Débutant", Training: "Entraînement",
  };
  const WIND = { NoWind: "Aucun vent", Calm: "Calme", Breezy: "Brise légère", Gusty: "Rafales" };
  const NINE = { Front: "trous 1 à 9", Back: "trous 10 à 18", All: "les 18 trous" };
  const STATS = [["eagles", "eagles"], ["birdies", "birdies"], ["pars", "pars"], ["bogeys", "bogeys"]];

  let data = null;
  const state = { kind: "net", cat: null, q: "", pcat: null };

  /* ---------- Routage : #/classement?cat=Femmes&kind=brut ---------- */
  function parseHash() {
    const [path, query = ""] = location.hash.replace(/^#\/?/, "").split("?");
    return { route: path || "classement", params: Object.fromEntries(new URLSearchParams(query)) };
  }
  function go(route, params = {}) {
    const q = new URLSearchParams(params).toString();
    history.replaceState(null, "", `#/${route}${q ? "?" + q : ""}`);
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
    state.cat = cats.some((c) => c.nom === (params.cat || state.cat)) ? params.cat || state.cat : cats[0].nom;
    state.kind = (params.kind || state.kind) === "brut" ? "brut" : "net";
    const week = latestWeek();
    const pc = data.parcours_semaine;
    const upcoming = pc && week && pc.semaine > week.numero;
    const course = upcoming ? pc.nom : (week && week.parcours);
    const leaders = cats.map((c) => c.classement[state.kind][0]).filter((r) => r && r.rang);

    app.innerHTML = `
      <section class="grid stats" aria-label="En bref">
        <div class="card stat"><div class="label">Semaine</div>
          <div class="value">WC${esc(week?.numero)} ${week?.statut === "en_cours" ? '<span class="live">en cours</span>' : ""}</div>
          <div class="note">${week ? `${day(week.debut)} au ${day(week.fin)}` : ""}</div></div>
        <div class="card stat"><div class="label">${upcoming ? "Prochain parcours" : "Parcours"}</div><div class="value">${esc(course)}</div>
          <div class="note"><a href="#/parcours">Voir la fiche du parcours</a></div></div>
        <div class="card stat"><div class="label">Joueurs</div><div class="value">${data.joueurs.length}</div>
          <div class="note">${pl(data.semaines.length, "semaine")} jouée${data.semaines.length > 1 ? "s" : ""}</div></div>
        <div class="card stat"><div class="label">Meilleur ${state.kind === "net" ? "net" : "brut"}</div>
          <div class="value">${leaders.length ? esc(leaders.sort((a, b) => b.total - a.total)[0].joueur) : "–"}</div>
          <div class="note">${leaders.length ? num(leaders[0].total) + " points" : "Pas encore de résultat"}</div></div>
      </section>

      <h2>Classement ${state.kind === "net" ? "net Stableford" : "brut"}</h2>
      <p class="sub">Les ${data.regles.meilleurs} meilleurs résultats de la saison comptent. Touche un joueur pour voir sa fiche.</p>
      <div class="toolbar">
        <div class="seg" role="group" aria-label="Type de classement">
          <button type="button" data-kind="net" aria-pressed="${state.kind === "net"}">Net</button>
          <button type="button" data-kind="brut" aria-pressed="${state.kind === "brut"}">Brut</button>
        </div>
        ${cats.length > 1 ? `<div class="chips" role="group" aria-label="Catégorie">${cats.map((c) =>
          `<button type="button" data-cat="${esc(c.nom)}" aria-pressed="${c.nom === state.cat}">${esc(c.nom)}</button>`).join("")}</div>` : ""}
        <input class="search" id="q" type="search" placeholder="Chercher un joueur" aria-label="Chercher un joueur" value="${esc(state.q)}">
      </div>
      <div id="podium"></div>
      <div id="ranking"></div>`;

    app.querySelectorAll("[data-kind]").forEach((b) => b.addEventListener("click", () => { go("classement", { cat: state.cat, kind: b.dataset.kind }); render(); }));
    app.querySelectorAll("[data-cat]").forEach((b) => b.addEventListener("click", () => { go("classement", { cat: b.dataset.cat, kind: state.kind }); render(); }));
    $("#q").addEventListener("input", (e) => { state.q = e.target.value; drawRanking(); });
    drawRanking();
  }

  function drawRanking() {
    const cat = data.categories.find((c) => c.nom === state.cat);
    const all = cat.classement[state.kind];
    const q = state.q.trim().toLowerCase();
    const rows = q ? all.filter((r) => r.joueur.toLowerCase().includes(q)) : all;
    const weeks = weekNumbersDesc();

    const top = all.filter((r) => r.rang && r.rang <= 3).slice(0, 3);
    $("#podium").innerHTML = !q && top.length >= 3 ? `<div class="grid podium">${top.map((r, i) => `
      <div class="card pod p${i + 1}"><button type="button" data-player="${esc(r.joueur)}">
        <div class="medal">${r.rang}</div><div class="name">${nm(r.joueur)}</div>
        <div class="pts">${num(r.total)}</div><div class="meta">${pl(r.nb_semaines, "semaine")} · hdc ${r.hdc_actuel}</div></button></div>`).join("")}</div>` : "";

    if (!rows.length) { $("#ranking").innerHTML = `<p class="empty">Aucun joueur ne correspond à « ${esc(state.q)} ».</p>`; bindPlayers(); return; }

    $("#ranking").innerHTML = `
      <div class="table-wrap"><table>
        <caption class="sr">Classement ${state.kind === "net" ? "net" : "brut"} ${esc(state.cat)}</caption>
        <thead><tr><th class="sticky-1" scope="col">#</th><th class="sticky-2 name" scope="col">Joueur</th><th scope="col">Évol.</th>
          <th scope="col">Hdc</th><th scope="col">Total</th>${weeks.map((w) => `<th scope="col">WC${w}</th>`).join("")}</tr></thead>
        <tbody>${rows.map((r) => `<tr data-player="${esc(r.joueur)}">
          <td class="sticky-1 rank">${r.rang ?? "–"}</td>
          <td class="sticky-2 name"><button type="button" data-player="${esc(r.joueur)}">${nm(r.joueur)}</button><small>${pl(r.nb_semaines, "semaine")}</small></td>
          <td>${evo(r.evolution)}</td><td>${r.hdc_actuel}</td><td class="total">${num(r.total)}</td>
          ${weeks.map((w) => {
            const p = r.points[String(w)];
            if (p == null) return '<td class="pt none">·</td>';
            const cls = w === r.a_remplacer ? "replace" : r.comptees.includes(w) ? "counted" : "";
            return `<td class="pt ${cls}">${p}</td>`;
          }).join("")}</tr>`).join("")}</tbody></table></div>
      <div class="legend"><span><i style="background:var(--counted)"></i>Résultat compté</span>
        <span><i style="background:var(--replace)"></i>Premier à être remplacé</span><span>Hdc : handicap de jeu actuel</span></div>`;
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
      return `<b>WC${h.semaine} · ${esc(w.parcours)}</b><br>Handicap de jeu : ${w.hdc_avant} → ${w.hdc_apres}<br>${w.points_net} points nets (Stableford net ${w.stableford_net})`;
    };
    return `<div class="chart">
      <svg viewBox="0 0 ${W} ${H}" role="group" aria-label="Évolution du handicap de jeu : ${values[0]} au départ, ${values[values.length - 1]} actuellement">
        <text x="4" y="${pad.t + 4}">${max}</text><text x="4" y="${H - pad.b}">${min}</text>
        <polyline class="line" points="${pts.map((q) => q.join(",")).join(" ")}"/>
        ${pts.map((q, i) => { const t = tipOf(hist[i]); return `<g class="pt" transform="translate(${q[0]},${q[1]})" tabindex="0" role="img"
          aria-label="${esc(plain(t))}" data-tip="${esc(t)}"><circle class="hit" r="16"/><circle class="dot${i === pts.length - 1 ? " last" : ""}" r="4.5"/></g>`; }).join("")}
        ${hist.map((h, i) => (i === 0 || i === hist.length - 1 || hist.length < 9)
          ? `<text x="${pts[i][0]}" y="${H - 8}" text-anchor="middle">${h.semaine === 0 ? "départ" : "WC" + h.semaine}</text>` : "").join("")}
      </svg><div class="tip" role="status"></div></div>
      <p class="hint">Un handicap plus bas est meilleur. Survole ou touche un point pour voir le détail.</p>`;
  }

  /* Points de la tentative retenue pour chaque semaine jouée (le score joué) */
  function chartScores(p, row) {
    const weeks = [...p.semaines].sort((a, b) => a.semaine - b.semaine);
    if (!weeks.length) return "";
    const W = 360, H = 200, pad = { l: 30, r: 10, t: 16, b: 28 };
    const maxV = Math.max(130, ...weeks.map((w) => w.points_net));
    const slot = (W - pad.l - pad.r) / weeks.length, bw = Math.min(34, slot * 0.64);
    const y = (v) => pad.t + ((maxV - v) * (H - pad.t - pad.b)) / maxV;
    const base = H - pad.b;
    const kindOf = (w) => (row && w.semaine === row.a_remplacer ? "replace" : row && row.comptees.includes(w.semaine) ? "counted" : "other");
    const KIND_TXT = { counted: "Compte dans le classement", replace: "Compte, mais sera le premier remplacé", other: "Ne compte pas (hors des meilleurs résultats)" };
    const tipOf = (w) => `<b>WC${w.semaine} · ${esc(w.parcours)}</b><br>Score : ${w.coups_brut} coups (${sign(w.coups_brut - w.par)} par) · net ${w.coups_net}<br>Stableford : ${w.stableford_net} net · ${w.stableford_brut} brut<br>Points : <b>${w.points_net} net</b> · ${w.points_brut} brut<br>${pl(w.tentatives, "tentative")}<br><i>${KIND_TXT[kindOf(w)]}</i>`;
    const showValues = slot >= 24;
    return `<div class="chart">
      <svg viewBox="0 0 ${W} ${H}" role="group" aria-label="Points nets par semaine">
        <line class="ref" x1="${pad.l}" x2="${W - pad.r}" y1="${y(100)}" y2="${y(100)}"/>
        <text x="4" y="${y(100) + 4}">100</text><text x="4" y="${base + 4}">0</text>
        ${weeks.map((w, i) => { const cx = pad.l + slot * i + slot / 2, t = tipOf(w); return `
          <g class="bar ${kindOf(w)}" tabindex="0" role="img" aria-label="${esc(plain(t))}" data-tip="${esc(t)}">
            <rect class="hit" x="${cx - slot / 2}" y="${pad.t}" width="${slot}" height="${base - pad.t}"/>
            <rect class="fill" x="${cx - bw / 2}" y="${y(w.points_net)}" width="${bw}" height="${Math.max(2, base - y(w.points_net))}" rx="4"/>
            ${showValues ? `<text class="val" x="${cx}" y="${y(w.points_net) - 4}" text-anchor="middle">${w.points_net}</text>` : ""}
            <text x="${cx}" y="${H - 8}" text-anchor="middle">${weeks.length > 10 && i % 2 ? "" : "WC" + w.semaine}</text>
          </g>`; }).join("")}
      </svg><div class="tip" role="status"></div></div>
      <div class="legend"><span><i class="k-counted"></i>Compte</span><span><i class="k-replace"></i>Premier remplacé</span><span><i class="k-other"></i>Ne compte pas</span><span>Ligne : 100 points</span></div>`;
  }

  /* Statistiques de jeu (longest drive, nearest to the pin, fairways, greens, putts), en mètres.
     Elles couvrent tous les tours de la semaine, pas seulement le tour retenu pour le classement. */
  const dec = (n, d = 1) => (n == null ? "–" : n.toFixed(d).replace(".", ","));
  const place = (rang, sur) => `${rang === 1 ? "1er" : rang + "e"} sur ${sur}`;
  const pct = (n) => (n == null ? "–" : n + " %");

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
      return `${dec(best.m)} m <small>trou ${best.trou}${w.ctp.length > 1 ? ` · +${w.ctp.length - 1}` : ""}</small>`;
    };
    const avg = (k) => (r[k] == null ? "–" : k === "putts" ? dec(r[k]) : pct(r[k]));
    return `
      <section><h3>Statistiques</h3>
        <div class="kpis">
          <div class="fact"><div class="label">Plus long drive</div><div class="value">${bd ? dec(bd.m, 0) + " m" : "–"}</div>
            <div class="note">${bd ? `WC${bd.semaine} · ${place(driveWeek.drive_rang, driveWeek.drive_sur)}` : "pas encore"}</div></div>
          <div class="fact"><div class="label">Plus près du drapeau</div><div class="value">${bc ? dec(bc.m) + " m" : "–"}</div>
            <div class="note">${bc ? `WC${bc.semaine} · trou ${bc.trou} · ${place(ctpHole.rang, ctpHole.sur)}` : "pas encore"}</div></div>
          <div class="fact"><div class="label">Putts par tour</div><div class="value">${avg("putts")}</div><div class="note">en moyenne</div></div>
        </div>
        <div class="table-wrap"><table class="mini-table"><caption class="sr">Statistiques par semaine</caption>
          <thead><tr><th scope="col">Sem.</th><th scope="col">Long drive</th><th scope="col">Près du drapeau</th><th scope="col">Fairways</th><th scope="col">Greens</th><th scope="col">Putts</th></tr></thead>
          <tbody>${weeks.map((w) => `<tr><td>WC${w.semaine}</td>
            <td>${w.drive_m == null ? "–" : `<b>${dec(w.drive_m, 0)} m</b> <small>${place(w.drive_rang, w.drive_sur)}</small>`}</td>
            <td>${ctpCell(w)}</td><td>${pct(w.fairways)}</td><td>${pct(w.greens)}</td><td>${dec(w.putts)}</td></tr>`).join("")}</tbody>
          <tfoot><tr><th scope="row" colspan="3">Moyenne par tour</th><td>${avg("fairways")}</td><td>${avg("greens")}</td><td>${avg("putts")}</td></tr></tfoot></table></div>
        <p class="hint">Distances en mètres. Drive : le plus long de la semaine. Près du drapeau : par 3, green atteint au départ. Statistiques de tous les tours de la semaine.</p>
      </section>`;
  }

  function openPlayer(name) {
    const p = data.joueurs.find((j) => j.joueur === name);
    if (!p) return;
    const cat = data.categories.find((c) => c.nom === p.categorie);
    const size = (kind) => cat.classement[kind].filter((r) => r.rang).length;
    const row = cat.classement.net.find((r) => r.joueur === p.joueur);
    const weeks = [...p.semaines].sort((a, b) => b.semaine - a.semaine);
    dialog.innerHTML = `
      <div class="dlg-head"><h2 id="player-name">${esc(p.joueur)}</h2><p>${esc(p.categorie)}</p>
        <button type="button" class="dlg-close" aria-label="Fermer">×</button></div>
      <div class="dlg-body">
        <div class="kpis">
          <div class="fact"><div class="label">Rang net</div><div class="value">${p.rang_net ?? "–"}</div><div class="note">${num(p.total_net)} pts sur ${size("net")} classés</div></div>
          <div class="fact"><div class="label">Rang brut</div><div class="value">${p.rang_brut ?? "–"}</div><div class="note">${num(p.total_brut)} pts</div></div>
          <div class="fact"><div class="label">Handicap de jeu</div><div class="value">${p.hdc_actuel}</div><div class="note">au départ : ${p.hdc_depart}</div></div>
        </div>
        ${p.semaines.length ? `
        <section><h3>Points par partie</h3>${chartScores(p, row)}</section>
        <section><h3>Évolution du handicap</h3>${chartHandicap(p)}</section>
        <div class="table-wrap"><table class="mini-table"><caption class="sr">Résultats retenus par semaine</caption>
          <thead><tr><th scope="col">Sem.</th><th class="name" scope="col">Parcours</th><th scope="col">Score</th><th scope="col">Stab. net</th><th scope="col">Pts net</th><th scope="col">Pts brut</th><th scope="col">Hdc</th><th scope="col">Essais</th></tr></thead>
          <tbody>${weeks.map((w) => `<tr><td>WC${w.semaine}</td><td class="name">${esc(w.parcours)}</td>
            <td>${w.coups_brut} <small>(${sign(w.coups_brut - w.par)})</small></td><td>${w.stableford_net}</td>
            <td><b>${w.points_net}</b></td><td>${w.points_brut}</td><td>${w.hdc_avant} → ${w.hdc_apres}</td><td>${w.tentatives}</td></tr>`).join("")}</tbody></table></div>`
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
  const FIRMNESS = { soft: "Souple", medium: "Moyen", middle: "Moyen", firm: "Ferme", hard: "Dur" };
  const TEES = { white: "Blanc", yellow: "Jaune", blue: "Bleu", black: "Noir", red: "Rouge", gold: "Or", green: "Vert", orange: "Orange", silver: "Argent" };
  const WINDS = { nowind: "Aucun vent", calm: "Calme", breezy: "Brise légère", gusty: "Rafales", windy: "Venteux" };
  const WEATHER = { clear: "Dégagé", sunny: "Ensoleillé", cloudy: "Nuageux", partlycloudy: "Peu nuageux", overcast: "Couvert", rain: "Pluie", rainy: "Pluie", fog: "Brouillard", foggy: "Brouillard" };
  const DAYS = { monday: "lundi", tuesday: "mardi", wednesday: "mercredi", thursday: "jeudi", friday: "vendredi", saturday: "samedi", sunday: "dimanche" };
  const PUTTING = { normal: "Normal", nogimmes: "Sans gimmie", nogimmies: "Sans gimmie" };
  const metres = (v) => { // les distances de SGT sont en pieds : on les affiche en mètres
    const m = /^(\d+(?:\.\d+)?)\s*(?:feet|ft)$/i.exec(String(v ?? "").trim());
    return m ? `${dec(Number(m[1]) * 0.3048)} m` : v;
  };

  /* Les réglages du parcours, sous forme de [titre, valeur, note] */
  function courseParams(e) {
    const r = e.reglages || {};
    const rows = [
      ["Départ", e.depart ? tr(TEES, e.depart) : null, r.pente ? `pente ${r.pente} · cotation ${r.cotation ?? "–"}` : null],
      ["On joue", e.neuf ? NINE[e.neuf] ?? e.neuf : null, e.par ? `par ${e.par}` : null],
      ["Longueur", e.longueur_jaune_m ? `${num(e.longueur_jaune_m)} m` : null, e.longueur_jaune_m ? "18 trous, départ jaune" : null],
      ["Stimp", r.stimp ?? null, "vitesse des greens"],
      ["Greens", tr(FIRMNESS, r.greens)],
      ["Fairways", tr(FIRMNESS, r.fairways)],
      ["Vent", r.vent ? tr(WINDS, r.vent) : e.vent ? tr(WINDS, e.vent) : null, r.vent ? null : e.vent ? "conseillé" : null],
      ["Météo", tr(WEATHER, r.meteo)],
      ["Drapeaux", r.drapeaux ? tr(DAYS, r.drapeaux) : null],
      ["Gimmies", r.gimmies ? metres(r.gimmies) : null],
      ["Putting", tr(PUTTING, r.putting)],
    ];
    return rows.filter(([, v]) => v != null && v !== "");
  }
  const factsHtml = (e) => courseParams(e).map(([l, v, n]) =>
    `<div class="fact"><div class="label">${esc(l)}</div><div class="value">${esc(v)}</div>${n ? `<div class="note">${esc(n)}</div>` : ""}</div>`).join("");
  const chipsHtml = (e) => courseParams(e).map(([l, v]) => `<span><b>${esc(l)}</b> ${esc(v)}</span>`).join("");

  /* Grande fiche : semaine en cours ou semaine suivante */
  function courseCard(e, kicker) {
    const diff = e.difficulte == null ? null : e.difficulte <= 3 ? "facile" : e.difficulte <= 6 ? "moyen" : "difficile";
    const facts = factsHtml(e) + (diff ? `<div class="fact"><div class="label">Difficulté</div><div class="value">${e.difficulte}/10</div><div class="note">${diff}</div></div>` : "");
    return `<article class="card course">
      <div class="course-head"><span class="kicker">${esc(kicker)}</span><h2>${esc(e.nom)}</h2><p>${esc(e.lieu || "")}${e.debut ? `${e.lieu ? " · " : ""}du ${day(e.debut)} au ${day(e.fin)}` : ""}</p></div>
      <div class="course-body">
        ${facts ? `<div class="facts">${facts}</div>` : ""}
        ${e.description ? `<p>${esc(e.description)}</p>` : ""}
        ${e.styles?.length ? `<div class="tags">${e.styles.map((s) => `<span class="tag">${esc(STYLES[s] ?? s)}</span>`).join("")}</div>` : ""}
        ${e.lien_carte ? `<figure class="scorecard"><a href="${esc(e.lien_carte)}" target="_blank" rel="noopener" title="Ouvrir la carte en grand">
          <img src="${esc(e.lien_carte)}" alt="Carte de score de ${esc(e.nom)} : longueurs par départ, pars et index des trous" loading="lazy" referrerpolicy="no-referrer"></a>
          <figcaption>Carte de score · Simulator Golf Tour · touche l'image pour l'agrandir</figcaption></figure>` : ""}
        ${e.lien_video ? `<div class="actions"><a class="btn" href="${esc(e.lien_video)}" target="_blank" rel="noopener">Voir le survol du parcours</a></div>` : ""}
      </div></article>`;
  }

  function viewCourse(params) {
    const byCat = data.parcours || {};
    const cats = Object.keys(byCat).length ? Object.keys(byCat) : data.categories.map((c) => c.nom);
    const cat = cats.includes(params.cat || state.pcat) ? params.cat || state.pcat : cats[0];
    state.pcat = cat;
    const entries = [...(byCat[cat] || [])];
    const current = entries.filter((e) => e.statut === "en_cours").pop();
    const lastNo = Math.max(0, ...entries.filter((e) => e.statut !== "a_venir").map((e) => e.semaine));
    let next = entries.find((e) => e.statut === "a_venir");
    const chosen = data.parcours_semaine;  // parcours choisi par le capitaine, pas encore créé chez SGT
    if (!next && chosen && chosen.semaine > lastNo) next = { ...chosen, statut: "a_venir", depart: null, reglages: null };
    const history = entries.filter((e) => e.statut === "terminee").sort((a, b) => b.semaine - a.semaine);

    app.innerHTML = `
      <h2>Parcours</h2>
      <p class="sub">Les réglages de la semaine, le parcours à venir et ceux déjà joués. Chaque catégorie a son propre tournoi.</p>
      <div class="toolbar"><div class="chips" role="group" aria-label="Catégorie">${cats.map((c) =>
        `<button type="button" data-pcat="${esc(c)}" aria-pressed="${c === cat}">${esc(c)}</button>`).join("")}</div></div>
      ${current ? `<section><h3>Cette semaine</h3>${courseCard(current, `Semaine WC${current.semaine} · en cours`)}
        <p class="sub" style="margin-top:12px">Joue ton tour sur Simulator Golf Tour avant la fin de la semaine (jusqu'au ${day(current.fin)}) : jusqu'à ${data.regles.tentatives} tentatives, la meilleure compte.</p></section>`
        : `<section><h3>Cette semaine</h3><p class="empty">Aucun tournoi en cours pour les ${esc(cat)}.</p></section>`}
      ${next ? `<section><h3>Semaine prochaine</h3>${courseCard(next, `Semaine WC${next.semaine} · à venir`)}</section>` : ""}
      ${history.length ? `<section><h3>Historique</h3><div class="grid history">${history.map((e) => `
        <article class="card week">
          <header><span class="no">WC${e.semaine}</span><span class="badge">Terminée</span></header>
          <div class="course-name">${esc(e.nom)}</div><div class="dates">${day(e.debut)} au ${day(e.fin)}</div>
          <div class="mini">${chipsHtml(e)}</div>
          ${e.lien_carte ? `<div class="note"><a href="${esc(e.lien_carte)}" target="_blank" rel="noopener">Carte de score</a></div>` : ""}
        </article>`).join("")}</div></section>` : ""}`;
    app.querySelectorAll("[data-pcat]").forEach((b) => b.addEventListener("click", () => { go("parcours", { cat: b.dataset.pcat }); render(); }));
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
    app.innerHTML = `<h2>Semaines</h2><p class="sub">Les meilleurs scores en Stableford de chaque semaine.</p>
      <div class="grid weeks">${weeks.map((w) => {
        const totals = Object.fromEntries(STATS.map(([k]) => [k, w.categories.reduce((s, c) => s + c.stats[k], 0)]));
        return `<article class="card week">
          <header><span class="no">WC${w.numero}</span><span class="badge ${w.statut === "en_cours" ? "live-badge" : ""}">${w.statut === "en_cours" ? "En cours" : "Terminée"}</span></header>
          <div class="course-name">${esc(w.parcours)}</div><div class="dates">${day(w.debut)} au ${day(w.fin)}</div>
          <dl>${w.categories.map((c) => `<dt>${esc(c.categorie)} · ${pl(c.joueurs, "joueur")}</dt>
            <dd>${c.meilleur_net.stableford == null ? "Pas de résultat" :
              `Net ${c.meilleur_net.stableford} (${esc(c.meilleur_net.joueurs.join(", "))}) · Brut ${c.meilleur_brut.stableford} (${esc(c.meilleur_brut.joueurs.join(", "))})`}</dd>`).join("")}</dl>
          <div class="mini">${STATS.map(([k, label]) => `<span><b>${totals[k]}</b> ${label}</span>`).join("")}</div>
        </article>`;
      }).join("")}</div>`;
  }

  /* ---------- Joueurs ---------- */
  function viewPlayers() {
    app.innerHTML = `<h2>Joueurs</h2><p class="sub">Touche un joueur pour voir sa fiche.</p>
      <div class="toolbar"><input class="search" id="pq" type="search" placeholder="Chercher un joueur" aria-label="Chercher un joueur"></div>
      <div class="grid players" id="plist"></div>`;
    const draw = () => {
      const q = $("#pq").value.trim().toLowerCase();
      const list = data.joueurs.filter((j) => j.joueur.toLowerCase().includes(q));
      $("#plist").innerHTML = list.length ? list.map((j) => `<button type="button" class="card pcard" data-player="${esc(j.joueur)}">
        <span><span class="n">${nm(j.joueur)}</span><br><span class="c">${esc(j.categorie)} · hdc ${j.hdc_actuel}</span></span>
        <span class="r">${j.rang_net ? "#" + j.rang_net : "–"}</span></button>`).join("") : '<p class="empty">Aucun joueur.</p>';
      bindPlayers();
    };
    $("#pq").addEventListener("input", draw);
    draw();
  }

  /* ---------- Règles ---------- */
  function viewRules() {
    const r = data.regles;
    app.innerHTML = `<h2>Règles</h2><p class="sub">Comment fonctionne le Winter Challenge.</p>
      <div class="rules">
        <div class="card rule"><h3>Une semaine, un parcours</h3><p>Chaque semaine, un parcours est choisi sur Simulator Golf Tour. Tu joues 9 trous, depuis ton simulateur, quand tu veux pendant la semaine.</p></div>
        <div class="card rule"><h3>${r.tentatives} tentatives, la meilleure compte</h3><p>Tu peux rejouer jusqu'à <strong>${r.tentatives} fois</strong> par semaine. Seule la tentative au meilleur <strong>Stableford net</strong> est retenue, et elle compte pour les classements brut et net.</p></div>
        <div class="card rule"><h3>Les points</h3><p>Sur 9 trous, <strong>18 points Stableford valent 100 points</strong> de classement, et chaque point de plus ou de moins vaut 10 points (minimum 30). Sur 18 trous, la référence est de 36 points.</p></div>
        <div class="card rule"><h3>Le classement final</h3><p>Seuls tes <strong>${r.meilleurs} meilleurs résultats</strong> de la saison comptent. Dans le tableau, ils sont en vert, et le plus petit d'entre eux est en rouge : c'est le premier que tu remplaceras si tu fais mieux.</p></div>
        <div class="card rule"><h3>Le handicap de jeu</h3><p>Il part de la moitié de ton handicap réel. À la fin de chaque semaine, il monte de 1 si tu fais moins de 100 points nets, sinon il baisse d'un point par tranche de 10 points au-dessus de 100. Il ne change jamais entre deux tentatives d'une même semaine.</p></div>
        <div class="card rule"><h3>Les catégories</h3><p>${data.categories.map((c) => `<strong>${esc(c.nom)}</strong>`).join(", ")} : chaque catégorie a son propre classement, en net et en brut.</p></div>
      </div>`;
  }

  /* ---------- Démarrage ---------- */
  const VIEWS = { classement: viewRanking, parcours: viewCourse, semaines: viewWeeks, joueurs: viewPlayers, regles: viewRules };
  function render() {
    const { route, params } = parseHash();
    const name = VIEWS[route] ? route : "classement";
    document.querySelectorAll(".tabs a").forEach((a) => (a.dataset.route === name ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current")));
    VIEWS[name](params);
  }
  window.addEventListener("hashchange", () => { render(); window.scrollTo(0, 0); });

  fetch("donnees/saison.json?v=" + Date.now())
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then((json) => {
      data = json;
      $("#season-label").textContent = data.saison;
      $("#updated").textContent = "Mis à jour le " + stamp(data.genere_le);
      $("#demo-banner").hidden = !data.demo;
      if (!data.semaines.length) { app.innerHTML = '<p class="empty">La saison n\'a pas encore commencé.</p>'; return; }
      render();
    })
    .catch(() => { app.innerHTML = '<p class="empty">Impossible de charger les données pour le moment. Réessaie dans quelques minutes.</p>'; });
})();
