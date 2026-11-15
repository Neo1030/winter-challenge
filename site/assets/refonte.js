/* Winter Challenge · le site (« Trajectoire ») ; l'ancienne version est sous /v1.
   JavaScript sans dépendance. Lit donnees/saison.json, le même fichier que la page télé.
   Écrit pour les navigateurs récents des joueurs : la page télé (lecteur Zebrix) n'utilise pas ce fichier. */
(function () {
  "use strict";

  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const CALME = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const borne = (v, a, b) => Math.min(b, Math.max(a, v));
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  /* ───────── Thème : sombre par défaut, clair au choix (bouton en haut de page, choix gardé dans le navigateur) ─────────
     Les couleurs sont dans refonte.css (:root et :root[data-theme="clair"]) ; ici, seulement ce que le script dessine lui-même. */
  const racine = document.documentElement;
  const TH = { clair: false, vif: "127,212,255", neige: "#fff" };
  let apresTheme = () => {};                                    // ce qu'il faut redessiner quand le thème change
  function lireTheme() {
    const css = getComputedStyle(racine);
    TH.clair = racine.dataset.theme === "clair";
    TH.vif = css.getPropertyValue("--vif").trim() || "127,212,255";
    TH.neige = css.getPropertyValue("--neige").trim() || "#fff";
    const meta = $('meta[name="theme-color"]');
    if (meta) meta.content = css.getPropertyValue("--nuit").trim() || "#00101e";
    const b = $("#theme");
    if (b) { b.setAttribute("aria-pressed", TH.clair); b.setAttribute("aria-label", TH.clair ? "Passer en mode sombre" : "Passer en mode clair"); b.title = b.getAttribute("aria-label"); }
  }
  lireTheme();
  if ($("#theme")) $("#theme").addEventListener("click", () => {
    racine.classList.add("bascule");                            // les couleurs fondent d'un thème à l'autre, le temps de la bascule
    if (TH.clair) delete racine.dataset.theme; else racine.dataset.theme = "clair";
    try { localStorage.setItem("wc_theme", TH.clair ? "sombre" : "clair"); } catch (e) { /* navigation privée : le choix vaut pour cette visite */ }
    lireTheme();
    apresTheme();
    setTimeout(() => racine.classList.remove("bascule"), 600);
  });

  /* 1'500 et 264,9 : apostrophe pour les milliers, virgule pour les décimales */
  function nb(n, d) {
    const p = Math.abs(n).toFixed(d || 0).split(".");
    p[0] = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, "'");
    return (n < 0 ? "−" : "") + p.join(",");
  }
  const dateCH = (iso) => iso.slice(8, 10) + "." + iso.slice(5, 7) + "." + iso.slice(0, 4);

  /* brutes : le fichier de données tel quel ; comps : les compétitions (le Winter Challenge à la racine du fichier, puis les
     autres : Short Game…) ; data : la compétition affichée, avec les réglages communs (règles, démonstration…) */
  let brutes = null, comps = [], data = null;
  const etat = { comp: "wc", mode: "net", cat: null, q: "", sem: null, pcat: "", pq: "" };
  /* les mots de la compétition : des semaines pour le Winter Challenge, des mois pour le Short Game */
  const unite = () => {
    const u = data.prefixe === "WC"
      ? { Cap: "Semaine", cap: "semaine", pluriel: "semaines", caps: "Semaines", court: "Sem.", ce: "Cette semaine", prochain: "Semaine prochaine",
          fin: "de la semaine", joues: ["jouée", "jouées"], aucune: "Aucune semaine jouée pour le moment." }
      : { Cap: "Mois", cap: "mois", pluriel: "mois", caps: "Mois", court: "Mois", ce: "Ce mois", prochain: "Mois prochain",
          fin: "du mois", joues: ["joué", "joués"], aucune: "Aucun mois joué pour le moment." };
    u.compte = (n) => `${n} ${n > 1 ? u.pluriel : u.cap}`;
    return u;
  };
  const P = () => data.prefixe;
  /* Short Game : brut seulement, handicap de 0 pour tous. Jamais de classement net ni de handicap à afficher. */
  const brutSeul = () => !!data.brut_seul;
  const mode = () => (brutSeul() ? "brut" : etat.mode);
  const meilleursN = () => data.meilleurs || data.regles.meilleurs; // résultats comptés : 8 au Winter Challenge, 5 au Short Game (tous)
  const categorie = () => data.categories.find((c) => c.nom === etat.cat) || data.categories[0];
  const semaineCourante = () => data.semaines.find((s) => s.statut === "en_cours") || data.semaines[data.semaines.length - 1];
  /* un grand titre : ses lettres montent l'une après l'autre quand il arrive à l'écran */
  const titre = (el, txt) => {
    let n = 0;
    el.setAttribute("aria-label", txt);
    el.innerHTML = '<span class="cache" aria-hidden="true">' + String(txt).trim().split(/\s+/).map((mot) =>
      '<span class="mot">' + Array.from(mot).map((c) => `<i style="--l:${n++}">${esc(c)}</i>`).join("") + "</span>").join(" ") + "</span>";
  };
  const horodatage = (iso) => (iso ? dateCH(iso) + " à " + iso.slice(11, 16) : "");
  /* écart au par, comme en stroke play : +5, +1, 0, −2 */
  const signe = (n) => (n > 0 ? "+" + n : n < 0 ? "−" + -n : "0");
  /* les meilleurs d'une semaine (ceux qui ont le plus de points Stableford), avec leur score en stroke play, lu dans leurs parties */
  function meilleurs(m, numero, cle) {
    if (!m || !m.joueurs || !m.joueurs.length) return "";
    return m.joueurs.map((nom) => {
      const j = data.joueurs.find((x) => x.joueur === nom), w = j && j.semaines.find((s) => s.semaine === numero);
      return `${esc(nom)} <b>${w && w[cle] != null && w.par != null ? signe(w[cle] - w.par) : m.stableford + " pts Stableford"}</b>`;
    }).join(", ");
  }
  const fait = (lib, val, note) => `<div><dt>${lib}</dt><dd>${val}</dd>${note ? `<small>${note}</small>` : ""}</div>`;
  function choisirComp(id) {
    const c = comps.find((x) => x.id === id) || comps[0];
    etat.comp = c.id;
    data = Object.assign({}, brutes, c);
    if (!data.categories.some((x) => x.nom === etat.cat)) etat.cat = data.categories[0] ? data.categories[0].nom : null;
    etat.sem = null; etat.q = ""; etat.pq = ""; etat.pcat = "";
  }

  /* ───────── Apparitions au défilement et chiffres qui montent ───────── */
  const rappels = new WeakMap();
  const ioVue = new IntersectionObserver((entrees) => {
    entrees.forEach((e) => {
      if (!e.isIntersecting) return;
      e.target.classList.add("in");
      e.target.dataset.vu = "1";
      const f = rappels.get(e.target);
      if (f) f();
      ioVue.unobserve(e.target);
    });
  }, { threshold: 0.18, rootMargin: "0px 0px -6% 0px" });
  const voir = (el, rappel) => { if (rappel) rappels.set(el, rappel); ioVue.observe(el); };

  const ioNombre = new IntersectionObserver((entrees) => {
    entrees.forEach((e) => {
      if (!e.isIntersecting) return;
      ioNombre.unobserve(e.target);
      compter(e.target);
    });
  }, { threshold: 0.4 });
  function compter(el) {
    const cible = +el.dataset.n, d = +el.dataset.d || 0;
    if (CALME) { el.textContent = nb(cible, d); return; }
    const debut = performance.now(), duree = 1500;
    (function pas(t) {
      const k = Math.min(1, (t - debut) / duree);
      el.textContent = nb(cible * (1 - Math.pow(2, -10 * k)) / (1 - Math.pow(2, -10)), d);
      if (k < 1) requestAnimationFrame(pas);
    })(debut);
  }
  const nombres = (racine) => $$("[data-n]", racine).forEach((el) => { el.textContent = nb(0, +el.dataset.d || 0); ioNombre.observe(el); });

  /* ───────── Ciel de l'ouverture : courbes de niveau qui respirent, neige, poudre à l'impact ───────── */
  function initCiel() {
    const hero = $(".hero"), cr = $("#relief"), cn = $("#neige");
    const xr = cr.getContext("2d"), xn = cn.getContext("2d");
    let W = 0, H = 0, flocons = [], poudre = [], actif = true, dernier = performance.now(), dernierRelief = -1e9, souffle = 0;

    function taille() {
      W = hero.clientWidth; H = hero.clientHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      [[cr, xr], [cn, xn]].forEach(([c, x]) => { c.width = W * dpr; c.height = H * dpr; x.setTransform(dpr, 0, 0, dpr, 0, 0); });
      const n = borne(Math.round(W * H / 13000), 40, 150);
      flocons = Array.from({ length: n }, () => flocon(true));
      dernierRelief = -1e9;
    }
    function flocon(partout) {
      const z = Math.random();
      return { x: Math.random() * W, y: partout ? Math.random() * H : -8, z, r: 0.6 + z * 1.9, v: 14 + z * 46, ph: Math.random() * 6.28 };
    }

    const champ = (u, v, t) =>
      Math.sin(u * 1.3 + t * 0.21) * Math.cos(v * 1.7 - t * 0.17) + 0.6 * Math.sin((u + v) * 2.1 + t * 0.13) +
      0.4 * Math.cos(u * 2.9 - v * 1.3 - t * 0.19) + 0.5 * Math.sin(Math.hypot(u - 2.2, v - 0.7) * 3 - t * 0.1);

    /* courbes de niveau par « marching squares » : la carte d'un green qui bouge très lentement */
    function relief(t) {
      const pas = W < 700 ? 22 : 28, cols = Math.ceil(W / pas), ligs = Math.ceil(H / pas);
      const g = new Float32Array((cols + 1) * (ligs + 1));
      for (let j = 0; j <= ligs; j++) for (let i = 0; i <= cols; i++) g[j * (cols + 1) + i] = champ(i * pas / 420, j * pas / 420, t);
      xr.clearRect(0, 0, W, H);
      xr.lineWidth = 1;
      const niveaux = [-1.5, -1.2, -0.9, -0.6, -0.3, 0, 0.3, 0.6, 0.9, 1.2, 1.5];
      niveaux.forEach((nv, k) => {
        xr.beginPath();
        for (let j = 0; j < ligs; j++) {
          for (let i = 0; i < cols; i++) {
            const a = g[j * (cols + 1) + i], b = g[j * (cols + 1) + i + 1], c = g[(j + 1) * (cols + 1) + i + 1], d = g[(j + 1) * (cols + 1) + i];
            const idx = (a > nv ? 8 : 0) | (b > nv ? 4 : 0) | (c > nv ? 2 : 0) | (d > nv ? 1 : 0);
            if (idx === 0 || idx === 15) continue;
            const x = i * pas, y = j * pas;
            const haut = [x + pas * (nv - a) / (b - a), y], droite = [x + pas, y + pas * (nv - b) / (c - b)];
            const bas = [x + pas * (nv - d) / (c - d), y + pas], gauche = [x, y + pas * (nv - a) / (d - a)];
            const seg = (p, q) => { xr.moveTo(p[0], p[1]); xr.lineTo(q[0], q[1]); };
            switch (idx) {
              case 1: case 14: seg(gauche, bas); break;
              case 2: case 13: seg(bas, droite); break;
              case 3: case 12: seg(gauche, droite); break;
              case 4: case 11: seg(haut, droite); break;
              case 6: case 9: seg(haut, bas); break;
              case 7: case 8: seg(haut, gauche); break;
              case 5: seg(haut, gauche); seg(bas, droite); break;
              case 10: seg(haut, droite); seg(gauche, bas); break;
            }
          }
        }
        xr.strokeStyle = "rgba(" + TH.vif + (k % 3 === 0 ? (TH.clair ? ",.34)" : ",.26)") : (TH.clair ? ",.17)" : ",.12)"));
        xr.stroke();
      });
    }

    function neige(dt, t) {
      xn.clearRect(0, 0, W, H);
      for (const f of flocons) {
        f.y += f.v * dt - souffle * (0.25 + f.z) * 0.55;
        if (f.y < -10) f.y = H + 6;
        f.x += (Math.sin(t * 0.6 + f.ph) * 10 + 6) * dt * (0.4 + f.z);
        if (f.y > H + 8 || f.x > W + 8) Object.assign(f, flocon(false), f.x > W + 8 ? { x: -6, y: Math.random() * H } : {});
        xn.globalAlpha = 0.18 + f.z * 0.6;
        xn.beginPath(); xn.arc(f.x, f.y, f.r, 0, 6.2832); xn.fillStyle = TH.neige; xn.fill();
      }
      poudre = poudre.filter((p) => p.vie > 0);
      for (const p of poudre) {
        p.vy += 420 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vie -= dt * 1.5;
        xn.globalAlpha = Math.max(0, p.vie);
        xn.beginPath(); xn.arc(p.x, p.y, p.r, 0, 6.2832); xn.fillStyle = TH.neige; xn.fill();
      }
      xn.globalAlpha = 1;
    }

    function boucle(now) {
      requestAnimationFrame(boucle);
      const dt = Math.min(0.05, (now - dernier) / 1000);
      dernier = now;
      if (!actif || document.hidden) return;
      if (now - dernierRelief > 45) { relief(now / 1000); dernierRelief = now; }
      neige(dt, now / 1000);
    }

    taille();
    new IntersectionObserver((e) => { actif = e[0].isIntersecting; }).observe(hero);
    if (CALME) { relief(4); neige(0, 0); } else requestAnimationFrame(boucle);

    return {
      taille: () => { taille(); if (CALME) { relief(4); neige(0, 0); } },
      vent(v) { souffle = v; },
      bouffee(x, y) {
        if (CALME) return;
        for (let i = 0; i < 22; i++) {
          const a = -Math.PI * (0.15 + Math.random() * 0.7), v = 60 + Math.random() * 170;
          poudre.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: 0.8 + Math.random() * 2, vie: 0.7 + Math.random() * 0.5 });
        }
      },
    };
  }

  /* ───────── Le coup d'ouverture : le plus long drive de la saison, tracé comme sur le simulateur ───────── */
  function initCoup(recInitial, ciel) {
    const hero = $(".hero"), svg = $("#coup"), bloc = $("#record"), num = $("#record-m");
    /* part : part de la trajectoire parcourue (0 = au départ, à gauche ; 1 = à l'arrivée, à droite). C'est le défilement qui la fait avancer. */
    let rec = recInitial, geo = null, part = CALME ? 1 : 0, arrivee = false, annoncee = CALME, raf = 0;

    function construire() {
      const W = hero.clientWidth, H = hero.clientHeight;
      const sol = H - (W < 760 ? 204 : 172);
      const x0 = Math.max(26, W * 0.07), x1 = W - Math.max(46, W * 0.1), dx = x1 - x0;
      const h = Math.min(sol * 0.5, dx * 0.34, 400), y = sol - 5;
      /* Drive (Winter Challenge) : la règle compte les mètres parcourus, la balle va jusqu'au trou.
         Approche (Short Game) : la règle compte les mètres qui restent jusqu'au drapeau, la balle s'arrête à la distance du record. */
      const approche = rec.mode === "approche", total = approche ? rec.portee : rec.m;
      const xb = approche ? x1 - dx * borne(rec.m / rec.portee, 0, 0.5) : x1, db = xb - x0;
      const d = `M${x0} ${y} C${x0 + db * 0.38} ${y - h * 1.32} ${x0 + db * 0.8} ${y - h * 1.3} ${xb} ${y}`;
      const petit = total > 100 ? 10 : 2, gros = total > 100 ? 50 : 10;
      let tics = "";
      for (let m = 0; m <= total; m += petit) {
        const x = x0 + dx * m / total, g = m % gros === 0, lu = approche ? total - m : m;
        tics += `<line class="tic${g ? " grand" : ""}" x1="${x}" y1="${sol}" x2="${x}" y2="${sol + (g ? 11 : 5)}"/>`;
        if (g && m > 0 && lu > 0) tics += `<text x="${x}" y="${sol + 30}">${lu}${m + gros > total || (approche && lu === gros) ? " m" : ""}</text>`;
      }
      const xf = approche ? x1 : x1 + 13;
      svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
      svg.innerHTML =
        `<defs><linearGradient id="g-sol" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:rgb(var(--encre))" stop-opacity=".1"/><stop offset="1" style="stop-color:rgb(var(--encre))" stop-opacity="0"/></linearGradient>` +
        `<clipPath id="coup-clip"><rect x="0" y="0" width="${annoncee ? W : 0}" height="${H}"/></clipPath></defs>` +
        `<rect class="sol" x="0" y="${sol}" width="${W}" height="${H - sol}"/><line class="horizon" x1="0" y1="${sol}" x2="${W}" y2="${sol}"/>${tics}` +
        `<path class="pointille" clip-path="url(#coup-clip)" d="${d}"/><path class="halo" d="${d}"/><path class="trace" d="${d}"/><path class="tete" d="${d}"/>` +
        `<ellipse class="trou-coup" cx="${x1}" cy="${sol + 1.5}" rx="11" ry="4.5"/>` +
        `<line class="mat" x1="${xf}" y1="${sol}" x2="${xf}" y2="${sol - 46}"/><path class="fanion" d="M${xf} ${sol - 46}l21 7-21 7Z"/>` +
        `<circle class="onde" cx="${xb}" cy="${sol}" r="30"/><circle class="balle" r="5" cx="${x0}" cy="${y}"/>`;
      const trace = $(".trace", svg), L = trace.getTotalLength();
      geo = { W, x0, xb, db, sol, y, L, trace, halo: $(".halo", svg), tete: $(".tete", svg), balle: $(".balle", svg), clip: $("#coup-clip rect", svg), seg: Math.min(110, L * 0.14) };
      position(part);
    }

    /* place la balle, trace sa courbe jusqu'à elle, fait tourner le compteur ; à l'arrivée : fanion, poudre de neige, nom du record */
    function position(p) {
      const g = geo, l = g.L * p, pt = g.trace.getPointAtLength(l), f = borne((pt.x - g.x0) / g.db, 0, 1);
      g.trace.style.strokeDasharray = g.halo.style.strokeDasharray = g.L;
      g.trace.style.strokeDashoffset = g.halo.style.strokeDashoffset = g.L - l;
      g.tete.style.strokeDasharray = g.seg + " " + g.L * 2;
      g.tete.style.strokeDashoffset = g.seg - l;
      g.tete.style.opacity = p > 0.002 && p < 0.998 ? 1 : 0;
      g.balle.setAttribute("cx", pt.x); g.balle.setAttribute("cy", pt.y);
      num.textContent = nb(rec.mode === "approche" ? rec.portee - (rec.portee - rec.m) * f : rec.m * f, rec.dec);
      const la = p >= 0.999;
      if (la !== arrivee) {
        arrivee = la;
        svg.classList.toggle("pose", la); bloc.classList.toggle("pose", la);
        if (la) ciel.bouffee(g.xb, g.sol);
      }
    }

    /* appelé à chaque image par le défilement : la balle rejoint en douceur la position demandée */
    function avancer(cible) {
      if (!geo) return false;
      const ecart = cible - part;
      if (!ecart) return false;
      part = Math.abs(ecart) < 0.003 ? cible : part + ecart * 0.2;
      position(part);
      return part !== cible;
    }

    /* à l'ouverture de la page : la trajectoire à venir se dessine en pointillé, de la balle jusqu'à l'arrivée */
    function annoncer() {
      if (annoncee || !geo) return;
      annoncee = true;
      const debut = performance.now(), duree = 1700;
      (function pas(now) {
        const t = borne((now - debut) / duree, 0, 1);
        geo.clip.setAttribute("width", geo.x0 + (geo.W - geo.x0) * (1 - Math.pow(1 - t, 3)));
        if (t < 1) raf = requestAnimationFrame(pas);
      })(debut);
    }

    /* le record affiché : son texte, et s'il y en a un */
    function etiquette() {
      $("#record-l").innerHTML = rec.texte || "";
      bloc.hidden = !!rec.vide;
    }
    /* changement de compétition : un autre record, donc un autre coup */
    function changer(nouveau) {
      cancelAnimationFrame(raf);
      rec = nouveau;
      etiquette();
      construire();
    }

    etiquette();
    construire();
    return { construire: () => { cancelAnimationFrame(raf); construire(); }, avancer, annoncer, changer, estArrivee: () => arrivee, depart: () => ({ x: geo.xb, y: geo.y }), partir(v) { svg.classList.toggle("parti", v); } };
  }

  /* Le record du haut de page. Winter Challenge : le plus long drive de la saison. Short Game (petit jeu, sans
     drive) : le closest to the pin de la saison ; à défaut, le plus long total de putts rentrés. */
  function recordPour(c) {
    let m = null;
    const chercher = (cle, mieux) => c.categories.forEach((cat) => Object.keys(cat.stats || {}).forEach((w) => {
      const s = cat.stats[w][cle];
      if (s && s.valeur != null && (!m || mieux(s.valeur, m.m))) m = { m: s.valeur, joueurs: s.joueurs || [], semaine: w, cat: cat.nom, trou: s.trou };
    }));
    const noms = () => "<b>" + m.joueurs.map(esc).join(", ") + "</b>";
    if (c.brut_seul) {
      chercher("ctp", (a, b) => a < b);
      if (m) return Object.assign(m, { mode: "approche", portee: 40, dec: 2, texte: `${noms()} · closest to the pin de la saison · ${esc(c.prefixe)}${m.semaine}${m.trou ? ", trou " + m.trou : ""}` });
      chercher("putts_faits", (a, b) => a > b);
      if (m) return Object.assign(m, { mode: "drive", dec: 2, texte: `${noms()} · plus long total de putts rentrés de la saison · ${esc(c.prefixe)}${m.semaine}` });
      return { vide: true, m: 40, mode: "drive", dec: 0 };
    }
    chercher("drive", (a, b) => a > b);
    return m ? Object.assign(m, { mode: "drive", dec: 1, texte: `${noms()} · plus long drive de la saison · ${esc(c.prefixe)}${m.semaine}, ${esc(m.cat)}` }) : { vide: true, m: 250, mode: "drive", dec: 0 };
  }

  /* ───────── Bandeau défilant ───────── */
  function bandeau(sem) {
    if (!sem) { $("#bandeau").innerHTML = ""; return; }
    const somme = (k) => sem.categories.reduce((s, c) => s + ((c.stats && c.stats[k]) || 0), 0), n = sem.categories.reduce((s, c) => s + c.joueurs, 0);
    const morceaux = [`<b>${P()}${sem.numero}</b> ${esc(sem.parcours)}`, `<b>${n}</b> joueur${n > 1 ? "s" : ""} ${unite().ce.toLowerCase()}`];
    sem.categories.forEach((c) => {
      const m = brutSeul() ? c.meilleur_brut : c.meilleur_net;
      if (m && m.joueurs && m.joueurs.length) morceaux.push(`${esc(c.categorie)} · meilleur ${brutSeul() ? "brut" : "net"} ${meilleurs(m, sem.numero, brutSeul() ? "coups_brut" : "coups_net")}`);
    });
    morceaux.push(`<b>${somme("birdies")}</b> birdies`, `<b>${somme("eagles")}</b> eagles`);
    const html = morceaux.map((m) => `<span>${m}</span>`).join("");
    $("#bandeau").innerHTML = html + html + html + html;
  }

  /* ───────── 01 · Le parcours : cette semaine (ou ce mois), la suite, et ceux déjà joués ───────── */
  /* Les réglages, comme sur le site actuel : les termes techniques de golf restent en anglais, comme sur SGT */
  const cle = (s) => String(s == null ? "" : s).toLowerCase().replace(/[^a-z0-9]/g, "");
  const trad = (table, v) => (v == null ? null : table[cle(v)] || String(v));
  const FERMETE = { soft: "Soft", medium: "Medium", middle: "Medium", firm: "Firm", hard: "Hard" };
  const DEPARTS = { par3: ["Par 3", "#35abe2"], white: ["Blanc", "#f4f7fa"], yellow: ["Jaune", "#ffd23f"], blue: ["Bleu", "#3b8eea"], black: ["Noir", "#1c232b"], red: ["Rouge", "#e5484d"],
    gold: ["Or", "#d4a72c"], green: ["Vert", "#3fb27f"], orange: ["Orange", "#f08c2e"], silver: ["Argent", "#b8c2cc"] };
  const VENTS = { nowind: "No wind", calm: "Calm", breezy: "Breezy", gusty: "Gusty", windy: "Windy" };
  const JOURS = { monday: "lundi", tuesday: "mardi", wednesday: "mercredi", thursday: "jeudi", friday: "vendredi", saturday: "samedi", sunday: "dimanche" };
  const PUTTING = { normal: "Normal", nogimmes: "Sans gimmie", nogimmies: "Sans gimmie" };
  const NEUF = { Front: "trous 1 à 9", Back: "trous 10 à 18", All: "les 18 trous" };
  const metres = (v) => { // les distances de SGT sont en pieds : on les affiche en mètres
    const m = /^(\d+(?:\.\d+)?)\s*(?:feet|ft)$/i.exec(String(v == null ? "" : v).trim());
    return m ? nb(Number(m[1]) * 0.3048, 1) + " m" : v;
  };
  const periode = (e) => (!e.fin || e.fin <= e.debut ? "le " + dateCH(e.debut) : "du " + dateCH(e.debut) + " au " + dateCH(e.fin));
  const nomDepart = (n) => (DEPARTS[cle(n)] ? DEPARTS[cle(n)][0] : n);
  const pastilleDepart = (n) => (n ? `<i class="tee" style="--c:${DEPARTS[cle(n)] ? DEPARTS[cle(n)][1] : "#8fa8bb"}"></i>${esc(nomDepart(n))}` : "–");

  /* parcours en cours (d'après les dates de SGT), suivant (un seul, jamais plus loin) et déjà joués */
  function etatParcours() {
    const entrees = Array.isArray(data.parcours) ? data.parcours.slice() : [];
    const courant = entrees.filter((e) => e.statut === "en_cours").pop();
    let suivant = entrees.find((e) => e.statut === "a_venir");
    const dernier = Math.max(0, ...entrees.filter((e) => e.statut !== "a_venir").map((e) => e.semaine));
    const choisi = data.parcours_semaine; // le parcours choisi par le capitaine : lieu, description, styles, vidéo
    if (choisi && choisi.semaine === dernier + 1) {
      if (!suivant) suivant = Object.assign({}, choisi, { statut: "a_venir" });
      else if (suivant.semaine === choisi.semaine) {
        const fusion = Object.assign({}, choisi);
        Object.keys(suivant).forEach((k) => { if (suivant[k] != null) fusion[k] = suivant[k]; });
        suivant = fusion;
      }
    }
    return { courant, suivant, passes: entrees.filter((e) => e.statut === "terminee").sort((a, b) => b.semaine - a.semaine) };
  }

  /* La fiche d'un parcours : départ, stimp et gimmies par catégorie, puis tous les autres réglages, le texte, la carte de score, la vidéo */
  /* le cercle des gimmies autour du trou : d'autant plus grand que la distance donnée est longue */
  const gimmie = (v) => {
    const m = /^(\d+(?:\.\d+)?)/.exec(String(v).trim());
    return m ? `<svg class="gim-v" viewBox="0 0 36 36" aria-hidden="true"><circle class="g" cx="18" cy="18" r="${borne(4 + +m[1], 5, 16)}" pathLength="100"/><circle class="h" cx="18" cy="18" r="2.4"/></svg>` : "";
  };

  function ficheParcours(e, tuilesEnPlus, sansCarte) {
    const r = e.reglages || {}, per = e.par_categorie;
    const lignes = per && per.length
      ? per.map((p) => ({ nom: p.categorie, dep: p.depart, pente: p.pente, cr: p.cotation, stimp: p.stimp != null ? p.stimp : r.stimp, gim: p.gimmies || r.gimmies }))
      : e.depart || r.depart || r.stimp != null || r.gimmies ? [{ nom: "Toutes", dep: e.depart || r.depart, pente: r.pente, cr: r.cotation, stimp: r.stimp, gim: r.gimmies }] : [];
    let h = "";
    if (lignes.length) h += `<div class="rc" role="table" aria-label="Départ, stimp et gimmies par catégorie">
      <div class="rc-tete" role="row"><span role="columnheader">Catégorie</span><span role="columnheader">Départ</span><span role="columnheader">Stimp</span><span role="columnheader">Gimmies</span></div>
      ${lignes.map((l) => `<div class="rc-ligne sc" data-dy="22" role="row"><b role="cell">${esc(l.nom)}</b>
        <span role="cell" class="rc-dep">${pastilleDepart(l.dep)}${l.pente ? `<small>slope ${esc(l.pente)} · CR ${l.cr != null ? nb(l.cr, 1) : "–"}</small>` : ""}</span>
        <span role="cell" class="rc-stimp">${l.stimp != null ? `<i class="stimp-v" style="--st:${borne(+l.stimp || 0, 0, 14)}"><i></i></i>${esc(l.stimp)}` : "–"}</span>
        <span role="cell" class="rc-gim">${l.gim ? gimmie(l.gim) + esc(metres(l.gim)) : "–"}</span></div>`).join("")}</div>`;

    const diff = e.difficulte == null ? null : e.difficulte <= 3 ? "facile" : e.difficulte <= 6 ? "moyen" : "difficile";
    const faits = [
      ["On joue", e.neuf ? esc(NEUF[e.neuf] || e.neuf) : null, e.par ? "par " + e.par : null],
      ["Longueur", e.longueur_jaune_m ? nb(e.longueur_jaune_m) + " m" : null, "18 trous, départ jaune"],
      ["Greens", trad(FERMETE, r.greens)], ["Fairways", trad(FERMETE, r.fairways)],
      ["Vent", r.vent ? trad(VENTS, r.vent) : e.vent ? trad(VENTS, e.vent) : null, r.vent ? null : e.vent ? "conseillé" : null],
      ["Drapeaux", r.drapeaux ? trad(JOURS, r.drapeaux) : null], ["Putting", trad(PUTTING, r.putting)],
      ["Difficulté", diff ? nb(e.difficulte, Number.isInteger(e.difficulte) ? 0 : 1) + "/10" : null, diff],
    ].map((f) => [f[0], f[1] == null ? null : f[0] === "On joue" ? f[1] : esc(f[1]), f[2]]).concat(tuilesEnPlus || []).filter((f) => f[1] != null && f[1] !== "");
    /* une petite scène par réglage : les neuf trous joués, le rebond selon la fermeté, le vent, le jour des drapeaux, la difficulté */
    const SEMAINE = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"], vent = r.vent || e.vent;
    const visuels = {
      "On joue": e.neuf ? '<span class="vis trous-v">' + Array.from({ length: 18 }, (_, i) => `<i class="${e.neuf === "All" || (e.neuf === "Front") === (i < 9) ? "on" : ""}" style="--k:${i}"></i>`).join("") + "</span>" : "",
      Greens: r.greens ? `<span class="vis rebond-v f-${cle(r.greens)}"><i></i></span>` : "",
      Fairways: r.fairways ? `<span class="vis rebond-v f-${cle(r.fairways)}"><i></i></span>` : "",
      Vent: vent ? `<span class="vis vent-v v-${cle(vent)}"><i></i><i></i><i></i></span>` : "",
      Drapeaux: r.drapeaux ? '<span class="vis jours-v">' + SEMAINE.map((j, i) => `<i class="${cle(r.drapeaux) === j ? "on" : ""}">${"LMMJVSD"[i]}</i>`).join("") + "</span>" : "",
      "Difficulté": diff ? `<span class="vis diff-v"><i style="--p:${borne(e.difficulte * 10, 0, 100)}%"></i></span>` : "",
    };
    if (faits.length) h += `<dl class="faits">${faits.map((f) => `<div class="fait sc"><dt>${f[0]}</dt><dd>${f[1]}</dd>${f[2] ? `<small>${esc(f[2])}</small>` : ""}${visuels[f[0]] || ""}</div>`).join("")}</dl>`;

    if (e.description) h += `<p class="fiche-desc">${esc(e.description)}</p>`;
    if (e.styles && e.styles.length) h += `<p class="etiquettes">${e.styles.map((s) => `<span>${esc(s)}</span>`).join("")}</p>`;
    if (e.lien_carte && !sansCarte) h += `<figure class="carte-score"><a href="${esc(e.lien_carte)}" target="_blank" rel="noopener" title="Ouvrir la carte en grand">
      <img src="${esc(e.lien_carte)}" alt="Carte de score de ${esc(e.nom)} : longueurs par départ, pars et index des trous" loading="lazy" referrerpolicy="no-referrer"></a>
      <figcaption>Carte de score · Simulator Golf Tour · touche l'image pour l'agrandir</figcaption></figure>`;
    if (e.lien_video) h += `<p><a class="bouton" href="${esc(e.lien_video)}" target="_blank" rel="noopener">Voir le survol du parcours</a></p>`;
    return h;
  }

  /* résumé en une ligne, pour les parcours déjà joués */
  function pucesParcours(e) {
    const r = e.reglages || {}, per = e.par_categorie, t = [];
    if (per && per.some((p) => p.depart)) t.push(["Départ", per.map((p) => p.categorie + " " + (p.depart ? nomDepart(p.depart) : "–")).join(", ")]);
    else if (e.depart) t.push(["Départ", nomDepart(e.depart)]);
    if (r.stimp != null) t.push(["Stimp", r.stimp]);
    if (r.gimmies) t.push(["Gimmies", metres(r.gimmies)]);
    if (e.neuf) t.push(["On joue", (NEUF[e.neuf] || e.neuf) + (e.par ? ", par " + e.par : "")]);
    [["Greens", trad(FERMETE, r.greens)], ["Fairways", trad(FERMETE, r.fairways)], ["Vent", trad(VENTS, r.vent)], ["Drapeaux", trad(JOURS, r.drapeaux)], ["Putting", trad(PUTTING, r.putting)]]
      .forEach((f) => { if (f[1] != null) t.push(f); });
    return t.map((f) => `<span><b>${f[0]}</b> ${esc(f[1])}</span>`).join("");
  }

  function parcoursVue(sem) {
    const u = unite(), etatP = etatParcours();
    const p = etatP.courant || (sem && sem.statut === "en_cours" ? { nom: sem.parcours, debut: sem.debut, fin: sem.fin, semaine: sem.numero } : null);
    $("#parcours-repere").textContent = u.ce;
    $("#parcours-intro").textContent = `Les réglages ${u.fin}, le parcours à venir et ceux déjà joués. C'est le même parcours pour toutes les catégories ; le départ, les gimmies et le stimp peuvent changer selon la catégorie.`;
    $("#putt").hidden = $("#sem-note").hidden = !p;
    if (!p) {
      $("#sem-badge").textContent = "";
      titre($("#t-semaine"), "Pas de tournoi en cours");
      $("#sem-dates").textContent = `Aucun tournoi en cours pour le ${data.nom}.`;
      $("#sem-fiche").innerHTML = "";
    } else {
      $("#sem-badge").textContent = P() + p.semaine + " · en cours";
      titre($("#t-semaine"), p.nom);
      $("#sem-dates").textContent = (p.lieu ? p.lieu + " · " : "") + periode(p) + ".";

      /* le putt de la semaine (ou du mois) : la balle avance d'un jour par jour, le dernier jour elle tombe dans le trou */
      const jour0 = new Date(p.debut + "T00:00"), duree = Math.max(1, Math.round((new Date((p.fin || p.debut) + "T00:00") - jour0) / 864e5) + 1);
      let jour = Math.floor((new Date() - jour0) / 864e5) + 1;
      if (jour < 1 || jour > duree) jour = brutes.demo ? Math.max(1, Math.round(duree * 0.55)) : borne(jour, 1, duree); // hors de la période : premier ou dernier jour (au milieu avec les données de démonstration)
      const lettres = ["D", "L", "M", "M", "J", "V", "S"];
      $("#putt-jours").innerHTML = duree > 10 ? "" : Array.from({ length: duree }, (_, i) => `<li class="${i + 1 === jour ? "auj" : ""}" style="--kp:${(duree > 1 ? i / (duree - 1) * 100 : 100).toFixed(1)}">${lettres[(jour0.getDay() + i) % 7]}</li>`).join("");
      $("#putt").style.setProperty("--p", (duree > 1 ? (jour - 1) / (duree - 1) * 100 : 100).toFixed(1));
      $("#putt-txt").innerHTML = jour >= duree ? "<b>Dernier jour</b> pour jouer." : `<b>Jour ${jour} sur ${duree}</b> · encore ${duree - jour} jour${duree - jour > 1 ? "s" : ""} pour jouer.`;
      $("#sem-note").textContent = `Joue ton tour sur Simulator Golf Tour avant la fin ${u.fin} (jusqu'au ${dateCH(p.fin || p.debut)}) : tu n'as droit qu'à un seul tour.`;

      const joueurs = sem && sem.numero === p.semaine ? sem.categories.reduce((s, c) => s + c.joueurs, 0) : null;
      $("#sem-fiche").innerHTML = ficheParcours(p, joueurs == null ? [] : [["Ont déjà joué", `<span data-n="${joueurs}"></span>`, "joueur" + (joueurs > 1 ? "s" : "") + " " + u.ce.toLowerCase()]], true); // sans la carte de score (demande de Mike, 15.11.2026)
      nombres($("#sem-fiche"));
    }

    const s = etatP.suivant, bloc = $("#prochain");
    bloc.hidden = !s;
    if (s) bloc.innerHTML = `<p class="etq">${u.prochain} · ${P()}${s.semaine} · à venir</p><h3>${esc(s.nom)}</h3>
      <p class="lieu">${[s.lieu, s.debut ? periode(s) : ""].filter(Boolean).map(esc).join(" · ")}</p>${ficheParcours(s, null, true)}`; // sans la carte de score (demande de Mike, 15.11.2026)

    const histo = $("#historique");
    histo.hidden = !etatP.passes.length;
    histo.innerHTML = !etatP.passes.length ? "" : `<h3 class="histo-titre">Historique <small>${etatP.passes.length} parcours déjà joué${etatP.passes.length > 1 ? "s" : ""}, du plus récent au plus ancien</small></h3>
      <div class="hz" id="hz" tabindex="0" aria-label="Parcours déjà joués, à faire défiler"><div class="hz-piste">${etatP.passes.map((e) => `
        <article class="hc"><header><b>${P()}${e.semaine}</b><span>Terminée</span></header>
          <h4>${esc(e.nom)}</h4><p class="dates">${periode(e)}</p><p class="puces">${pucesParcours(e)}</p>
          ${e.lien_carte ? `<p><a href="${esc(e.lien_carte)}" target="_blank" rel="noopener">Carte de score</a></p>` : ""}
        </article>`).join("")}</div></div>`;

    /* si l'image de la carte ne charge pas, on garde un lien pour l'ouvrir sur SGT */
    $$(".carte-score img").forEach((img) => img.addEventListener("error", () => {
      const a = img.closest("a");
      img.closest("figure").innerHTML = `<a class="bouton" href="${esc(a.href)}" target="_blank" rel="noopener">Voir la carte de score</a>`;
    }));
  }

  /* ───────── 02 · Classement ───────── */
  const classement = () => categorie().classement[mode()];
  const nbSemaines = () => data.semaines.length;
  /* les semaines, la plus récente d'abord, comme sur le site actuel */
  const semainesDesc = () => data.semaines.map((w) => w.numero).sort((a, b) => b - a);

  function curseur(seg) {
    const b = $('button[aria-pressed="true"]', seg), c = $(".curseur", seg);
    if (b && c) { c.style.left = b.offsetLeft + "px"; c.style.width = b.offsetWidth + "px"; }
  }

  /* « En bref » : la semaine en cours, le parcours, le nombre de joueurs, le meilleur toutes catégories */
  function enBref(sem) {
    const u = unite(), e = etatParcours(), course = e.courant ? e.courant.nom : sem && sem.parcours;
    const meneurs = data.categories.map((c) => c.classement[mode()][0]).filter((r) => r && r.rang).sort((a, b) => b.total - a.total);
    $("#en-bref").innerHTML = [
      [u.Cap, sem ? P() + sem.numero + (sem.statut === "en_cours" ? ' <span class="direct">en cours</span>' : "") : "–", sem ? periode(sem) : ""],
      ["Parcours", esc(course || "–"), `<a href="#/parcours">${e.suivant ? "Ensuite : " + esc(e.suivant.nom) : "Voir la fiche du parcours"}</a>`],
      ["Joueurs", `<span data-n="${data.joueurs.length}"></span>`, `${u.compte(data.semaines.length)} ${u.joues[data.semaines.length > 1 ? 1 : 0]}`],
      ["Meilleur " + mode(), meneurs.length ? esc(meneurs[0].joueur) : "–", meneurs.length ? nb(meneurs[0].total) + " points" : "Pas encore de résultat"],
    ].map((c) => `<div class="bref monte sc" data-dy="30"><p class="etq">${c[0]}</p><p class="val">${c[1]}</p><p class="note">${c[2]}</p></div>`).join("");
    nombres($("#en-bref"));
  }

  /* les réglages du classement : catégorie, net ou brut, recherche */
  function outils() {
    const cat = $("#seg-cat"), md = $("#seg-mode");
    cat.hidden = data.categories.length < 2;
    cat.innerHTML = data.categories.map((c) => `<button type="button" data-cat="${esc(c.nom)}" aria-pressed="${c.nom === etat.cat}">${esc(c.nom)}</button>`).join("") + '<span class="curseur" aria-hidden="true"></span>';
    md.hidden = brutSeul();
    $$("button", md).forEach((b) => b.setAttribute("aria-pressed", b.dataset.mode === etat.mode));
    $("#q").value = etat.q;
    curseur(cat); curseur(md);
  }

  function evolution(e) {
    if (e.evolution === "nouveau") return '<span class="evo neuf">Nouveau</span>';
    if (e.evolution == null || e.rang == null) return '<span class="evo"></span>';
    if (e.evolution > 0) return `<span class="evo plus" aria-label="gagne ${e.evolution} place${e.evolution > 1 ? "s" : ""}">▲ ${e.evolution}</span>`;
    if (e.evolution < 0) return `<span class="evo moins" aria-label="perd ${-e.evolution} place${e.evolution < -1 ? "s" : ""}">▼ ${-e.evolution}</span>`;
    return '<span class="evo" aria-label="place inchangée">=</span>';
  }

  function cases(e, semaines) {
    return semaines.map((w, k) => {
      const p = e.points[w], cle = `style="--k:${(k / semaines.length * 0.7).toFixed(2)}"`;
      if (p == null) return `<span class="pt v" ${cle}>·</span>`;
      return `<span class="pt${e.a_remplacer === w ? " r" : e.comptees.includes(w) ? " c" : ""}" ${cle}>${p}</span>`;
    }).join("");
  }

  /* sous le pseudo : le handicap de jeu actuel (jamais au Short Game) et le nombre de semaines (ou de mois) jouées */
  function meta(e) {
    const m = [];
    if (!brutSeul() && e.hdc_actuel != null) m.push("Hdc " + nb(e.hdc_actuel));
    m.push(unite().compte(e.nb_semaines));
    return m.join(" · ");
  }

  function dessinerClassement(flip) {
    /* seulement les joueurs qui ont déjà joué : les inscrits sans résultat restent dans la section Joueurs (demande de Mike, 15.11.2026) */
    const tous = classement().filter((r) => r.nb_semaines > 0), q = etat.q.trim().toLowerCase(), liste = q ? tous.filter((r) => r.joueur.toLowerCase().includes(q)) : tous;
    const podium = $("#podium"), ol = $("#liste"), zone = $("#liste-zone"), vide = $("#liste-vide"), semaines = semainesDesc();
    const avant = new Map($$("li[data-j]", ol).map((li) => [li.dataset.j, li.getBoundingClientRect().top]));
    $("#classement-repere").textContent = "Classement " + (mode() === "net" ? "net Stableford" : "brut");
    $("#classement-sous").textContent = (brutSeul() ? `Tes ${meilleursN()} résultats (un par mois) comptent tous.` : `Les ${meilleursN()} meilleurs résultats de la saison comptent.`) + " Touche un joueur pour voir sa fiche.";

    /* le podium : seulement s'il y a trois joueurs classés, et pas pendant une recherche */
    const top = tous.filter((r) => r.rang && r.rang <= 3).slice(0, 3);
    podium.hidden = !!q || top.length < 3;
    podium.innerHTML = podium.hidden ? "" : top.map((e) => `
      <li><button class="marche" type="button" data-joueur="${esc(e.joueur)}">
        <span class="num" aria-hidden="true">${e.rang}</span>
        <span class="place">${e.rang === 1 ? "En tête" : e.rang + "ᵉ place"} ${evolution(e)}</span>
        <span class="nom">${esc(e.joueur)}</span>
        <span class="total"><span data-n="${e.total}"></span><small>pts</small></span>
        <span class="meta">${meta(e)}</span>
      </button></li>`).join("");
    podium.classList.remove("in");
    void podium.offsetWidth;
    if (podium.dataset.vu) podium.classList.add("in");
    nombres(podium);

    vide.hidden = liste.length > 0;
    zone.hidden = !liste.length;
    vide.textContent = liste.length ? "" : q ? `Aucun joueur ne correspond à « ${etat.q} ».` : `Personne n'a encore joué au ${data.nom}.`;

    /* tous les joueurs, avec une colonne par semaine (WC18, WC17… WC1) */
    zone.style.setProperty("--n", semaines.length);
    $("#sem-tete").innerHTML = `<span class="fixe"><span></span><span></span><span>Joueur</span><span>Total</span></span>` +
      semaines.map((w, k) => { const s = data.semaines.find((x) => x.numero === w); return `<span class="${k === 0 ? "auj" : ""}" title="${esc(s ? s.parcours : "")}">${P()}${w}</span>`; }).join("");
    ol.innerHTML = liste.map((e, i) => `
      <li class="sc" data-dy="26" data-j="${esc(e.joueur)}" style="--i:${Math.min(i, 12)}"><button class="rangee" type="button" data-joueur="${esc(e.joueur)}" aria-label="${e.rang ? e.rang + "ᵉ" : "Non classé"}, ${esc(e.joueur)}, ${nb(e.total)} points : ouvrir la fiche">
        <span class="fixe">
          <span class="rg">${e.rang || "–"}</span>${evolution(e)}
          <span class="nom">${esc(e.joueur)}<small>${meta(e)}</small></span>
          <span class="tot">${nb(e.total)}<small>pts</small></span>
        </span>${cases(e, semaines)}
      </button></li>`).join("");
    zone.classList.toggle("defile", zone.scrollWidth > zone.clientWidth + 1);
    $("#legende").innerHTML = '<i class="lg compte"></i>Résultat compté' + (brutSeul() ? "" : ' <i class="lg rempl"></i>Premier à être remplacé') +
      ` · ${brutSeul() ? "Tout le monde joue à 0 : pas de handicap" : "Hdc : handicap de jeu actuel"} · une colonne par ${unite().cap}, la plus récente à gauche`;

    /* Net ↔ Brut : chaque joueur glisse de son ancienne place à la nouvelle */
    $$("li[data-j]", ol).forEach((li) => {
      const y0 = avant.get(li.dataset.j);
      if (flip && y0 != null && !CALME) {
        const dy = y0 - li.getBoundingClientRect().top;
        if (dy) li.animate([{ transform: `translateY(${dy}px)` }, { transform: "none" }], { duration: 750, easing: "cubic-bezier(.16,1,.3,1)" });
      } else li.classList.add("arrive");
    });
    rafraichir();
  }

  /* ───────── 03 · La course au titre ───────── */
  let courseVue = false, courseRaf = 0, courseChoix = null, courseColonne = 0, courseAvancer = null, courseP = 0;
  let courseVisibles = [], courseComp = ""; // catégories cochées dans la course au titre, pour la compétition affichée
  /* défilement (en pixels) au bout duquel la balle du premier coup arrive dans le trou ; ensuite elle descend dans la page */
  const retour = (jonction) => Math.max(140, jonction * 0.62);
  let rafraichir = () => {};
  /* sur un écran assez haut, la section reste épinglée et c'est le défilement qui déroule la saison (voir refonte.css) */
  const estEpingle = () => !CALME && getComputedStyle($("#saison")).getPropertyValue("--epingle").trim() === "1";

  /* Une teinte par compétition (bleu, vert, rouge, or : contrôlées pour rester distinctes, y compris pour les daltoniens),
     et cinq nuances du clair au foncé pour les cinq premiers. Les Seniors sont en tirets, le Short Game en marches :
     la couleur n'est jamais le seul repère. */
  const TEINTES_NUIT = ["#4aa8ff", "#35d6a0", "#ff7a59", "#ffd24a"];
  const TEINTES_JOUR = ["#1b76d1", "#0b9a6d", "#dc4f2b", "#b08000"];   // les mêmes teintes, plus denses pour rester lisibles sur fond clair
  const teintes = () => (TH.clair ? TEINTES_JOUR : TEINTES_NUIT);
  function nuance(hex, i) {
    const c = [1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16)), blanc = [0.38, 0.16, 0, 0, 0][i], fonce = [1, 1, 1, 0.8, 0.64][i];
    return "#" + c.map((v) => Math.round((v + (255 - v) * blanc) * fonce).toString(16).padStart(2, "0")).join("");
  }

  /* cumul des meilleurs résultats après chaque semaine (ou chaque tournoi) */
  function cumuls(points, n, meilleurs) {
    const out = [];
    for (let w = 1; w <= n; w++) {
      const pts = Object.keys(points).filter((k) => +k <= w).map((k) => points[k]).sort((a, b) => b - a).slice(0, meilleurs);
      out.push(pts.reduce((s, v) => s + v, 0));
    }
    return out;
  }

  /* les cinq premiers de chaque catégorie de la compétition affichée (net ou brut selon le classement ; toujours brut au Short Game) */
  function groupesCourse() {
    const n = nbSemaines();
    return data.categories.map((c, i) => ({
      idx: i, nom: c.nom, note: mode(), teinte: brutSeul() ? teintes()[3] : teintes()[i % 3], tirets: !brutSeul() && i % 3 === 2 ? "7 5" : "",
      series: (c.classement[mode()] || []).filter((e) => e.rang != null).slice(0, 5).map((e) => ({ nom: e.joueur, v: cumuls(e.points, n, meilleursN()) })),
    })).filter((g) => g.series.length);
  }

  /* la légende suit la semaine affichée : cumul du moment, et l'ordre du classement à ce moment-là, dans chaque compétition cochée */
  function legendeSemaine(groupes, w) {
    groupes.forEach((g) => {
      const items = $$(`#course-legende .cl-col[data-g="${g.idx}"] li`);
      if (items.length !== g.series.length) return;
      const avant = items.map((li) => li.getBoundingClientRect().top);
      g.series.map((s, i) => ({ i, v: s.v[w - 1] })).sort((a, b) => b.v - a.v || a.i - b.i).forEach((o, k) => {
        items[o.i].style.order = k;
        $("b", items[o.i]).textContent = nb(o.v);
      });
      if (!CALME) items.forEach((li, i) => {
        const dy = avant[i] - li.getBoundingClientRect().top;
        if (dy) li.animate([{ transform: `translateY(${dy}px)` }, { transform: "none" }], { duration: 380, easing: "cubic-bezier(.16,1,.3,1)" });
      });
    });
  }

  function dessinerCourse(animer) {
    const zone = $("#course-zone"), boite = $("#course"), bulle = $("#course-bulle"), legende = $("#course-legende"), n = nbSemaines(), pin = estEpingle(), u = unite();
    const tous = groupesCourse();
    if (courseComp !== etat.comp || courseVisibles.length !== data.categories.length) { courseComp = etat.comp; courseVisibles = data.categories.map(() => true); } // au départ, tout est coché
    const groupes = tous.filter((g) => courseVisibles[g.idx]);
    $("#course-sous").textContent = `Le cumul des ${meilleursN()} ${brutSeul() ? "résultats bruts" : "meilleurs résultats " + (mode() === "net" ? "nets" : "bruts")} des cinq premiers, ${u.cap} après ${u.cap}.` +
      (tous.length > 1 ? " Coche les catégories à afficher." : "") + (pin ? " Fais défiler pour dérouler la saison." : "");
    $("#saison").classList.toggle("vide", !tous.length || n < 2); // rien à dérouler : la section n'est pas épinglée
    if (!tous.length || n < 2) { zone.innerHTML = `<p class="sous petit">La course démarre après deux ${u.pluriel} ${u.joues[1]}.</p>`; legende.innerHTML = ""; courseAvancer = null; return; }

    /* une case à cocher par compétition ; sous chaque case cochée, ses cinq premiers */
    const coche = document.activeElement && document.activeElement.matches && document.activeElement.matches("#course-legende input") ? document.activeElement.dataset.g : null;
    if (!groupes.some((g) => g.idx === courseColonne) && groupes.length) courseColonne = groupes[0].idx;
    legende.innerHTML = tous.map((g) => `<div class="cl-col${courseVisibles[g.idx] ? " coche" : ""}" data-g="${g.idx}" style="--c:${g.teinte}">
      ${tous.length > 1 ? `<label class="cl-tete"><input type="checkbox" data-g="${g.idx}"${courseVisibles[g.idx] ? " checked" : ""}>${esc(g.nom)} <small>${g.note}</small></label>`
        : `<p class="cl-tete seul"><i></i>${esc(g.nom)} <small>${g.note}</small></p>`}
      ${courseVisibles[g.idx] ? `<ol>${g.series.map((s, i) => `<li style="--c:${nuance(g.teinte, i)}"><button type="button" data-g="${g.idx}" data-s="${i}" aria-pressed="false"><i class="${g.tirets ? "tirets" : ""}"></i><span>${esc(s.nom)}</span><b>${nb(s.v[n - 1])}</b></button></li>`).join("")}</ol>` : ""}</div>`).join("");
    if (coche != null) { const c = $(`#course-legende input[data-g="${coche}"]`); if (c) c.focus(); }
    legende.style.setProperty("--cols", tous.length);
    courseChoix = null;

    if (!groupes.length) {
      zone.innerHTML = '<p class="course-vide">Coche au moins une catégorie ci-dessous pour voir sa course.</p>';
      courseAvancer = null; boite.classList.remove("focus", "fini");
      return;
    }

    const W = zone.clientWidth, large = W >= 720, H = pin ? borne(window.innerHeight - (large ? 540 : 560), 170, 440) : large ? 440 : 300;
    const G = 46, D = 14, T = 36, B = 30, lw = W - G - D, lh = H - T - B;
    const max = Math.max(200, Math.ceil(Math.max(...groupes.map((g) => Math.max(...g.series.map((s) => s.v[n - 1])))) / 200) * 200);
    const x = (w) => G + (w - 1) / (n - 1) * lw, y = (v) => T + lh - v / max * lh;

    let h = `<defs><clipPath id="course-clip"><rect x="0" y="0" width="${W}" height="${H}"/></clipPath></defs>`;
    for (let v = 0; v <= max; v += 200) h += `<line class="grille" x1="${G}" x2="${G + lw}" y1="${y(v)}" y2="${y(v)}"/><text x="${G - 10}" y="${y(v) + 4}" text-anchor="end">${nb(v)}</text>`;
    const pas = large ? 1 : 3;
    for (let w = 1; w <= n; w++) if ((w - 1) % pas === 0 || w === n) h += `<text x="${x(w)}" y="${H - 8}" text-anchor="middle">${w === 1 ? data.prefixe : ""}${w}</text>`;
    h += '<g clip-path="url(#course-clip)">';
    const trace = (g, s) => g.marches
      ? s.v.map((v, k) => (k ? `H${x(k + 1).toFixed(1)}V${y(v).toFixed(1)}` : `M${x(1).toFixed(1)} ${y(v).toFixed(1)}`)).join("")
      : s.v.map((v, k) => (k ? "L" : "M") + x(k + 1).toFixed(1) + " " + y(v).toFixed(1)).join("");
    /* les poursuivants d'abord, les premiers par-dessus */
    for (let rang = 4; rang >= 0; rang--) groupes.forEach((g) => {
      const s = g.series[rang];
      if (s) h += `<path class="serie${rang === 0 ? " tete" : ""}" data-g="${g.idx}" data-s="${rang}" stroke="${nuance(g.teinte, rang)}"${g.tirets ? ` stroke-dasharray="${g.tirets}"` : ""} d="${trace(g, s)}"/>`;
    });
    h += "</g>";
    groupes.forEach((g) => { h += `<circle class="bout fin" data-g="${g.idx}" data-s="0" cx="${x(n)}" cy="${y(g.series[0].v[n - 1])}" r="5" fill="${nuance(g.teinte, 0)}"/>`; });
    h += `<line class="repere-x" id="course-front" x1="0" x2="0" y1="${T - 8}" y2="${T + lh}"/><text class="sem" id="course-sem" x="0" y="${T - 16}" text-anchor="middle"></text>`;
    h += `<line class="viseur" id="course-viseur" x1="0" x2="0" y1="${T}" y2="${T + lh}" visibility="hidden"/>`;
    zone.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Évolution du cumul des cinq premiers, pour les compétitions cochées, au fil des semaines">${h}</svg>`;
    choisirSerie(null);

    const svg = $("svg", zone), rect = $("#course-clip rect", zone), front = $("#course-front", zone), sem = $("#course-sem", zone), viseur = $("#course-viseur", zone);
    let semAffichee = 0;
    function avancer(p) {
      const xf = G + p * lw, w = 1 + Math.round(p * (n - 1));
      if (w !== semAffichee) { semAffichee = w; legendeSemaine(groupes, w); }
      rect.setAttribute("width", xf + 3);
      front.setAttribute("x1", xf); front.setAttribute("x2", xf);
      sem.setAttribute("x", xf); sem.textContent = data.prefixe + w;
      const fini = p >= 1;
      front.style.opacity = sem.style.opacity = fini ? 0 : 1;
      boite.classList.toggle("fini", fini);
    }
    cancelAnimationFrame(courseRaf);
    courseAvancer = avancer;
    if (pin) avancer(courseP);
    else if (!courseVue) avancer(0);
    else if (!animer || CALME) avancer(1);
    else {
      const debut = performance.now(), duree = 2600;
      (function etape(now) {
        const t = borne((now - debut) / duree, 0, 1);
        avancer(t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
        if (t < 1) courseRaf = requestAnimationFrame(etape);
      })(debut);
    }

    /* survol : la semaine la plus proche ; une seule compétition cochée : ses cinq joueurs, sinon celui qui mène dans chacune */
    svg.addEventListener("pointermove", (ev) => {
      const r = svg.getBoundingClientRect(), px = (ev.clientX - r.left) * W / r.width;
      const w = borne(Math.round((px - G) / lw * (n - 1)) + 1, 1, n), xv = x(w);
      viseur.setAttribute("x1", xv); viseur.setAttribute("x2", xv); viseur.setAttribute("visibility", "visible");
      const lignes = groupes.length === 1
        ? groupes[0].series.map((s, i) => ({ c: nuance(groupes[0].teinte, i), nom: s.nom, v: s.v[w - 1] })).sort((a, b) => b.v - a.v)
        : groupes.map((g) => { const m = g.series.slice().sort((a, b) => b.v[w - 1] - a.v[w - 1])[0]; return { c: g.teinte, nom: g.nom + " · " + m.nom, v: m.v[w - 1] }; });
      bulle.innerHTML = `<p>${data.prefixe}${w} · ${esc(data.semaines[w - 1].parcours)}</p>` + lignes.map((l) => `<div><span><i style="background:${l.c}"></i>${esc(l.nom)}</span><b>${nb(l.v)}</b></div>`).join("");
      bulle.hidden = false;
      const gauche = xv * r.width / W;
      bulle.style.left = (gauche + bulle.offsetWidth + 24 > r.width ? gauche - bulle.offsetWidth - 14 : gauche + 14) + "px";
      bulle.style.top = "36px";
    });
    svg.addEventListener("pointerleave", () => { bulle.hidden = true; viseur.setAttribute("visibility", "hidden"); });
  }

  function lancerCourse() { courseVue = true; dessinerCourse(true); }

  /* mettre un joueur en avant (clic sur sa ligne dans la légende) ; un second clic remet tout */
  function choisirSerie(choix) {
    const boite = $("#course"), memes = (a, b) => a && b && a.g === b.g && a.s === b.s;
    courseChoix = !choix || memes(choix, courseChoix) ? null : choix;
    const c = courseChoix;
    boite.classList.toggle("focus", !!c);
    $$(".serie, .bout", boite).forEach((p) => p.classList.toggle("vu", !!c && +p.dataset.g === c.g && +p.dataset.s === c.s));
    $$("#course-legende li button").forEach((b) => b.setAttribute("aria-pressed", !!c && +b.dataset.g === c.g && +b.dataset.s === c.s));
    if (c) courseColonne = c.g;
    $$("#course-legende .cl-col").forEach((col) => col.classList.toggle("actif", +col.dataset.g === courseColonne));
  }

  /* ───────── 04 · Statistiques : le meilleur de chaque statistique SGT, pour la semaine choisie ───────── */
  /* [clé, titre comme sur SGT, explication, unité, décimales, unité d'origine de SGT] */
  const TUILES = [
    ["fir", "FIR", "Fairways touchés", "%", 1, ""],
    ["gir", "GIR", "Greens en régulation", "%", 1, ""],
    ["drive", "Longest drive", "Plus long drive de la partie arrêté sur le fairway, mesuré par SGT", "m", 1, "yds"],
    ["ctp", "Closest to the pin", "Le coup de départ le plus près du drapeau sur un par 3", "m", 2, "ft"],
    ["putts_faits", "Total putt length", "Longueur totale des putts rentrés, par tour", "m", 2, "ft"],
  ];
  /* Short Game (petit jeu, sans drive) : ni fairways touchés ni distance au drive */
  const tuiles = () => (P() === "SG" ? TUILES.filter((t) => ["gir", "ctp", "putts_faits"].indexOf(t[0]) >= 0) : TUILES);

  function stats() {
    const u = unite(), cat = categorie(), st = (cat && cat.stats) || {}, semaines = Object.keys(st).map(Number).sort((a, b) => b - a), boite = $("#stats-tuiles");
    $("#stats-outils").hidden = !semaines.length;
    $("#stats-etq").textContent = u.Cap;
    if (!semaines.length) {
      $("#stats-repere").textContent = "Les meilleurs " + u.fin;
      boite.innerHTML = '<p class="vide">Les statistiques (fairways, greens, drive, putts) apparaîtront après les premiers tours.</p>';
      $("#stats-aide").textContent = "";
      return;
    }
    if (semaines.indexOf(etat.sem) < 0) etat.sem = semaines[0];
    $("#stats-sem").innerHTML = semaines.map((w) => `<option value="${w}"${w === etat.sem ? " selected" : ""}>${P()}${w}</option>`).join("");
    const s = st[String(etat.sem)];
    $("#stats-repere").textContent = `Les meilleurs ${u.fin} · ${P()}${etat.sem} · ${cat.nom}`;
    boite.innerHTML = tuiles().map((d) => {
      const t = s[d[0]], origine = t && t.orig != null ? nb(t.orig, 2) + " " + d[5] : "", trou = t && t.trou ? "trou " + t.trou : "";
      return `<article class="carte sc" data-dy="60" title="${esc(d[2])}">
        <svg class="arc-deco" viewBox="0 0 150 150" aria-hidden="true"><path d="M5 140 C40 20 110 20 145 140" fill="none" stroke="#35abe2" stroke-width="1.5" stroke-dasharray=".1 7" stroke-linecap="round"/></svg>
        <p class="etq">${d[1]}</p>
        ${t && t.valeur != null ? `<p class="val"><span data-n="${t.valeur}" data-d="${d[4]}"></span><small>${d[3]}</small></p>` : '<p class="val rien">Pas de donnée</p>'}
        ${origine || trou ? `<p class="orig">${[origine, trou].filter(Boolean).join(" · ")}</p>` : ""}
        <p class="qui">${t && t.joueurs && t.joueurs.length ? t.joueurs.map(esc).join("<br>") : "–"}</p>
        <p class="note">${d[2]}</p>
      </article>`;
    }).join("");
    $("#stats-aide").textContent = `Le meilleur de chaque statistique parmi les joueurs de la catégorie ${cat.nom}, pour ${P()}${etat.sem}. ` + (P() === "SG" ? "" :
      "Longest drive : le plus long drive de la partie arrêté sur le fairway, sur un par 4 ou 5 (onglet Long Drive de SGT). ") +
      "Closest to the pin : le coup de départ le plus près du drapeau sur un par 3 (le plus petit gagne). Total putt length : longueur totale des putts rentrés par tour. Distances en mètres, valeur d'origine de SGT en dessous.";
    nombres(boite);
    rafraichir();
  }

  /* les grands chiffres de la saison : ils montent avec le défilement (voir initDefilement) */
  function chiffres() {
    const tot = { cartes: 0, birdies: 0, eagles: 0 };
    data.semaines.forEach((s) => s.categories.forEach((c) => {
      tot.cartes += c.joueurs || 0;
      tot.birdies += (c.stats && c.stats.birdies) || 0;
      tot.eagles += (c.stats && c.stats.eagles) || 0;
    }));
    $("#chiffres").innerHTML = [[data.semaines.length, unite().caps], [tot.cartes, "Tours joués"], [tot.birdies, "Birdies"], [tot.eagles, "Eagles"]]
      .map((c, i) => `<div class="rv" style="--i:${i}"><b data-n="${c[0]}">${CALME ? nb(c[0]) : "0"}</b><span>${c[1]}</span></div>`).join("");
  }

  /* ───────── 05 · Semaines (ou mois) : les meilleurs scores de chacune ───────── */
  const TOTAUX = ["eagles", "birdies", "pars", "bogeys"];
  function semainesVue() {
    const u = unite(), liste = data.semaines.slice().sort((a, b) => b.numero - a.numero);
    titre($("#t-semaines"), u.caps);
    $("#semaines-sous").textContent = `Le meilleur de chaque catégorie, ${u.cap} par ${u.cap}, avec son score par rapport au par : ` +
      (brutSeul() ? "le score tel qu'il a été joué (brut)." : "brut, le score tel qu'il a été joué ; net, le même score avec les coups rendus par le handicap de jeu.");
    $("#sem-grille").innerHTML = !liste.length ? `<p class="vide">${u.aucune}</p>` : liste.map((w) => `
      <article class="sem-carte monte sc" data-dy="30">
        <header><b>${P()}${w.numero}</b><span class="${w.statut === "en_cours" ? "direct" : "passe"}">${w.statut === "en_cours" ? "En cours" : "Terminée"}</span></header>
        <h3>${esc(w.parcours)}</h3><p class="dates">${periode(w)}</p>
        <dl>${w.categories.map((c) => `<dt>${esc(c.categorie)} · ${c.joueurs} joueur${c.joueurs > 1 ? "s" : ""}</dt>
          ${!c.meilleur_brut || c.meilleur_brut.stableford == null ? "<dd>Pas de résultat</dd>"
            : (brutSeul() ? "" : `<dd><span class="lib">Net</span>${meilleurs(c.meilleur_net, w.numero, "coups_net")}</dd>`) +
              `<dd><span class="lib">Brut</span>${meilleurs(c.meilleur_brut, w.numero, "coups_brut")}</dd>`}`).join("")}</dl>
        <p class="totaux">${TOTAUX.map((k) => `<span><b>${w.categories.reduce((s, c) => s + ((c.stats && c.stats[k]) || 0), 0)}</b> ${k}</span>`).join("")}</p>
      </article>`).join("");
  }

  /* ───────── 06 · Joueurs : la liste, le filtre par catégorie, la recherche ───────── */
  function joueursVue() {
    const cats = data.categories.map((c) => c.nom), boite = $("#pcats");
    if (cats.indexOf(etat.pcat) < 0) etat.pcat = "";
    boite.hidden = cats.length < 2; // le Short Game, mixte, n'a qu'une catégorie : pas de filtre
    const puce = (val, lib) => `<button type="button" data-pcat="${esc(val)}" aria-pressed="${etat.pcat === val}">${esc(lib)}</button>`;
    boite.innerHTML = puce("", "Tous") + cats.map((c) => puce(c, c)).join("");
    $("#pq").value = etat.pq;
    dessinerJoueurs();
  }
  function dessinerJoueurs() {
    const boite = $("#plist"), q = etat.pq.trim().toLowerCase(), liste = data.joueurs.filter((j) => j.joueur.toLowerCase().includes(q) && (!etat.pcat || j.categorie === etat.pcat));
    const avant = new Map($$(".pcarte", boite).map((el) => [el.dataset.joueur, el.getBoundingClientRect()]));
    const lignes = {};
    data.categories.forEach((c) => (c.classement[mode()] || []).forEach((e) => { lignes[e.joueur] = e; }));
    boite.innerHTML = liste.length ? liste.map((j) => {
      const rang = brutSeul() ? j.rang_brut : j.rang_net, l = lignes[j.joueur], sems = l ? Object.keys(l.points).map(Number).sort((a, b) => a - b).slice(-14) : [];
      /* la forme du joueur : une petite barre par partie, qui pousse à l'arrivée de la carte */
      const forme = sems.map((w) => `<i class="${l.a_remplacer === w ? "r" : l.comptees.includes(w) ? "c" : ""}" style="height:${borne(l.points[w] / 2.3, 10, 100).toFixed(0)}%"></i>`).join("");
      return `<button type="button" class="pcarte sc" data-dy="30" data-joueur="${esc(j.joueur)}">
        <span><b>${esc(j.joueur)}</b><small>${esc(j.categorie)}${brutSeul() ? "" : " · hdc " + nb(j.hdc_actuel)}</small></span><i class="rg">${rang ? "#" + rang : "–"}</i>
        <span class="mini" aria-hidden="true">${forme}</span></button>`;
    }).join("") : '<p class="vide">Aucun joueur.</p>';
    $("#p-compte").innerHTML = `<b data-n="${liste.length}"></b> joueur${liste.length > 1 ? "s" : ""} affiché${liste.length > 1 ? "s" : ""}`;
    nombres($("#p-compte"));

    /* filtre ou recherche : les cartes qui restent glissent à leur nouvelle place, les nouvelles apparaissent */
    if (!CALME && avant.size) $$(".pcarte", boite).forEach((el, i) => {
      const a = avant.get(el.dataset.joueur), b = el.getBoundingClientRect();
      if (a) { if (a.left !== b.left || a.top !== b.top) el.animate([{ translate: `${a.left - b.left}px ${a.top - b.top}px` }, { translate: "0 0" }], { duration: 520, easing: "cubic-bezier(.16,1,.3,1)" }); }
      else el.animate([{ opacity: 0, scale: 0.8 }, { opacity: 1, scale: 1 }], { duration: 420, delay: Math.min(i, 14) * 16, easing: "cubic-bezier(.16,1,.3,1)", fill: "backwards" });
    });
    rafraichir();
  }

  /* ───────── 07 · Règles ───────── */
  /* Fin de la saison du Winter Challenge (donnée par Mike, 08.11.2026) : sert à la durée affichée dans les règles */
  const FIN_SAISON = "2027-03-25";
  function dureeSaison() {
    const debuts = (Array.isArray(comps[0].parcours) ? comps[0].parcours : []).map((e) => e.debut).filter(Boolean).sort();
    if (!debuts.length) return null;
    return Math.ceil(((Date.parse(FIN_SAISON) - Date.parse(debuts[0])) / 864e5 + 1) / 7); // du début de la WC1 au dernier jour de la saison compris
  }

  /* Petites scènes animées dans les règles : elles avancent avec le défilement (--v, posé par initDefilement, va de 0 quand la
     scène entre en bas de l'écran à 1 quand elle sort en haut). */
  const BARRES = [70, 100, 40, 130, 90, 60, 110, 30, 80, 120, 50, 100]; // douze résultats d'exemple : les huit meilleurs s'allument, le plus petit en rouge
  const HUIT = BARRES.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]).slice(0, 8).map((x) => x[1]);
  const SCENES = {
    points: '<div class="scene sc-points vue" data-scene="points" aria-hidden="true"><div class="piste"><i></i><span></span></div><p><b class="s">18</b> points Stableford <em>→</em> <b class="p">100</b> points</p></div>',
    handicap: '<div class="scene sc-hdc vue" aria-hidden="true"><svg viewBox="0 0 64 64"><circle class="fond" cx="32" cy="32" r="26"/><circle class="val" cx="32" cy="32" r="26" pathLength="100"/></svg>' +
      "<p>Réel <b>11</b> <em>→</em> de jeu <b>8</b><small>handicap de jeu : les trois quarts du handicap réel, arrondis</small></p></div>",
    finale: '<div class="scene sc-finale vue" aria-hidden="true">' + BARRES.map((v, i) => {
      const k = HUIT.indexOf(i);
      return `<i class="${k === 7 ? "r" : ""}" style="--h:${v};--k:${k < 0 ? 99 : k}"></i>`;
    }).join("") + "</div>",
  };

  /* d'autres scènes : la semaine, le tour unique, brut et net, le tee, le lieu, la mise à jour, les statistiques, le Short Game */
  Object.assign(SCENES, {
    semaine: '<div class="scene sc-sem vue" aria-hidden="true"><div class="piste"><span></span></div><ol>' + ["L", "M", "M", "J", "V", "S", "D"].map((j, i) => `<li style="--k:${i}">${j}</li>`).join("") + "</ol></div>",
    tour: '<div class="scene sc-tour vue" aria-hidden="true"><div class="piste"><span></span><i></i></div><p><b>1</b> tour <em>·</em> <b>0</b> seconde chance</p></div>',
    brutNet: '<div class="scene sc-bn vue" aria-hidden="true"><p><span>Brut</span><i class="br"></i><b>44</b></p><p><span>Net</span><i class="nt"></i><b>40</b></p><small>exemple : quatre coups rendus par le handicap de jeu</small></div>',
    tee: '<div class="scene sc-tee vue" aria-hidden="true"><div class="piste"><i class="avant"></i><i class="arriere"></i><span></span></div><p>le départ recule, le trou s\'allonge</p></div>',
    ou: '<div class="scene sc-ou vue" aria-hidden="true"><div class="lieu"><i class="onde"></i><i class="epingle"></i></div><p><b>Bussigny</b><small>Let\'s Golf, près de Lausanne</small></p></div>',
    maj: '<div class="scene sc-maj" aria-hidden="true"><svg viewBox="0 0 64 64"><circle class="fond" cx="32" cy="32" r="26"/><circle class="val" cx="32" cy="32" r="26" pathLength="100"/></svg><p><b>5</b> minutes<small>entre deux mises à jour, en journée</small></p></div>',
    stats: '<div class="scene sc-stats vue" aria-hidden="true">' + [62, 88, 46, 74, 96].map((v, i) => `<i style="--h:${v};--k:${i}"></i>`).join("") + "</div>",
    zero: '<div class="scene sc-zero vue" data-scene="zero" aria-hidden="true"><b class="z">0</b><p>de handicap pour tout le monde<small>seul compte le score brut</small></p></div>',
  });
  const sceneCategories = (noms) => '<div class="scene sc-cat vue" aria-hidden="true">' + noms.map((n, i) => `<span style="--k:${i};--c:${teintes()[i % 3]}"><i></i>${esc(n)}</span>`).join("") + "</div>";
  const sceneMois = (c) => '<div class="scene sc-sem vue" aria-hidden="true"><div class="piste"><span></span></div><ol>' + Array.from({ length: c.meilleurs || 5 }, (_, i) => `<li style="--k:${i}">${esc(c.prefixe)}${i + 1}</li>`).join("") + "</ol></div>";

  function reglesVue() {
    const r = data.regles, wc = comps[0], autres = comps.slice(1), sg = autres.find((c) => c.id === etat.comp); // la compétition choisie en haut de la page
    const noms = ["Hommes", "Femmes", "Seniors"];
    brutes.categories.forEach((c) => { if (noms.indexOf(c.nom) < 0) noms.push(c.nom); }); // toutes les catégories, même sans joueur pour l'instant
    const cats = noms.map((n) => `<strong>${esc(n)}</strong>`).join(", ");
    const regle = (t, html, scene) => `<article class="regle sc vue"><h4>${t}</h4><p>${html}</p>${scene || ""}</article>`;
    const cpt = (v) => `<span data-n="${v}"></span>`; // un chiffre qui monte à l'apparition
    const bref = (lib, val, note) => `<div class="bref monte sc" data-dy="30"><p class="etq">${lib}</p><p class="val">${val}</p><p class="note">${note}</p></div>`;
    const court = (c) => {
      const n = c.meilleurs || r.meilleurs;
      return [
        regle(`${n} mois, ${n} parcours`, `Le ${esc(c.nom)} dure <strong>${n} mois</strong> : un tournoi par mois sur Simulator Golf Tour (${esc(c.prefixe)}1 à ${esc(c.prefixe)}${n}), sur <strong>${n} parcours</strong> différents, propres au ${esc(c.nom)}. Tu joues les <strong>18 trous</strong>. Tu es inscrit d'office, en même temps que dans le ${esc(wc.nom)}.`, sceneMois(c)),
        regle("Un seul tour par mois", `Comme au ${esc(wc.nom)}, tu n'as droit qu'à <strong>un seul tour</strong> par tournoi : pas de seconde chance.`, SCENES.tour),
        c.brut_seul
          ? regle("Brut seulement, sans handicap", "<strong>Tout le monde joue avec un handicap de 0</strong>, sans exception. Il n'y a donc ni classement net, ni handicap de jeu à suivre : seul compte ton score brut.", SCENES.zero)
          : regle("Net et brut", `Le ${esc(c.nom)} a un classement net et un classement brut, comme le ${esc(wc.nom)}.`),
        regle("Un seul classement pour tous", `${c.brut_seul ? "Hommes, Femmes et Seniors jouent ensemble : " : ""}il y a un seul classement${c.categories.length > 1 ? " par catégorie" : ""}. Les points se calculent comme au ${esc(wc.nom)} (Stableford, 100 points de référence), et <strong>tes ${n} résultats comptent tous</strong> au classement : pas de résultat à remplacer.`),
      ].join("");
    };
    const pourJouer = (c) => `<h3 class="regles-titre">Pour jouer</h3><div class="regles">
      ${c ? "" : regle("Le tee de départ", "Le capitaine se réserve le droit de <strong>déplacer le tee de départ</strong> des joueurs en haut du classement, si l'écart avec les autres devient trop important.", SCENES.tee)}
      ${regle("Ton compte", "Ton pseudo est ton nom d'utilisateur Simulator Golf Tour, le même dans GSPro : c'est lui qui apparaît ici. Pour choisir ou changer ton mot de passe, utilise « mot de passe oublié » sur simulatorgolftour.com avec l'adresse e-mail de ton inscription.")}
      ${regle("Où jouer", "Sur les simulateurs du Let's Golf, à Bussigny, avec GSPro : ton tour est envoyé tout seul au tournoi de Simulator Golf Tour.", SCENES.ou)}
      ${regle("Les statistiques", c
        ? `Dans la section Statistiques, trois tuiles donnent le meilleur ${unite().fin} : greens en régulation (GIR), closest to the pin et total putt length. Ta fiche joueur garde les tiennes.`
        : "Dans la section Statistiques, cinq tuiles donnent le meilleur de la semaine : fairways touchés (FIR), greens en régulation (GIR), longest drive, closest to the pin et total putt length. Ta fiche joueur garde les tiennes.", SCENES.stats)}
      ${regle("Les résultats", "Ce site se met à jour tout seul, toutes les 5 minutes environ en journée : ton score apparaît peu après la fin de ton tour.", SCENES.maj)}
    </div>`;

    if (sg) {
      const n = sg.meilleurs || r.meilleurs;
      $("#regles-sous").textContent = `Tout ce qu'il faut savoir pour jouer au ${sg.nom}. Tu y es inscrit d'office, en même temps qu'au ${wc.nom}.`;
      $("#regles-bref").innerHTML = bref("Essais", "1 seul tour", "par mois, sans seconde chance") + bref("Format", cpt(18) + " trous", "sur le parcours du mois") +
        bref("Durée", cpt(n) + " mois", "un parcours par mois") + bref("Classement", cpt(n) + " résultats", "ils comptent tous") + bref("Handicap", "0 pour tous", sg.brut_seul ? "brut seulement" : "net et brut");
      $("#regles-corps").innerHTML = `<h3 class="regles-titre">${esc(sg.nom)}</h3><div class="regles">${court(sg)}</div>${pourJouer(sg)}`;
      nombres($("#regles-bref"));
      return;
    }
    const duree = dureeSaison();
    $("#regles-sous").textContent = `Tout ce qu'il faut savoir pour jouer au ${wc.nom}.` + (autres.length ? ` Tu es aussi inscrit d'office au ${autres.map((c) => c.nom).join(" et au ")} : ses règles s'affichent quand tu le choisis en haut de la page.` : "");
    $("#regles-bref").innerHTML = bref("Essais", "1 seul tour", "par semaine, sans seconde chance") + bref("Format", cpt(9) + " trous", "sur le parcours de la semaine") +
      bref("Durée", duree ? cpt(duree) + " semaines" : "–", "jusqu'au " + dateCH(FIN_SAISON)) + bref("Classement", cpt(r.meilleurs) + " meilleurs", "résultats de la saison") + bref("Handicap", cpt(75) + " %", "de ton handicap réel au départ");
    $("#regles-corps").innerHTML = `<h3 class="regles-titre">${esc(wc.nom)}</h3><div class="regles">
      ${regle("Une semaine, un parcours", "Chaque semaine, un parcours est choisi sur Simulator Golf Tour. Tu joues <strong>9 trous</strong> depuis ton simulateur, quand tu veux pendant la semaine. Le parcours et ses réglages sont dans la section Parcours.", SCENES.semaine)}
      ${regle("Un seul tour par semaine", "Tu n'as droit qu'à <strong>un seul tour</strong> par semaine : pas de seconde chance. Ton <strong>Stableford</strong> de ce tour donne tes points, pour les classements brut et net.", SCENES.tour)}
      ${regle("Les points", "Sur 9 trous, <strong>18 points Stableford valent 100 points</strong> de classement, et chaque point de plus ou de moins vaut 10 points (minimum 30). Sur 18 trous, la référence est de 36 points.", SCENES.points)}
      ${regle("Brut et net", "Le classement <strong>brut</strong> compte ton score tel quel. Le classement <strong>net</strong> tient compte de ton handicap de jeu : tu reçois des coups sur les trous les plus difficiles.", SCENES.brutNet)}
      ${regle("Le handicap de jeu", "Il part des <strong>trois quarts (75 %) de ton handicap réel</strong> (sans handicap réel connu, tu pars à 0). Il ne change qu'à la fin de chaque semaine : il monte de 1 si tu fais moins de 100 points nets, sinon il baisse d'un point par tranche de 10 points au-dessus de 100. Un handicap plus bas est meilleur.", SCENES.handicap)}
      ${regle("Les catégories", `${cats} : chaque catégorie a son propre classement, en net et en brut.`, sceneCategories(noms))}
      ${regle("Le classement final", `Seuls tes <strong>${r.meilleurs} meilleurs résultats</strong> de la saison comptent. Dans le tableau, ils sont en bleu, et le plus petit d'entre eux est en rouge : c'est le premier que tu remplaceras si tu fais mieux. La flèche indique les places gagnées ou perdues depuis la semaine précédente.`, SCENES.finale)}
    </div>${pourJouer(null)}`;
    nombres($("#regles-bref"));
  }

  /* ───────── Fiche joueur ───────── */
  const dec = (n, d) => (n == null ? "–" : nb(n, d == null ? 1 : d));
  const place = (rang, sur) => `${rang === 1 ? "1er" : rang + "e"} sur ${sur}`;
  const pct = (n) => (n == null ? "–" : nb(n, Number.isInteger(n) ? 0 : 1) + " %");
  const texte = (html) => html.replace(/<br>/g, ". ").replace(/<[^>]+>/g, "");
  const sorte = (w, ligne) => (ligne && w.semaine === ligne.a_remplacer ? "r" : ligne && ligne.comptees.includes(w.semaine) ? "c" : "");
  const SORTES = { c: "Compte dans le classement", r: "Compte, mais sera le premier remplacé", "": "Ne compte pas (hors des meilleurs résultats)" };

  /* le détail d'une partie, comme dans les bulles du site actuel */
  function detailPartie(w, ligne) {
    const tete = `<b>${P()}${w.semaine} · ${esc(w.parcours)}</b><br>Score : ${w.coups_brut} coups (${signe(w.coups_brut - w.par)})`;
    return (brutSeul()
      ? `${tete} · Stableford : ${w.stableford_brut} · Points : <b>${w.points_brut}</b>`
      : `${tete} · net ${w.coups_net} (${signe(w.coups_net - w.par)})<br>Stableford : ${w.stableford_net} net · ${w.stableford_brut} brut · Points : <b>${w.points_net} net</b> · ${w.points_brut} brut`) + `<br><i>${SORTES[sorte(w, ligne)]}</i>`;
  }

  /* les statistiques du joueur : elles couvrent tous les tours de la semaine, pas seulement le tour retenu pour le classement */
  function statsJoueur(p) {
    const st = p.stats;
    if (!st) return "";
    const u = unite(), r = st.resume || {}, lignes = (st.semaines || []).slice().sort((a, b) => b.semaine - a.semaine), sg = P() === "SG";
    const bd = r.meilleur_drive, bc = r.meilleur_ctp;
    const semDrive = bd && lignes.find((w) => w.semaine === bd.semaine), semCtp = bc && lignes.find((w) => w.semaine === bc.semaine);
    const trouCtp = semCtp && (semCtp.ctp || []).find((h) => h.trou === bc.trou);
    const ctp = (w) => {
      const l = w.ctp || [];
      if (!l.length) return "–";
      const m = l.reduce((a, b) => (b.m < a.m ? b : a));
      return `${dec(m.m, 2)} m <small>trou ${m.trou}${l.length > 1 ? " · +" + (l.length - 1) : ""}</small>`;
    };
    const moy = (k) => (r[k] == null ? "–" : k === "putts" ? dec(r[k]) : pct(r[k]));
    const jauge = (v, lib) => (v == null ? "" : `<div class="jauge"><svg viewBox="0 0 64 64" aria-hidden="true"><circle class="fond" cx="32" cy="32" r="26"/><circle class="val" cx="32" cy="32" r="26" pathLength="100" stroke-dasharray="${v} 100"/></svg><b>${pct(v)}</b><span>${lib}</span></div>`);
    return `<h4>Statistiques</h4>
      <dl class="trio">
        ${sg ? "" : fait("Longest drive", bd ? dec(bd.m, 1) + " m" : "–", bd ? `meilleur drive · ${P()}${bd.semaine}${semDrive && semDrive.drive_rang ? " · " + place(semDrive.drive_rang, semDrive.drive_sur) : ""}` : "pas encore")}
        ${fait("Closest to the pin", bc ? dec(bc.m, 2) + " m" : "–", bc ? `${P()}${bc.semaine} · trou ${bc.trou}${trouCtp ? " · " + place(trouCtp.rang, trouCtp.sur) : ""}` : "pas encore")}
        ${fait("Putts par tour", moy("putts"), "en moyenne")}
      </dl>
      <div class="jauges deux">${sg ? "" : jauge(r.fairways, "FIR · fairways touchés, en moyenne")}${jauge(r.greens, "GIR · greens en régulation, en moyenne")}</div>
      <div class="table-zone"><table><caption class="sr">Statistiques par ${u.cap}</caption>
        <thead><tr><th scope="col">${u.court}</th>${sg ? "" : '<th scope="col">Longest drive</th>'}<th scope="col">Closest to the pin</th>${sg ? "" : '<th scope="col">FIR</th>'}<th scope="col">GIR</th><th scope="col">Putts</th></tr></thead>
        <tbody>${lignes.map((w) => `<tr><td>${P()}${w.semaine}</td>
          ${sg ? "" : `<td>${w.drive_m == null ? "–" : `<b>${dec(w.drive_m, 1)} m</b>${w.drive_rang ? ` <small>${place(w.drive_rang, w.drive_sur)}</small>` : ""}`}</td>`}
          <td>${ctp(w)}</td>${sg ? "" : `<td>${pct(w.fairways)}</td>`}<td>${pct(w.greens)}</td><td>${dec(w.putts)}</td></tr>`).join("")}</tbody>
        <tfoot><tr><th scope="row" colspan="${sg ? 2 : 3}">Moyenne par tour</th>${sg ? "" : `<td>${moy("fairways")}</td>`}<td>${moy("greens")}</td><td>${moy("putts")}</td></tr></tfoot></table></div>
      <p class="expl">Distances en mètres.${sg ? "" : ` Longest drive : ton plus long drive ${u.fin} arrêté sur le fairway, sur un par 4 ou 5 (le meilleur en haut).`} Closest to the pin : ton coup de départ le plus près du drapeau sur un par 3, green atteint (le trou est indiqué, « +2 » = deux autres par 3 réussis).${sg ? "" : " FIR : fairways touchés."} GIR : greens en régulation. Statistiques de ta partie ${u.fin}.</p>`;
  }

  function ouvrirFiche(pseudo) {
    const fiche = $("#fiche"), p = data.joueurs.find((x) => x.joueur === pseudo);
    if (!p) return;
    const u = unite(), cat = data.categories.find((c) => c.nom === p.categorie) || data.categories[0];
    const taille = (k) => cat.classement[k].filter((r) => r.rang).length, ligne = cat.classement[mode()].find((r) => r.joueur === p.joueur);
    const parties = p.semaines.slice().sort((a, b) => b.semaine - a.semaine), rang = (v) => (v == null ? "–" : v);

    fiche.innerHTML = `<div class="fiche-in">
      <div class="fiche-haut">
        <div><p class="surtitre">${esc(p.categorie)} · ${esc(data.nom)}</p><h3 id="fiche-nom">${esc(p.joueur)}</h3></div>
        <button class="fermer" type="button" aria-label="Fermer la fiche"><svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
      </div>
      <dl class="trio">${brutSeul()
        ? fait("Rang brut", rang(p.rang_brut), `${nb(p.total_brut)} pts sur ${taille("brut")} classés`)
        : fait("Rang net", rang(p.rang_net), `${nb(p.total_net)} pts sur ${taille("net")} classés`) + fait("Rang brut", rang(p.rang_brut), `${nb(p.total_brut)} pts`) +
          fait("Handicap de jeu", nb(p.hdc_actuel), `au départ : ${nb(p.hdc_depart)}`)}</dl>
      ${parties.length ? `
      <h4>Points par partie</h4>
      <div class="partie-trou">
        <div class="terrain" id="trou"></div>
        <div>
          <p class="expl">Chaque partie est un drive. Celles qui comptent sont de bons coups, sur le fairway : plus elles ont rapporté de points, plus le coup est long et au milieu. Les autres sont des coups ratés, partis dans le lac, un bunker ou la forêt.</p>
          <p class="carnet-info" id="trou-info" aria-live="polite">Survole ou touche une balle pour voir le détail de la partie.</p>
          <ul class="cles trou-cles"><li class="c"><i></i>Sur le fairway : compte</li>${brutSeul() ? "" : '<li class="r"><i></i>Au bord du fairway : premier remplacé</li>'}<li><i></i>Hors du fairway : ne compte pas</li></ul>
        </div>
      </div>

      <div id="coups" hidden></div>

      ${brutSeul() ? "" : `<h4>Évolution du handicap</h4>
      <div class="graphe" id="hdc"></div>
      <p class="carnet-info" id="hdc-info" aria-live="polite">Un handicap plus bas est meilleur. Survole ou touche un point pour voir le détail.</p>`}

      <h4>Résultats par ${u.cap}</h4>
      <div class="table-zone"><table><caption class="sr">Résultats retenus par ${u.cap}</caption>${brutSeul()
        ? `<thead><tr><th scope="col">${u.court}</th><th scope="col">Parcours</th><th scope="col">Score</th><th scope="col">Stableford</th><th scope="col">Points</th></tr></thead>
        <tbody>${parties.map((w) => `<tr><td>${P()}${w.semaine}</td><td>${esc(w.parcours)}</td><td>${w.coups_brut} <small>(${signe(w.coups_brut - w.par)})</small></td><td>${w.stableford_brut}</td><td><b>${w.points_brut}</b></td></tr>`).join("")}</tbody>`
        : `<thead><tr><th scope="col">${u.court}</th><th scope="col">Parcours</th><th scope="col">Score</th><th scope="col">Stab. net</th><th scope="col">Pts net</th><th scope="col">Pts brut</th><th scope="col">Hdc</th></tr></thead>
        <tbody>${parties.map((w) => `<tr><td>${P()}${w.semaine}</td><td>${esc(w.parcours)}</td><td>${w.coups_brut} <small>(${signe(w.coups_brut - w.par)})</small></td><td>${w.stableford_net}</td>
          <td><b>${w.points_net}</b></td><td>${w.points_brut}</td><td>${nb(w.hdc_avant)} → ${nb(w.hdc_apres)}</td></tr>`).join("")}</tbody>`}</table></div>`
      : '<p class="vide">Pas encore de résultat pour ce joueur.</p>'}
      ${statsJoueur(p)}
    </div>`;

    fiche.classList.remove("ferme");
    fiche.showModal();
    fiche.scrollTop = 0;
    if (parties.length && ligne) { trouParties(p, ligne); if (!brutSeul()) handicap(p); }
    if (parties.length) coupsJoueur(p, parties);
  }

  /* ───────── Le tour, coup par coup ─────────
     Les coups viennent de l'onglet « Shot data » du site SGT (donnees/coups.json, écrit par la mise à jour des résultats) :
     distance de chaque coup, endroit où la balle finit, distance restante, putts. Le fichier n'est lu qu'à la première
     fiche ouverte. S'il manque, ou si le joueur n'y est pas, le bloc reste caché : rien n'est inventé. */
  let coupsPromis = null;
  const lireCoups = () => coupsPromis || (coupsPromis = fetch("donnees/coups.json?v=" + Date.now()).then((r) => (r.ok ? r.json() : null)).catch(() => null));
  const LIES = { fairway: "fairway", semirough: "semi-rough", rough: "rough", deeprough: "rough épais", sand: "bunker", green: "green", holecup: "dans le trou" };
  const lieNom = (l) => LIES[l] || l || "";
  const metresC = (v) => (v == null ? "" : (v < 10 ? nb(v, 1) : nb(Math.round(v))) + " m");

  function coupsDe(coups, p, semaine) {
    const ids = coups && coups.index && coups.index[P()] ? coups.index[P()][String(semaine)] || [] : [];
    for (const id of ids) {
      const t = coups.tournois[String(id)];
      if (t && t[p.joueur] && t[p.joueur].trous && t[p.joueur].trous.length) return t[p.joueur].trous;
    }
    return null;
  }

  /* le dessin d'un trou : du départ au drapeau, un arc par coup, d'autant plus haut que le coup est long */
  function dessinTrou(trou, k) {
    const L = 300, sol = 60, x0 = 12, x1 = 288;
    const joues = trou.c.filter((c) => c[1] === "c" && typeof c[2] === "number");
    const total = trou.m || joues.reduce((a, c) => a + c[2], 0) || 1;
    const X = (reste) => x0 + (x1 - x0) * borne(1 - reste / total, 0, 1);
    let x = x0, i = 0, h = "", points = "";
    const titre = (c) => `<title>${esc(texteCoup(c).replace(/<[^>]+>/g, ""))}</title>`;
    trou.c.forEach((c) => {
      if (c[1] !== "c" || typeof c[2] !== "number") return;
      const fin = c[4] != null ? X(c[4]) : Math.min(x1, x + (x1 - x0) * c[2] / total);
      const haut = sol - borne(Math.abs(fin - x) * 0.42, 5, 50);
      h += `<path class="cp-arc lie-${esc(c[3])}" pathLength="1" style="--i:${k * 0.12 + i * 0.28}s" d="M${x.toFixed(1)} ${sol}Q${((x + fin) / 2).toFixed(1)} ${(2 * haut - sol).toFixed(1)} ${fin.toFixed(1)} ${sol}">${titre(c)}</path>`;
      points += c[3] === "holecup" ? "" : `<circle class="cp-pt lie-${esc(c[3])}" style="--i:${k * 0.12 + i * 0.28 + 0.3}s" cx="${fin.toFixed(1)}" cy="${sol}" r="3.4">${titre(c)}</circle>`;
      x = fin; i++;
    });
    const putts = trou.c.filter((c) => c[1] === "p" || c[1] === "g").length;
    if (putts && x < x1 - 0.5) h += `<path class="cp-putt" pathLength="1" style="--i:${k * 0.12 + i * 0.28}s" d="M${x.toFixed(1)} ${sol}H${x1}"/>`;
    return `<svg viewBox="0 0 ${L} 70" role="img" aria-label="Trou ${trou.t} : ${trou.c.length} coups détaillés">
      <path class="cp-sol" d="M${x0} ${sol}H${x1}"/><rect class="cp-tee" x="${x0 - 3}" y="${sol - 3}" width="6" height="6" rx="1.5"/>
      ${h}${points}<path class="cp-mat" d="M${x1} ${sol}V${sol - 17}"/><path class="cp-fanion" d="M${x1} ${sol - 17}l-9 3.4 9 3.4z"/></svg>`;
  }

  function texteCoup(c) {
    const reste = c[4] ? ` · reste ${metresC(c[4])}` : "";
    if (c[1] === "g") return "Putt donné";
    if (c[1] === "p") return `Putt <b>${metresC(c[2])}</b>${c[4] === 0 ? " rentré" : reste}`;
    if (c[1] === "c") return c[3] === "holecup" ? `<b>${metresC(c[2])}</b> rentré` : `<b>${metresC(c[2])}</b> → ${esc(lieNom(c[3]))}${reste}`;
    return esc(String(c[2] == null ? "" : c[2]));               // un texte que SGT écrit autrement : montré tel quel
  }

  function carteTrou(trou, k) {
    const ecart = trou.s - trou.p, lignes = [];
    let attendu = 1;
    trou.c.forEach((c) => {
      for (; attendu < c[0]; attendu++) lignes.push(`<li class="pen"><i>${attendu}</i>Coup de pénalité</li>`);   // SGT saute un numéro
      lignes.push(`<li><i class="lie-${esc(c[3])}">${c[0]}</i><span>${texteCoup(c)}</span></li>`);
      attendu = c[0] + 1;
    });
    const dernier = trou.c[trou.c.length - 1];
    if (dernier && (dernier[0] < trou.s || dernier[4] !== 0)) lignes.push('<li class="pen"><i>…</i>Fin du trou non détaillée par SGT</li>');
    const putts = trou.c.filter((c) => c[1] === "p" || c[1] === "g").length;
    return `<article class="cp-trou ${ecart < 0 ? "moins" : ecart === 0 ? "par" : ecart === 1 ? "plus" : "double"}">
      <header><div><b>Trou ${trou.t}</b><small>par ${trou.p}${trou.m ? " · " + nb(trou.m) + " m" : ""}</small></div><span class="cp-score" title="${signe(ecart)}">${trou.s}</span></header>
      ${dessinTrou(trou, k)}
      <ol>${lignes.join("")}</ol>
      <footer>${putts} putt${putts > 1 ? "s" : ""}</footer></article>`;
  }

  function coupsJoueur(p, parties) {
    const pseudo = p.joueur, comp = etat.comp;
    lireCoups().then((coups) => {
      const zone = $("#coups");
      if (!zone || !coups || $("#fiche-nom").textContent !== pseudo || etat.comp !== comp) return;   // la fiche a changé entre-temps
      const dispo = parties.filter((w) => coupsDe(coups, p, w.semaine));
      if (!dispo.length) return;
      const u = unite();
      const montrer = (semaine) => {
        const trous = coupsDe(coups, p, semaine), w = parties.find((x) => x.semaine === semaine);
        const tous = trous.reduce((a, t) => a.concat(t.c), []);
        const putts = tous.filter((c) => c[1] === "p" || c[1] === "g").length;
        const long = Math.max.apply(null, [0].concat(tous.filter((c) => c[1] === "c" && typeof c[2] === "number").map((c) => c[2])));
        const score = trous.reduce((a, t) => a + t.s, 0), par = trous.reduce((a, t) => a + t.p, 0);
        $("#coups-corps").innerHTML = `<dl class="trio cp-resume">
            ${fait("Score", score, signe(score - par) + (w ? " · " + esc(w.parcours) : ""))}${fait("Putts", putts, "putts donnés compris")}${long ? fait("Plus long coup", nb(Math.round(long)) + " m", "") : ""}</dl>
          <div class="cp-grille">${trous.map(carteTrou).join("")}</div>`;
        $$("#coups-sem button").forEach((b) => b.setAttribute("aria-pressed", Number(b.dataset.s) === semaine));
      };
      zone.innerHTML = `<h4>Le tour, coup par coup</h4>
        <p class="expl">Chaque arc est un coup, du départ au drapeau : sa couleur dit où la balle s'est arrêtée. Distances en mètres, relevées par Simulator Golf Tour.</p>
        ${dispo.length > 1 ? `<div class="puces-filtre cp-sem" id="coups-sem" role="group" aria-label="${u.cap} à afficher">${dispo.map((w) => `<button type="button" data-s="${w.semaine}" aria-pressed="false">${P()}${w.semaine}</button>`).join("")}</div>` : ""}
        <ul class="cles cp-cles">${["fairway", "semirough", "rough", "deeprough", "sand", "green"].map((l) => `<li><i class="lie-${l}"></i>${lieNom(l)}</li>`).join("")}</ul>
        <div id="coups-corps"></div>`;
      zone.hidden = false;
      $$("#coups-sem button").forEach((b) => b.addEventListener("click", () => montrer(Number(b.dataset.s))));
      montrer(dispo[0].semaine);
    });
  }

  function fermerFiche() {
    const fiche = $("#fiche");
    if (!fiche.open) return;
    if (CALME) { fiche.close(); return; }
    fiche.classList.add("ferme");
    setTimeout(() => { fiche.close(); fiche.classList.remove("ferme"); }, 260);
  }

  /* survol, clavier ou toucher sur un élément d'un graphique : son détail s'affiche dans l'encadré dessous */
  function detailAuSurvol(boite, sel, info, detail) {
    $$(sel, boite).forEach((g) => {
      const montrer = () => {
        $$(".vu", boite).forEach((el) => el.classList.remove("vu"));
        $$(`[data-w="${g.dataset.w}"]`, boite).forEach((el) => el.classList.add("vu"));
        info.innerHTML = detail(g.dataset.w);
      };
      g.addEventListener("pointerenter", montrer);
      g.addEventListener("focus", montrer);
      g.addEventListener("click", montrer);
    });
  }

  /* ───────── Points par partie : le trou du lac (idée de Mike, 15.11.2026) ─────────
     Chaque partie est un drive, sur un trou de 330 m vu du dessus. Les résultats qui comptent sont de bons coups, entre 215 et
     280 m sur le fairway : plus ils ont rapporté de points, plus ils sont longs et au milieu ; le premier à être remplacé est
     au bord. Ceux qui ne comptent pas sont des coups ratés, entre 180 et 220 m, partis franchement de travers : dans le lac à
     gauche, dans les bunkers ou la forêt à droite. Les mètres ne servent qu'à placer les balles : ils ne sont jamais affichés
     comme une donnée du joueur.
     Le trou est décrit par son axe (du départ au green) et par des largeurs ; le fairway, le rough, le lac, les bunkers et les
     arbres sont construits à partir de là. */
  const f1 = (n) => (+n).toFixed(1);
  const pp = (p) => f1(p[0]) + " " + f1(p[1]);
  const bosse = (t, a, b) => (t > a && t < b ? Math.sin(Math.PI * (t - a) / (b - a)) : 0);
  /* hasard reproductible : le trou se redessine toujours pareil */
  function graine(a) {
    return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }
  /* courbe lisse passant par une suite de points */
  function lisse(pts, ferme) {
    const n = pts.length, p = (i) => (ferme ? pts[(i % n + n) % n] : pts[borne(i, 0, n - 1)]);
    let d = "M" + pp(pts[0]);
    for (let i = 0; i < (ferme ? n : n - 1); i++) {
      const a = p(i - 1), b = p(i), c = p(i + 1), e = p(i + 2);
      d += `C${f1(b[0] + (c[0] - a[0]) / 6)} ${f1(b[1] + (c[1] - a[1]) / 6)} ${f1(c[0] - (e[0] - b[0]) / 6)} ${f1(c[1] - (e[1] - b[1]) / 6)} ${pp(c)}`;
    }
    return d + (ferme ? "Z" : "");
  }
  /* l'axe du trou : donne le point situé à la part t du parcours (0 = départ, 1 = green), décalé de « lat » sur le côté */
  let atelier = null;
  function axeTrou(points) {
    if (!atelier) {
      atelier = document.createElementNS(NS, "svg");
      atelier.setAttribute("style", "position:absolute;width:0;height:0;overflow:hidden");
      document.body.appendChild(atelier);
    }
    const el = document.createElementNS(NS, "path");
    el.setAttribute("d", lisse(points));
    atelier.innerHTML = "";
    atelier.appendChild(el);
    const L = el.getTotalLength();
    const lire = (t) => {
      const tt = borne(t, 0, 1), a = el.getPointAtLength(L * tt), b = el.getPointAtLength(L * Math.min(1, tt + 0.004)), c = el.getPointAtLength(L * Math.max(0, tt - 0.004));
      const m = Math.hypot(b.x - c.x, b.y - c.y) || 1, tx = (b.x - c.x) / m, ty = (b.y - c.y) / m, hors = (t - tt) * L; // au-delà des bouts : on prolonge tout droit
      return { x: a.x + tx * hors, y: a.y + ty * hors, tx, ty };
    };
    return { L, P: (t, lat) => { const q = lire(t); return [q.x - q.ty * (lat || 0), q.y + q.tx * (lat || 0)]; }, angle: (t) => { const q = lire(t); return Math.atan2(q.ty, q.tx); } };
  }
  const LAC = {
    graine: 11, debut: 0.17, green: 25,
    metres: { trou: 330, bons: [215, 280], rates: [180, 220], reperes: [150, 200, 250] },
    axe: [[140, 600], [146, 500], [176, 400], [214, 300], [212, 205], [160, 125], [112, 78]],
    fw: (t) => 24 + 10 * Math.sin(Math.PI * borne((t - 0.17) / 0.8, 0, 1)), // demi-largeur du fairway
    rg: (t, c) => (c < 0 ? 58 + 10 * Math.sin(Math.PI * borne(t, 0, 1)) + 52 * bosse(t, 0.34, 0.92) : 60 + 22 * Math.sin(Math.PI * borne(t, 0, 1))), // demi-largeur du rough, de chaque côté
    eau: { t0: 0.4, t1: 0.86, cote: -1, ecart: 7, largeur: 50 },
    bunkers: [{ t: 0.55, ecart: 15, rx: 13, ry: 8 }, { t: 0.64, ecart: 19, rx: 11, ry: 8 }, { t: 0.5, ecart: 33, rx: 10, ry: 7 }, { t: 0.595, ecart: 37, rx: 12, ry: 8 }, { t: 0.69, ecart: 36, rx: 10, ry: 7 },
      { t: 1.0, ecart: 34, rx: 11, ry: 8, fixe: true }, { t: 1.03, ecart: -30, rx: 10, ry: 7, fixe: true }],
  };

  function trouParties(p, ligne) {
    const boite = $("#trou"), plan = LAC, M = plan.metres, A = axeTrou(plan.axe), alea = graine(plan.graine), fw = plan.fw, rg = plan.rg;
    const parties = p.semaines.slice().sort((a, b) => a.semaine - b.semaine).map((w) => ({ w, pts: w["points_" + mode()], k: sorte(w, ligne) }));
    const tache = (c, rx, ry, a, n) => Array.from({ length: n }, (_, i) => {
      const th = 2 * Math.PI * i / n, k = 0.84 + alea() * 0.32, x = Math.cos(th) * rx * k, y = Math.sin(th) * ry * k;
      return [c[0] + x * Math.cos(a) - y * Math.sin(a), c[1] + x * Math.sin(a) + y * Math.cos(a)];
    });

    /* les contours : rough, fairway, green */
    const rG = [], rD = [], fG = [], fD = [];
    for (let t = -0.06; t <= 1.076; t += 0.02) { rG.push(A.P(t, -rg(t, -1))); rD.push(A.P(t, rg(t, 1))); }
    const rough = rG.concat([A.P(1.115, 0)], rD.reverse(), [A.P(-0.1, 0)]);
    for (let t = plan.debut; t <= 0.956; t += 0.02) { fG.push(A.P(t, -fw(t))); fD.push(A.P(t, fw(t))); }
    const fairway = fG.concat([A.P(0.98, 0)], fD.reverse(), [A.P(plan.debut - 0.03, 0)]);
    const green = tache(A.P(1, 0), plan.green, plan.green * 0.9, A.angle(1), 12);

    /* le cadre, avec de la marge pour les arbres ; sur petit écran, les balles et les chiffres grossissent pour rester lisibles */
    const xs = rough.map((q) => q[0]), ys = rough.map((q) => q[1]);
    const vx = Math.min(...xs) - 30, vy = Math.min(...ys) - 30, vw = Math.max(...xs) + 30 - vx, vh = Math.max(...ys) + 30 - vy;
    const zoom = boite.clientWidth / vw, R = borne(9.5 / zoom, 9.5, 17), corps = R / 9.5 * 10;

    let h = `<defs>
      <pattern id="trou-ray" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(38)"><rect width="5" height="10" style="fill:rgba(var(--vif),.11)"/></pattern>
      <pattern id="trou-croix" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 0H5M0 0V5" style="stroke:rgba(var(--encre),.38)" stroke-width=".8"/></pattern>
      <pattern id="trou-grain" width="4" height="4" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".65" style="fill:rgba(var(--fond-1),.5)"/></pattern>
      <pattern id="trou-herbe" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(20)"><circle cx="2" cy="2" r=".7" style="fill:rgba(var(--vif),.2)"/></pattern>
      <linearGradient id="trou-eau" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2f97d8"/><stop offset="1" stop-color="#145887"/></linearGradient></defs>`;
    h += `<path class="t-rough" d="${lisse(rough, true)}"/><path fill="url(#trou-herbe)" d="${lisse(rough, true)}"/>`;

    /* le lac, le long du fairway */
    const e = plan.eau, dedans = [], dehors = [];
    for (let t = e.t0; t <= e.t1 + 1e-6; t += 0.02) {
      const b = Math.pow(Math.sin(Math.PI * (t - e.t0) / (e.t1 - e.t0)), 0.6);
      dedans.push(A.P(t, e.cote * (fw(t) + e.ecart)));
      dehors.push(A.P(t, e.cote * (fw(t) + e.ecart + 6 + e.largeur * b)));
    }
    h += `<path class="t-eau" fill="url(#trou-eau)" d="${lisse(dedans.concat(dehors.reverse()), true)}"/>`;
    for (let i = 0; i < 7; i++) {
      const t = e.t0 + (0.18 + 0.64 * alea()) * (e.t1 - e.t0), s = A.P(t, e.cote * (fw(t) + e.ecart + 12 + alea() * e.largeur * 0.55));
      h += `<path class="t-vague" d="M${f1(s[0] - 7)} ${f1(s[1])}q3.5-3 7 0t7 0"/>`;
    }

    h += `<path class="t-fw" d="${lisse(fairway, true)}"/><path fill="url(#trou-ray)" d="${lisse(fairway, true)}"/>`;
    h += `<path class="t-green" d="${lisse(green, true)}"/><path fill="url(#trou-croix)" d="${lisse(green, true)}"/>`;

    /* les bunkers : une ombre décalée pour le creux, le sable, son grain */
    plan.bunkers.forEach((b) => {
      const d = lisse(tache(A.P(b.t, b.fixe ? b.ecart : fw(b.t) + b.ecart), b.rx, b.ry, A.angle(b.t), 10), true);
      h += `<path class="t-bunker-ombre" transform="translate(1.5 2.5)" d="${d}"/><path class="t-bunker" d="${d}"/><path fill="url(#trou-grain)" d="${d}"/>`;
    });

    /* les départs */
    [-0.05, -0.018, 0.014].forEach((dt, i) => {
      const c = A.P(dt, i === 1 ? 4 : -3), a = A.angle(dt), coin = (x, y) => [c[0] + x * Math.cos(a) - y * Math.sin(a), c[1] + x * Math.sin(a) + y * Math.cos(a)];
      const d = "M" + [coin(-6, -5), coin(6, -5), coin(6, 5), coin(-6, 5)].map(pp).join("L") + "Z";
      h += `<path class="t-tee" d="${d}"/><path fill="url(#trou-croix)" d="${d}"/>`;
    });

    /* les repères de distance, en travers du fairway */
    M.reperes.forEach((d) => {
      const t = d / M.trou, a = A.P(t, -fw(t) - 5), b = A.P(t, fw(t) + 5), c = A.P(t, fw(t) + 24);
      h += `<line class="t-jalon" x1="${f1(a[0])}" y1="${f1(a[1])}" x2="${f1(b[0])}" y2="${f1(b[1])}"/><text x="${f1(c[0])}" y="${f1(c[1] + corps * 0.36)}" text-anchor="middle" font-size="${f1(corps * 1.05)}">${d} m</text>`;
    });

    /* les arbres, tout autour du rough */
    const arbres = [];
    for (const cote of [-1, 1]) for (let t = -0.09; t <= 1.11; t += 15 / A.L) {
      arbres.push({ s: A.P(t, cote * (rg(t, cote) + 3 + alea() * 11)), r: 7 + alea() * 5 });
      if (alea() < 0.5) arbres.push({ s: A.P(t + 0.008, cote * (rg(t, cote) + 17 + alea() * 9)), r: 6 + alea() * 4 });
    }
    [[-0.13, -16], [-0.14, 6], [-0.12, 24], [1.14, -14], [1.15, 8]].forEach((q) => arbres.push({ s: A.P(q[0], q[1]), r: 8 + alea() * 4 }));
    h += arbres.map((a) => `<circle class="t-arbre" cx="${f1(a.s[0])}" cy="${f1(a.s[1])}" r="${f1(a.r)}"/><circle class="t-feuille" cx="${f1(a.s[0] - a.r * 0.22)}" cy="${f1(a.s[1] - a.r * 0.22)}" r="${f1(a.r * 0.5)}"/>`).join("");

    /* où tombe chaque balle : la distance et l'écart à l'axe viennent des points, comparés aux autres résultats du même groupe */
    const compte = parties.filter((q) => q.k), autres = parties.filter((q) => !q.k);
    const etendue = (l) => { const v = l.map((q) => q.pts); return l.length ? [Math.min(...v), Math.max(...v) - Math.min(...v)] : [0, 0]; };
    const eC = etendue(compte), eA = etendue(autres), posees = [];
    const libre = (s) => posees.every((b) => Math.hypot(b.s[0] - s[0], b.s[1] - s[1]) >= 2 * R + 2);
    let cote = 1;
    parties.slice().sort((a, b) => b.pts - a.pts || a.w.semaine - b.w.semaine).forEach((q) => {
      const part = (et) => (et[1] > 0 ? (q.pts - et[0]) / et[1] : 0.5), nC = part(eC), nA = part(eA); // 0 = le plus faible du groupe, 1 = le meilleur
      const t = (q.k ? M.bons[0] + nC * (M.bons[1] - M.bons[0]) : M.rates[0] + nA * (M.rates[1] - M.rates[0])) / M.trou, f = fw(t);
      let ecart, mini, maxi;
      if (q.k) { // bon coup, sur le fairway : les meilleurs au milieu, le premier à être remplacé tout au bord
        ecart = q.k === "r" ? f - R - 1 : (1 - nC) * (f - R - 6);
        mini = 0; maxi = () => Math.max(0, f - R - 1);
      } else { // coup raté : franchement de travers, jusque dans le lac, les bunkers ou les arbres
        ecart = f + R + 12 + (1 - nA) * 38;
        mini = f + R + 8; maxi = (sg) => Math.max(mini, sg < 0 ? rg(t, sg) - R - 2 : rg(t, sg) + 14);
      }
      const essais = []; // la place idéale, puis de plus en plus loin si elle est prise
      for (let s = 0; s < 8; s++) for (const sg of [cote, -cote]) for (const de of s ? [s, -s] : [0]) for (const dt of s > 2 ? [0, s - 2, 2 - s] : [0])
        essais.push(A.P(t + dt * (R + 2) / A.L, sg * borne(Math.max(0, ecart) + de * (R * 2 + 3), mini, maxi(sg))));
      posees.push({ q, s: essais.find(libre) || essais[0], t });
      cote = -cote;
    });

    /* les coups partent dans l'ordre des semaines : la trajectoire se trace, puis la balle se pose */
    const tee = A.P(0, 0);
    posees.sort((a, b) => parties.indexOf(a.q) - parties.indexOf(b.q));
    h += posees.map((b, i) => {
      const mx = (tee[0] + b.s[0]) / 2, my = (tee[1] + b.s[1]) / 2, ax = A.P(b.t * 0.55, 0);
      return `<path class="tir-v ${b.q.k}" data-w="${b.q.w.semaine}" pathLength="1" style="--d:${(i * 0.13).toFixed(2)}s" d="M${pp(tee)}Q${f1(mx + (ax[0] - mx) * 0.45)} ${f1(my + (ax[1] - my) * 0.45)} ${pp(b.s)}"/>`;
    }).join("");
    const g = A.P(1, 0);
    h += `<ellipse class="t-trou" cx="${f1(g[0])}" cy="${f1(g[1])}" rx="4.5" ry="3.4"/><line class="t-mat" x1="${f1(g[0])}" y1="${f1(g[1])}" x2="${f1(g[0])}" y2="${f1(g[1] - 26)}"/><path class="t-fanion" d="M${f1(g[0])} ${f1(g[1] - 26)}l15 5-15 5Z"/>`;
    h += posees.map((b, i) => `<g class="balle-v ${b.q.k}" data-w="${b.q.w.semaine}" tabindex="0" role="img" aria-label="${esc(texte(detailPartie(b.q.w, ligne)))}" style="--d:${(i * 0.13 + 0.45).toFixed(2)}s">` +
      `<circle cx="${f1(b.s[0])}" cy="${f1(b.s[1])}" r="${f1(R)}"/><text x="${f1(b.s[0])}" y="${f1(b.s[1] + corps * 0.36)}" font-size="${f1(corps)}">${b.q.w.semaine}</text></g>`).join("");

    boite.innerHTML = `<svg viewBox="${f1(vx)} ${f1(vy)} ${f1(vw)} ${f1(vh)}" role="group" aria-label="Les points de chaque partie, dessinés comme des coups de départ sur un trou de golf">${h}</svg>`;
    detailAuSurvol(boite, ".balle-v", $("#trou-info"), (w) => detailPartie(parties.find((x) => x.w.semaine === +w).w, ligne));
  }

  /* l'évolution du handicap de jeu : un point par semaine jouée */
  function handicap(p) {
    const boite = $("#hdc"), info = $("#hdc-info"), hist = p.hdc_historique || [];
    if (hist.length < 2) { boite.innerHTML = `<p class="expl">Handicap de jeu de départ : ${nb(p.hdc_depart)}. Il bouge à la fin de chaque semaine jouée.</p>`; info.hidden = true; return; }
    const parSem = {};
    p.semaines.forEach((w) => { parSem[w.semaine] = w; });
    const W = boite.clientWidth, H = 170, G = 30, D = 14, T = 18, B = 28, vs = hist.map((h) => h.hdc), mn = Math.min(...vs), mx = Math.max(...vs), etendue = mx - mn || 1;
    const x = (i) => G + i * (W - G - D) / (hist.length - 1), y = (v) => T + (mx - v) * (H - T - B) / etendue;
    const detail = (h) => {
      const w = parSem[h.semaine];
      if (h.semaine === 0 || !w) return `<b>${h.semaine === 0 ? "Départ" : P() + h.semaine}</b><br>Handicap de jeu : ${nb(h.hdc)}`;
      return `<b>${P()}${h.semaine} · ${esc(w.parcours)}</b><br>Handicap de jeu : ${nb(w.hdc_avant)} → ${nb(w.hdc_apres)} · ${w.points_net} points nets (Stableford net ${w.stableford_net})`;
    };
    boite.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="group" aria-label="Évolution du handicap de jeu : ${nb(vs[0])} au départ, ${nb(vs[vs.length - 1])} actuellement">
      <text x="4" y="${T + 4}">${nb(mx)}</text><text x="4" y="${H - B + 4}">${nb(mn)}</text>
      <path class="ligne" pathLength="1" d="${hist.map((h, i) => (i ? "L" : "M") + x(i).toFixed(1) + " " + y(h.hdc).toFixed(1)).join("")}"/>
      ${hist.map((h, i) => `<g class="pt${i === hist.length - 1 ? " dernier" : ""}" data-w="${h.semaine}" tabindex="0" role="img" aria-label="${esc(texte(detail(h)))}"><circle class="zone" cx="${x(i)}" cy="${y(h.hdc)}" r="15"/><circle class="point" cx="${x(i)}" cy="${y(h.hdc)}" r="4.5"/></g>`).join("")}
      ${hist.map((h, i) => (i === 0 || i === hist.length - 1 || hist.length < 9 ? `<text x="${x(i)}" y="${H - 8}" text-anchor="middle">${h.semaine === 0 ? "départ" : P() + h.semaine}</text>` : "")).join("")}
    </svg>`;
    detailAuSurvol(boite, ".pt", info, (w) => detail(hist.find((h) => h.semaine === +w)));
  }

  /* ───────── Défilement : tout ce qui suit la position de la page, image par image ───────── */
  const NS = "http://www.w3.org/2000/svg";

  /* le fil rouge : une trajectoire qui traverse toute la page ; la balle reste à hauteur des yeux
     et change de côté d'un grand coup à chaque nouvelle section, jusqu'au trou tout en bas */
  function initFil(main, coup) {
    if (CALME) return { maj: () => false, construire() {} };
    const hero = $(".hero"), svg = document.createElementNS(NS, "svg");
    svg.id = "fil"; svg.setAttribute("aria-hidden", "true");
    main.insertBefore(svg, main.firstChild);
    let L = 0, L0 = 0, i0 = 0, ys = [], cur = -1, trace, tete, balle;

    function construire() {
      const W = main.clientWidth, H = main.offsetHeight, blocs = $$(".bloc", main).filter((b) => !b.hidden);
      const gx = Math.max(10, (W - $(".wrap", main).clientWidth) / 4), c = borne(W * 0.09, 60, 110);
      const x = (cote) => (cote > 0 ? W - gx : gx);
      /* départ : le trou du coup d'ouverture, à droite ; la balle y tombe, puis descend le long du côté droit de l'écran */
      const dep = coup.depart(), xl = dep.x, yl = hero.getBoundingClientRect().top + dep.y - main.getBoundingClientRect().top, xd = x(1);
      const d0 = `M${xl} ${yl}C${xl} ${yl * 0.45} ${xd} ${yl * 0.55} ${xd} 0`;
      let cote = 1, d = "";
      for (let i = 1; i < blocs.length; i++) {
        const b = blocs[i].offsetTop;
        d += `L${x(cote)} ${b - c}C${x(cote)} ${b} ${x(-cote)} ${b} ${x(-cote)} ${b + c}`;
        cote = -cote;
      }
      const xf = x(cote), yf = H - 40;
      d += `L${xf} ${yf}`;
      svg.setAttribute("width", W); svg.setAttribute("height", H); svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
      svg.innerHTML = `<path class="fil-fond" d="M${xd} 0${d}"/><path class="fil-trace" d="${d0}${d}"/><path class="fil-tete" d="${d0}${d}"/>` +
        `<ellipse class="fil-trou" cx="${xf}" cy="${yf + 3}" rx="11" ry="5"/><line class="fil-mat" x1="${xf}" y1="${yf + 3}" x2="${xf}" y2="${yf - 42}"/>` +
        `<path class="fil-fanion" style="transform-origin:${cote > 0 ? "right" : "left"} center" d="M${xf} ${yf - 42}l${-cote * 19} 6.5 ${cote * 19} 6.5Z"/><circle class="fil-balle" r="5.5"/>`;
      trace = $(".fil-trace", svg); tete = $(".fil-tete", svg); balle = $(".fil-balle", svg);
      L = trace.getTotalLength();
      const essai = document.createElementNS(NS, "path");
      essai.setAttribute("d", d0); svg.appendChild(essai); L0 = essai.getTotalLength(); svg.removeChild(essai);
      const n = Math.ceil(L / 6);
      ys = new Float32Array(n + 1);
      for (let i = 0; i <= n; i++) ys[i] = trace.getPointAtLength(L * i / n).y;
      i0 = Math.min(n - 1, Math.ceil(L0 / L * n));
      trace.style.strokeDasharray = L; tete.style.strokeDasharray = "90 " + L * 2;
      trace.style.strokeDashoffset = L; tete.style.opacity = balle.style.opacity = 0; // rien n'est tracé avant le premier calcul
      cur = -1;
    }

    /* longueur de trajectoire qui correspond à une hauteur dans la page (après le rebond, la courbe ne remonte jamais) */
    function longueur(y) {
      let a = i0, b = ys.length - 1;
      if (y <= ys[a]) return L0;
      if (y >= ys[b]) return L;
      while (b - a > 1) { const m = (a + b) >> 1; if (ys[m] < y) a = m; else b = m; }
      return L * (a + (y - ys[a]) / ((ys[b] - ys[a]) || 1)) / (ys.length - 1);
    }

    function maj(vh, direct) {
      if (!L) return false;
      const r = main.getBoundingClientRect(), y = window.scrollY, reste = document.documentElement.scrollHeight - y - vh;
      let hauteur = vh * 0.56 - r.top, cible;
      if (hauteur <= 0 && !coup.estArrivee()) cible = 0; // la balle vole encore sur le premier coup (initCoup)
      else if (hauteur <= 0) { // elle vient de tomber dans le trou : elle descend jusqu'à la page
        const jonction = r.top + y - vh * 0.56, r0 = retour(jonction);
        cible = L0 * (jonction > r0 ? borne((y - r0) / (jonction - r0), 0, 1) : 1);
      } else {
        if (reste < 260) hauteur += (1 - Math.max(0, reste) / 260) * Math.max(0, r.height - hauteur); // tout en bas, la balle va jusqu'au trou
        cible = longueur(hauteur);
      }
      if (cur < 0 || direct) cur = cible;
      const ecart = cible - cur;
      cur = Math.abs(ecart) < 0.6 ? cible : cur + ecart * 0.16;
      trace.style.strokeDashoffset = L - cur; tete.style.strokeDashoffset = 90 - cur;
      const pt = trace.getPointAtLength(cur), fin = cur >= L - 1;
      balle.setAttribute("cx", pt.x); balle.setAttribute("cy", pt.y);
      balle.style.opacity = tete.style.opacity = cur <= 0.5 || fin ? 0 : 1;
      svg.classList.toggle("fin", fin);
      coup.partir(cur > 0.5);
      return cur !== cible;
    }

    construire();
    let attente = 0;
    new ResizeObserver(() => { cancelAnimationFrame(attente); attente = requestAnimationFrame(() => { construire(); rafraichir(); }); }).observe(main);
    return { maj, construire };
  }

  /* le trou de la semaine se dessine au rythme du défilement, puis la balle joue ses deux coups */
  function initTrou(fig) {
    if (CALME || !fig) return () => {};
    fig.classList.add("scrub");
    const un = (sel) => $(sel, fig);
    const traits = $$(".niveaux path", fig).map((el, i) => ({ el, a: i * 0.05, b: 0.34 + i * 0.05 }))
      .concat([{ el: un(".fairway"), a: 0.08, b: 0.44 }, { el: un(".eau"), a: 0.16, b: 0.44 }, { el: un(".green"), a: 0.24, b: 0.52 }])
      .concat($$(".bunker", fig).map((el, i) => ({ el, a: 0.3 + i * 0.04, b: 0.5 + i * 0.04 })));
    const groupes = [[".departs", 0.06], [".arbres", 0.3], [".vagues", 0.42], [".drapeau", 0.5], [".point", 0.74]].map(([s, a]) => ({ el: un(s), a }));
    const tirs = $$(".tir", fig), vol = un(".vol"), L1 = tirs[0].getTotalLength(), L2 = tirs[1].getTotalLength();
    let dernier = -1;
    return function (vh) {
      const r = fig.getBoundingClientRect();
      if (r.bottom < -80 || r.top > vh + 80) return;
      const p = borne((vh * 0.92 - r.top) / (vh * 0.74), 0, 1);
      if (p === dernier) return;
      dernier = p;
      traits.forEach((t) => {
        t.el.style.strokeDashoffset = 1 - borne((p - t.a) / (t.b - t.a), 0, 1);
        t.el.style.fillOpacity = borne((p - t.b + 0.1) / 0.16, 0, 1);
      });
      groupes.forEach((g) => { g.el.style.opacity = borne((p - g.a) / 0.08, 0, 1); });
      const q1 = borne((p - 0.52) / 0.2, 0, 1), q2 = borne((p - 0.76) / 0.2, 0, 1);
      tirs[0].style.strokeDashoffset = 1 - q1; tirs[1].style.strokeDashoffset = 1 - q2;
      const pt = q2 > 0 ? tirs[1].getPointAtLength(L2 * q2) : tirs[0].getPointAtLength(L1 * q1);
      vol.setAttribute("cx", pt.x); vol.setAttribute("cy", pt.y);
      vol.style.opacity = p < 0.46 || q2 >= 1 ? 0 : 1;
    };
  }

  function initDefilement(ciel, coup) {
    const haut = $("#haut"), txt = $("#hero-txt"), hero = $(".hero"), lignes = $$("h1 .ligne"), relief = $("#relief");
    const main = $("main"), podium = $("#podium"), saison = $("#saison"), glisse = $("#bandeau-glisse"), piste = $("#bandeau");
    let dernierY = window.scrollY, vit = 0, enCours = false, decalage = 0, pin = estEpingle(), direct = true;

    /* grands numéros fantômes derrière chaque section : ils défilent moins vite que le contenu */
    if (!CALME) $$(".bloc", main).forEach((b) => {
      const n = $(".repere b", b);
      if (!n) return;
      const f = document.createElement("span");
      f.className = "fantome"; f.setAttribute("aria-hidden", "true"); f.textContent = n.textContent;
      const hote = $(".epingle-in", b) || b;
      hote.insertBefore(f, hote.firstChild);
    });
    const fantomes = $$(".fantome", main).map((f) => ({ f, bloc: f.closest(".bloc") }));
    const fil = initFil(main, coup), trou = initTrou($(".trou"));

    function image() {
      const y = window.scrollY, vh = window.innerHeight;
      vit += (y - dernierY - vit) * 0.3; dernierY = y;
      if (Math.abs(vit) < 0.05) vit = 0;
      let encore = vit !== 0;
      haut.classList.toggle("colle", y > 24);

      if (!CALME) {
        /* ouverture : le titre s'ouvre en deux, le relief grossit, la neige suit le mouvement */
        const hh = hero.offsetHeight;
        if (y < hh * 1.1) {
          txt.style.transform = `translateY(${(y * 0.2).toFixed(1)}px)`;
          txt.style.opacity = borne(1 - y / (hh * 0.62), 0, 1).toFixed(3);
          lignes[0].style.transform = `translateX(${(-y * 0.14).toFixed(1)}px)`;
          lignes[1].style.transform = `translateX(${(y * 0.14).toFixed(1)}px)`;
          relief.style.transform = `scale(${(1 + y / hh * 0.22).toFixed(3)})`;
        }
        /* le premier coup se joue en défilant : la balle part de la gauche et vole jusqu'au trou, à droite */
        if (coup.avancer(borne(y / retour(main.getBoundingClientRect().top + y - vh * 0.56), 0, 1))) encore = true;
        ciel.vent(vit);

        /* bandeau : il accélère, ou repart en arrière, avec le défilement */
        const quart = piste.scrollWidth / 4;
        if (quart) {
          decalage = (decalage - vit * 0.9) % quart;
          if (decalage > 0) decalage -= quart;
          glisse.style.transform = `translateX(${decalage.toFixed(1)}px)`;
        }

        /* lignes et cartes : elles entrent et sortent selon leur place à l'écran */
        const animes = $$(".sc"), mesures = animes.map((el) => el.getBoundingClientRect()); // on mesure tout d'abord, on écrit ensuite
        animes.forEach((el, i) => {
          const r = mesures[i], dy = +el.dataset.dy || 0, haut0 = r.top - (1 - (el._s == null ? 1 : el._s)) * dy;
          const s = borne(Math.min((vh * 0.96 - haut0) / (vh * 0.22), (r.bottom - 56) / 120), 0, 1);
          if (s !== el._s) { el._s = s; el.style.setProperty("--s", s.toFixed(3)); }
        });

        /* scènes des règles : --v va de 0 (la scène entre en bas de l'écran) à 1 (elle sort en haut) */
        const scenes = $$(".vue"), cadres = scenes.map((el) => el.getBoundingClientRect());
        scenes.forEach((el, i) => {
          const r = cadres[i];
          if (r.bottom < -60 || r.top > vh + 60) return;
          const v = borne((vh - r.top) / (vh + r.height), 0, 1);
          el.style.setProperty("--v", v.toFixed(3));
          if (el.dataset.scene === "points") { // la balle glisse sur la règle : 18 points Stableford = 100 points, 10 de plus ou de moins par point, minimum 30
            const st = 9 + Math.round(borne((v - 0.25) / 0.45, 0, 1) * 18);
            if (st !== el._st) { el._st = st; $(".s", el).textContent = st; $(".p", el).textContent = Math.max(30, 100 + (st - 18) * 10); }
          }
          if (el.dataset.scene === "zero") { // Short Game : le handicap descend jusqu'à 0
            const z = Math.round((1 - borne((v - 0.25) / 0.45, 0, 1)) * 18);
            if (z !== el._z) { el._z = z; $(".z", el).textContent = z; }
          }
        });

        const rp = podium.getBoundingClientRect();
        if (rp.bottom > 0 && rp.top < vh) podium.style.setProperty("--py", ((rp.top + rp.height / 2 - vh / 2) * 0.16).toFixed(1));
        fantomes.forEach(({ f, bloc }) => {
          const r = bloc.getBoundingClientRect();
          if (r.bottom > -200 && r.top < vh + 200) f.style.setProperty("--f", (borne(vh * 0.5 - r.top, -vh, vh * 3) * 0.2).toFixed(1));
        });

        trou(vh);
        const hz = $("#hz"); // les parcours déjà joués arrivent en glissant
        if (hz) {
          const r = hz.getBoundingClientRect();
          if (r.bottom > -40 && r.top < vh + 40) hz.firstElementChild.style.setProperty("--hx", ((1 - borne((vh * 0.98 - r.top) / (vh * 0.5), 0, 1)) * 160).toFixed(1));
        }

        /* la saison se déroule en faisant défiler, pendant que la section reste épinglée */
        if (pin && courseAvancer) {
          const r = saison.getBoundingClientRect(), p = borne(-r.top / ((r.height - vh) * 0.92), 0, 1);
          if (p !== courseP) { courseP = p; courseAvancer(p); }
        }

        /* les grands chiffres montent avec le défilement */
        $$("#chiffres b[data-n]").forEach((b) => {
          const p = borne((vh * 0.97 - b.getBoundingClientRect().top) / (vh * 0.42), 0, 1), v = Math.round(+b.dataset.n * (1 - (1 - p) * (1 - p)));
          if (v !== b._v) { b._v = v; b.textContent = nb(v); }
        });

        if (fil.maj(vh, direct)) encore = true;
      }
      direct = false;
      if (encore) requestAnimationFrame(image); else enCours = false;
    }
    function lancer() { if (!enCours) { enCours = true; requestAnimationFrame(image); } }
    window.addEventListener("scroll", lancer, { passive: true });
    lancer();
    return { rafraichir: lancer, taille() { pin = estEpingle(); fil.construire(); direct = true; lancer(); } };
  }

  /* ───────── Adresses : #/classement?cat=Femmes&kind=brut&comp=sg, comme sur le site actuel ───────── */
  const ROUTES = ["parcours", "classement", "saison", "stats", "semaines", "joueurs", "regles"];
  let routeActive = "";
  function lireAdresse() {
    const parts = location.hash.replace(/^#\/?/, "").split("?");
    return { route: ROUTES.indexOf(parts[0]) >= 0 ? parts[0] : "", params: Object.fromEntries(new URLSearchParams(parts[1] || "")) };
  }
  function ecrireAdresse(route) {
    const p = {};
    if (etat.cat && data.categories.length > 1 && etat.cat !== data.categories[0].nom) p.cat = etat.cat;
    if (!brutSeul() && etat.mode === "brut") p.kind = "brut";
    if (etat.comp !== "wc") p.comp = etat.comp;
    const q = new URLSearchParams(p).toString();
    history.replaceState(null, "", "#/" + (route || routeActive || "classement") + (q ? "?" + q : ""));
  }
  /* applique les réglages lus dans l'adresse ; renvoie vrai si quelque chose a changé */
  function appliquer(params) {
    const avant = [etat.comp, etat.cat, etat.mode].join("|");
    if ((params.comp || "wc") !== etat.comp) choisirComp(params.comp || "wc");
    if (params.cat && data.categories.some((c) => c.nom === params.cat)) etat.cat = params.cat;
    etat.mode = params.kind === "brut" ? "brut" : "net";
    return avant !== [etat.comp, etat.cat, etat.mode].join("|");
  }
  /* aller à une section (menu, liens internes) : l'adresse suit, la page défile, la visite est comptée */
  function aller(route) {
    const cible = document.getElementById(route);
    if (!cible) return;
    ecrireAdresse(route);
    cible.scrollIntoView({ behavior: CALME ? "auto" : "smooth" });
    visite(route);
  }

  /* ───────── Compteur de visites (compteur.php, sans cookie) ─────────
     Une page vue = l'arrivée sur le site ou l'ouverture d'une section par le menu. Seulement sur le vrai site : ni en aperçu local,
     ni sur la télé (qui n'utilise pas ce fichier). « ?compter=non » exclut ce navigateur (Mike, le capitaine), « ?compter=oui » l'y remet. */
  const HOTE_COMPTE = "winterchallenge.letsgolf.ch";
  function sansCompteur() {
    try {
      const q = new URLSearchParams(location.search).get("compter");
      if (q === "non") localStorage.setItem("wc_pas_compter", "1");
      if (q === "oui") localStorage.removeItem("wc_pas_compter");
      return localStorage.getItem("wc_pas_compter") === "1";
    } catch (e) { return false; }
  }
  const pasCompter = location.hostname !== HOTE_COMPTE || sansCompteur();
  function visite(route) {
    if (pasCompter) return;
    const tactileMac = navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent) ? "&t=1" : "";
    new Image().src = `compteur.php?p=${encodeURIComponent(route || "classement")}&c=${encodeURIComponent(etat.comp)}${tactileMac}&r=${Date.now()}`;
  }

  /* ───────── Mise en route ───────── */
  /* tout ce qui dépend de la compétition affichée (Winter Challenge ou Short Game) */
  let coupHaut = null, majDefilement = () => {};
  function dessinerTout() {
    const sem = semaineCourante(), u = unite();
    $$("#comp button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.comp === etat.comp));
    const lien = $('.menu a[data-route="semaines"]');
    if (lien) lien.textContent = u.caps; // la section s'appelle « Mois » pour le Short Game
    /* le haut de page suit la compétition : son nom, son accroche, son record */
    $$("#titre .ligne > span").forEach((s, i) => { s.textContent = i ? data.nom.split(" ").slice(1).join(" ") : data.nom.split(" ")[0]; });
    $("#accroche").textContent = brutSeul()
      ? `Le petit jeu du Let's Golf : ${meilleursN()} parcours, un par mois, en score brut. Tes ${meilleursN()} résultats comptent tous.`
      : "Les championnats du Let's Golf : classements, parcours de la semaine et résultats, à consulter quand tu veux.";
    $("#lien-parcours").textContent = "Le parcours " + u.fin;
    if (coupHaut) { coupHaut.changer(recordPour(comps.find((c) => c.id === etat.comp) || comps[0])); majDefilement(); }
    bandeau(sem); parcoursVue(sem); enBref(sem); outils(); dessinerClassement(false); dessinerCourse(false);
    stats(); chiffres(); semainesVue(); joueursVue(); reglesVue();
    $$(".rv").forEach((el) => { if (!el.dataset.vu) voir(el); });
    rafraichir();
  }

  function demarrer() {
    const wc = comps[0];
    $("#saison-label").textContent = brutes.saison;
    $("#maj").textContent = "Mis à jour le " + horodatage(brutes.genere_le);
    $("#demo").hidden = !brutes.demo;
    if (!wc.semaines.length) {
      document.body.classList.add("pret");
      $("#coup").style.display = "none"; $("#record").hidden = true;
      $("main").innerHTML = '<p class="wrap vide grand">La saison n\'a pas encore commencé.</p>';
      initCiel();
      return;
    }
    const adresse = lireAdresse();
    choisirComp("wc");
    appliquer(adresse.params);

    const ciel = initCiel();
    apresTheme = () => { ciel.taille(); dessinerCourse(false); reglesVue(); };
    const coup = initCoup(recordPour(comps.find((c) => c.id === etat.comp) || wc), ciel);
    coupHaut = coup;

    const choix = $("#comp");
    choix.hidden = comps.length < 2;
    choix.innerHTML = comps.map((c) => `<button type="button" data-comp="${esc(c.id)}" aria-pressed="false">${esc(c.nom)}</button>`).join("");
    $$(".titre").forEach((t) => titre(t, t.textContent));
    dessinerTout();
    voir($("#podium"));
    voir($("#course"), lancerCourse);

    /* les clics : joueurs, liens internes, légende de la course, compétition */
    document.addEventListener("click", (e) => {
      const lien = e.target.closest('a[href^="#/"]');
      if (lien) { e.preventDefault(); aller(lien.getAttribute("href").slice(2).split("?")[0]); return; }
      const b = e.target.closest("[data-joueur]");
      if (b) ouvrirFiche(b.dataset.joueur);
      const s = e.target.closest("#course-legende li button");
      if (s) choisirSerie({ g: +s.dataset.g, s: +s.dataset.s });
      if (e.target.closest(".fermer")) fermerFiche();
      const c = e.target.closest("#comp button");
      if (c && c.dataset.comp !== etat.comp) { choisirComp(c.dataset.comp); dessinerTout(); ecrireAdresse(); }
    });
    $("#seg-cat").addEventListener("click", (e) => {
      const b = e.target.closest("button[data-cat]");
      if (!b || b.dataset.cat === etat.cat) return;
      etat.cat = b.dataset.cat; etat.sem = null;
      outils(); dessinerClassement(false); stats(); ecrireAdresse();
    });
    $("#seg-mode").addEventListener("click", (e) => {
      const b = e.target.closest("button[data-mode]");
      if (!b || b.dataset.mode === etat.mode) return;
      etat.mode = b.dataset.mode;
      outils(); enBref(semaineCourante()); dessinerClassement(true); dessinerCourse(true); ecrireAdresse();
    });
    $("#q").addEventListener("input", (e) => { etat.q = e.target.value; dessinerClassement(false); });
    $("#stats-sem").addEventListener("change", (e) => { etat.sem = Number(e.target.value); stats(); });
    $("#pcats").addEventListener("click", (e) => {
      const b = e.target.closest("button[data-pcat]");
      if (!b) return;
      etat.pcat = b.dataset.pcat;
      $$("button", $("#pcats")).forEach((x) => x.setAttribute("aria-pressed", x === b));
      dessinerJoueurs();
    });
    $("#pq").addEventListener("input", (e) => { etat.pq = e.target.value; dessinerJoueurs(); });
    $("#course-legende").addEventListener("change", (e) => {
      const c = e.target.closest("input[data-g]");
      if (!c) return;
      courseVisibles[+c.dataset.g] = c.checked;
      if (c.checked) courseColonne = +c.dataset.g;
      dessinerCourse(false);
    });
    const fiche = $("#fiche");
    fiche.addEventListener("click", (e) => { if (e.target === fiche) fermerFiche(); });
    fiche.addEventListener("cancel", (e) => { e.preventDefault(); fermerFiche(); });

    /* tout ce qui suit le défilement, puis la section active du menu */
    const defilement = initDefilement(ciel, coup);
    rafraichir = defilement.rafraichir;
    majDefilement = defilement.taille;

    /* les cartes des joueurs penchent vers le pointeur, et un reflet le suit */
    const plist = $("#plist");
    plist.addEventListener("pointermove", (e) => {
      const c = e.target.closest(".pcarte");
      if (CALME || e.pointerType !== "mouse" || !c) return;
      const r = c.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
      c.style.setProperty("--ry", ((x - 0.5) * 14).toFixed(1)); c.style.setProperty("--rx", ((0.5 - y) * 12).toFixed(1));
      c.style.setProperty("--mx", (x * 100).toFixed(0)); c.style.setProperty("--my", (y * 100).toFixed(0));
    });
    plist.addEventListener("pointerout", (e) => {
      const c = e.target.closest(".pcarte");
      if (c && !c.contains(e.relatedTarget)) { c.style.setProperty("--rx", 0); c.style.setProperty("--ry", 0); }
    });
    const liens = $$(".menu a[data-route]");
    const ioSection = new IntersectionObserver((es) => es.forEach((e) => {
      if (!e.isIntersecting) return;
      routeActive = e.target.id;
      liens.forEach((a) => (a.dataset.route === e.target.id ? a.setAttribute("aria-current", "true") : a.removeAttribute("aria-current")));
    }), { rootMargin: "-45% 0px -50% 0px" });
    $$("main section[id]").forEach((s) => ioSection.observe(s));

    /* adresse modifiée à la main, ou retour en arrière */
    window.addEventListener("hashchange", () => {
      const a = lireAdresse();
      if (appliquer(a.params)) dessinerTout();
      if (a.route) document.getElementById(a.route).scrollIntoView({ behavior: CALME ? "auto" : "smooth" });
      visite(a.route);
    });

    let largeur = window.innerWidth, minuterie = 0;
    window.addEventListener("resize", () => {
      clearTimeout(minuterie);
      minuterie = setTimeout(() => {
        if (window.innerWidth === largeur) return;
        largeur = window.innerWidth;
        ciel.taille(); coup.construire(); defilement.taille(); dessinerCourse(false); curseur($("#seg-cat")); curseur($("#seg-mode"));
        $("#liste-zone").classList.toggle("defile", $("#liste-zone").scrollWidth > $("#liste-zone").clientWidth + 1);
      }, 180);
    });

    const pret = () => {
      document.body.classList.add("pret");
      curseur($("#seg-cat")); curseur($("#seg-mode"));
      coup.construire(); defilement.taille();
      if (adresse.route) document.getElementById(adresse.route).scrollIntoView({ behavior: "auto" }); // lien direct vers une section
      setTimeout(coup.annoncer, 800);
    };
    (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(pret, pret);
    visite(adresse.route);
  }

  /* les mêmes données que le site actuel et la page télé : donnees/saison.json, tenu à jour toutes les 5 minutes environ */
  fetch("donnees/saison.json?v=" + Date.now())
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then((json) => {
      brutes = json;
      comps = [Object.assign({ id: "wc" }, json)].concat((json.competitions_autres || []).map((c) => Object.assign({}, c, { id: String(c.prefixe).toLowerCase() })));
      demarrer();
    })
    .catch((err) => {
      document.body.classList.add("pret");
      $("main").innerHTML = '<p class="wrap vide grand">Impossible de charger les données pour le moment. Réessaie dans quelques minutes.</p>';
      console.error(err);
    });
})();
