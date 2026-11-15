<?php
/* Statistiques de visite du site des joueurs, réservées à Mike et au capitaine (mot de passe).
 *
 * Lit visites/AAAA-MM.csv, écrit par compteur.php. Le mot de passe n'est pas ici : seule son empreinte (PBKDF2) est dans
 * stats-cle.php, créé par scripts/mot_de_passe_stats.py. Ouvrir cette page exclut aussi ce navigateur du compteur.
 */

date_default_timezone_set('Europe/Zurich');
header('Cache-Control: no-store');
header('X-Robots-Tag: noindex, nofollow');
header('Content-Type: text/html; charset=utf-8');

session_set_cookie_params(['lifetime' => 0, 'path' => '/', 'secure' => true, 'httponly' => true, 'samesite' => 'Strict']);
session_name('wc_stats');
session_start();

function h($s) { return htmlspecialchars((string) $s, ENT_QUOTES, 'UTF-8'); }
function n($x) { return number_format($x, 0, '.', "'"); }
function jour($iso) { return date('d.m.Y', strtotime($iso)); }

const MOIS = ['', 'janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const JOURS = ['', 'lu', 'ma', 'me', 'je', 've', 'sa', 'di'];
const NOMS_PAGES = ['classement' => 'Classement', 'parcours' => 'Parcours', 'saison' => 'Course au titre', 'stats' => 'Statistiques',
    'semaines' => 'Semaines / mois', 'joueurs' => 'Joueurs', 'regles' => 'Règles', 'autre' => 'Autre'];
const NOMS_APPAREILS = ['mobile' => 'Mobile', 'ordinateur' => 'Ordinateur', 'tablette' => 'Tablette'];
const NOMS_COMPS = ['wc' => 'Winter Challenge', 'sg' => 'Short Game', 'autre' => 'Autre'];

function mot_de_passe_ok($mdp)
{
    $fichier = __DIR__ . '/stats-cle.php';
    if (!file_exists($fichier)) return null;
    $cle = include $fichier;
    $calcul = hash_pbkdf2('sha256', $mdp, hex2bin($cle['sel']), (int) $cle['iterations'], 0, false);
    return hash_equals($cle['empreinte'], $calcul);
}

/* ---------- Connexion ---------- */
$erreur = '';
if (isset($_GET['sortir'])) {
    $_SESSION = [];
    session_destroy();
    header('Location: stats.php');
    exit;
}
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $ok = mot_de_passe_ok((string) ($_POST['mdp'] ?? ''));
    if ($ok === null) {
        $erreur = "Le mot de passe n'a pas encore été choisi (scripts/mot_de_passe_stats.py).";
    } elseif ($ok) {
        session_regenerate_id(true);
        $_SESSION['ok'] = true;
        header('Location: stats.php');
        exit;
    } else {
        sleep(2);
        $erreur = 'Mot de passe incorrect.';
    }
}
$connecte = !empty($_SESSION['ok']);

/* ---------- Lecture des visites ---------- */
$fichiers = glob(__DIR__ . '/visites/*.csv') ?: [];
$mois_dispo = array_map(function ($f) { return basename($f, '.csv'); }, $fichiers);
rsort($mois_dispo);
$mois = (string) ($_GET['mois'] ?? ($mois_dispo[0] ?? date('Y-m')));
if (!in_array($mois, $mois_dispo, true)) $mois = $mois_dispo[0] ?? date('Y-m');

$par_jour = [];     // date => ['vues' => n, 'visiteurs' => [code => true]]
$par_semaine = [];  // lundi => idem
$pages = []; $comps = []; $heures = array_fill(0, 24, 0);
$appareils = []; $systemes = []; $vus = [];   // appareil et système comptés une fois par visiteur et par jour
$total_vues = 0;
if ($connecte && in_array($mois, $mois_dispo, true)) {
    $f = fopen(__DIR__ . '/visites/' . $mois . '.csv', 'r');
    while (($l = fgets($f)) !== false) {
        $c = explode(';', trim($l));
        if (count($c) < 6) continue;
        [$quand, $page, $comp, $app, $sys, $qui] = $c;
        $j = substr($quand, 0, 10);
        $lundi = date('Y-m-d', strtotime($j . ' -' . (date('N', strtotime($j)) - 1) . ' days'));
        $total_vues++;
        $par_jour[$j]['vues'] = ($par_jour[$j]['vues'] ?? 0) + 1;
        $par_jour[$j]['visiteurs'][$qui] = true;
        $par_semaine[$lundi]['vues'] = ($par_semaine[$lundi]['vues'] ?? 0) + 1;
        $par_semaine[$lundi]['visiteurs'][$j . $qui] = true;
        $pages[$page] = ($pages[$page] ?? 0) + 1;
        $comps[$comp] = ($comps[$comp] ?? 0) + 1;
        $heures[(int) substr($quand, 11, 2)]++;
        if (!isset($vus[$j . $qui])) {
            $vus[$j . $qui] = true;
            $appareils[$app] = ($appareils[$app] ?? 0) + 1;
            $systemes[$sys] = ($systemes[$sys] ?? 0) + 1;
        }
    }
    fclose($f);
    ksort($par_jour); ksort($par_semaine); arsort($pages); arsort($comps); arsort($appareils); arsort($systemes);
}
$total_visiteurs = count($vus);

/* Une ligne de tableau avec une barre proportionnelle (elle grandit à l'affichage, l'une après l'autre) */
function barre($libelle, $valeur, $max, $extra = '')
{
    static $i = 0;
    $pc = $max > 0 ? round(100 * $valeur / $max) : 0;
    return '<tr><th scope="row">' . $libelle . '</th><td class="num">' . n($valeur) . '</td>' . $extra .
        '<td class="bar"><span style="width:' . $pc . '%;--i:' . ($i++ % 14) . '"></span></td></tr>';
}
function repartition($titre, $valeurs, $noms = [])
{
    $total = array_sum($valeurs);
    $max = $valeurs ? max($valeurs) : 0;
    $html = '<section class="card rv"><h2>' . h($titre) . '</h2>';
    if (!$valeurs) return $html . '<p class="vide">Rien pour ce mois.</p></section>';
    $html .= '<table>';
    foreach ($valeurs as $k => $v) {
        $part = '<td class="num soft">' . round(100 * $v / $total) . ' %</td>';
        $html .= barre(h($noms[$k] ?? $k), $v, $max, $part);
    }
    return $html . '</table></section>';
}
?>
<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <meta name="color-scheme" content="dark">
  <meta name="theme-color" content="#00101e">
  <title>Visites · Winter Challenge</title>
  <link rel="icon" href="assets/icone-winter-challenge.svg" type="image/svg+xml">
  <style>
    /* Même habillage que le site (« Trajectoire ») : nuit d'hiver, bleu Let's Golf, la trajectoire de balle en fil conducteur */
    @font-face { font-family: "Figtree"; font-weight: 300 900; font-display: swap; src: url("assets/fonts/figtree-latin.woff2") format("woff2"); }
    :root {
      color-scheme: dark;
      --nuit: #00101e; --navy: #001c33; --glace: #eaf6fd; --ciel: #35abe2; --ciel-vif: #7fd4ff; --gris: #8fa8bb;
      --trait: rgba(234, 246, 253, .12); --trait-fort: rgba(234, 246, 253, .24); --corail: #ff8f80;
      --e: cubic-bezier(.16, 1, .3, 1);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0; min-height: 100vh; color: var(--glace); background: var(--nuit);
      background: radial-gradient(90vw 70vw at 0% -10%, rgba(53, 171, 226, .2), rgba(53, 171, 226, 0) 60%), linear-gradient(160deg, #00101e, #001c33 60%, #04233f) fixed;
      font: 16px/1.5 "Figtree", Helvetica, Arial, sans-serif; font-variant-numeric: tabular-nums; -webkit-font-smoothing: antialiased;
    }
    a { color: var(--ciel-vif); }
    .wrap { max-width: 1080px; margin: 0 auto; padding: 0 20px; }
    header { border-bottom: 1px solid var(--trait); }
    header .wrap { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px 24px; padding-top: 18px; padding-bottom: 18px; }
    header img { display: block; height: 30px; width: auto; filter: brightness(0) invert(1); }
    header nav { display: flex; gap: 20px; font-size: .92rem; font-weight: 600; }
    header nav a { color: var(--gris); text-decoration: none; }
    header nav a:hover, header nav a:focus-visible { color: var(--glace); }

    .tete { padding: 44px 0 26px; }
    .sur { font-size: .78rem; font-weight: 700; letter-spacing: .22em; text-transform: uppercase; color: var(--ciel-vif); }
    h1 { margin: 6px 0 0; font-size: clamp(2.2rem, 6vw, 3.8rem); line-height: 1; font-weight: 900; letter-spacing: -.03em; }
    h1 em { font-style: normal; font-weight: 300; color: var(--gris); }
    /* la trajectoire : un coup joué à l'ouverture de la page */
    .vol { display: block; width: 100%; height: 54px; margin-top: 18px; overflow: visible; }
    .vol .sol { stroke: var(--trait); stroke-width: 1; }
    .vol .arc { fill: none; stroke: var(--ciel); stroke-width: 2; stroke-linecap: round; stroke-dasharray: 2 7; }
    .vol .cache { fill: none; stroke: var(--nuit); stroke-width: 6; stroke-dasharray: 100; stroke-dashoffset: -100; animation: decouvre 1.8s .2s var(--e) both; }
    @keyframes decouvre { from { stroke-dashoffset: 0; } }

    main { padding-bottom: 60px; }
    .card { background: rgba(6, 42, 72, .5); border: 1px solid var(--trait); border-radius: 20px; padding: 20px 22px; margin-bottom: 18px; overflow-x: auto; }
    h2 { margin: 0 0 14px; font-size: .8rem; font-weight: 700; letter-spacing: .18em; text-transform: uppercase; color: var(--gris); }
    .rv { animation: monte .8s var(--e) both; animation-delay: calc(var(--d, 0) * 80ms); }
    @keyframes monte { from { opacity: 0; transform: translateY(18px); } }

    .choix { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 18px; }
    form.mois { display: flex; gap: 10px; align-items: center; color: var(--gris); font-weight: 600; }
    select, input, button { font: inherit; color: var(--glace); padding: 9px 16px; border-radius: 999px; border: 1px solid var(--trait-fort); background: rgba(0, 16, 30, .6); }
    select:focus-visible, input:focus-visible, button:focus-visible, a:focus-visible { outline: 2px solid var(--ciel); outline-offset: 2px; }
    button { background: var(--ciel); color: #00101e; font-weight: 700; border: 0; cursor: pointer; transition: transform .3s var(--e), background .2s; }
    button:hover { background: var(--ciel-vif); transform: translateY(-1px); }

    .kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 14px; margin-bottom: 18px; }
    .kpi { position: relative; background: rgba(6, 42, 72, .5); border: 1px solid var(--trait); border-radius: 20px; padding: 18px 20px 16px; overflow: hidden; }
    .kpi::before { content: ""; position: absolute; left: 0; top: 0; height: 3px; width: 100%; background: var(--ciel); transform-origin: left; animation: tire 1.2s var(--e) both; animation-delay: calc(var(--d, 0) * 80ms + .2s); }
    @keyframes tire { from { transform: scaleX(0); } }
    .kpi b { display: block; font-size: 2.9rem; line-height: 1; font-weight: 900; letter-spacing: -.03em; }
    .kpi span { display: block; margin-top: 6px; color: var(--gris); font-size: .9rem; }

    /* Jours du mois et heures de la journée : des colonnes fines, une seule couleur, la valeur au survol */
    .cols { display: flex; align-items: flex-end; gap: 3px; height: 150px; padding-top: 26px; }
    .cols > div { position: relative; flex: 1; min-width: 0; height: 100%; display: flex; align-items: flex-end; }
    .cols i { display: block; width: 100%; min-height: 2px; border-radius: 4px 4px 0 0; background: var(--ciel); transform-origin: bottom; animation: pousse .9s var(--e) both; animation-delay: calc(var(--i) * 22ms + .25s); }
    .cols i.zero { background: var(--trait-fort); }
    @keyframes pousse { from { transform: scaleY(0); } }
    .cols > div:hover i, .cols > div:focus i { background: var(--ciel-vif); }
    .cols > div::after { content: attr(data-t); position: absolute; left: 50%; top: -26px; transform: translateX(-50%); padding: 3px 9px; border-radius: 8px; background: #eaf6fd; color: #00101e; font-size: .78rem; font-weight: 700; white-space: nowrap; opacity: 0; pointer-events: none; transition: opacity .15s; z-index: 2; }
    .cols > div:hover::after, .cols > div:focus::after { opacity: 1; }
    .cols > div:first-child::after, .cols > div:nth-child(2)::after, .cols > div:nth-child(3)::after { left: 0; transform: none; }
    .cols > div:nth-last-child(-n+3)::after { left: auto; right: 0; transform: none; }
    .cols-l { display: flex; gap: 3px; margin-top: 6px; padding-top: 6px; border-top: 1px solid var(--trait); font-size: .72rem; color: var(--gris); }
    .cols-l span { flex: 1; min-width: 0; text-align: center; overflow: visible; white-space: nowrap; }

    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 0 18px; }
    table { width: 100%; border-collapse: collapse; font-size: .95rem; }
    th, td { padding: 8px 8px; border-bottom: 1px solid var(--trait); text-align: left; white-space: nowrap; font-weight: 500; }
    tr:last-child th, tr:last-child td { border-bottom: 0; }
    tbody th, table > tr th { font-weight: 600; }
    thead th { color: var(--gris); font-weight: 700; font-size: .72rem; letter-spacing: .12em; text-transform: uppercase; }
    .num { text-align: right; width: 1%; font-weight: 700; }
    .soft { color: var(--gris); font-weight: 500; }
    .bar { width: 45%; min-width: 56px; }
    .bar span { display: block; height: 8px; border-radius: 4px; background: var(--ciel); min-width: 3px; transform-origin: left; animation: tire 1s var(--e) both; animation-delay: calc(var(--i) * 45ms + .3s); }
    details summary { cursor: pointer; color: var(--gris); font-weight: 600; font-size: .92rem; }
    details[open] summary { margin-bottom: 12px; }

    .login { max-width: 400px; margin: 10px auto 0; padding: 28px; }
    .login label { display: block; color: var(--gris); font-weight: 600; font-size: .9rem; }
    .login input { width: 100%; margin: 8px 0 16px; border-radius: 12px; padding: 12px 14px; }
    .login button { width: 100%; padding: 12px; }
    .erreur { color: var(--corail); font-weight: 600; }
    .vide, .note { color: var(--gris); }
    .note { font-size: .88rem; max-width: 70ch; }
    code { font-size: .9em; color: var(--glace); }
    @media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition: none !important; } }
    @media (max-width: 560px) { .kpi b { font-size: 2.3rem; } .cols { gap: 2px; } .cols-l { gap: 2px; } }
  </style>
</head>
<body>
<header><div class="wrap">
  <a href="./" aria-label="Retour au site"><img src="assets/logo-letsgolf.svg" width="168" height="30" alt="Let's Golf"></a>
  <nav><a href="./">Le site</a><?php if ($connecte): ?><a href="stats.php?sortir=1">Se déconnecter</a><?php endif; ?></nav>
</div></header>
<main><div class="wrap">
  <div class="tete">
    <div class="sur">Winter Challenge · accès réservé</div>
    <h1>Visites <em>du site</em></h1>
    <svg class="vol" viewBox="0 0 1000 54" preserveAspectRatio="none" aria-hidden="true">
      <path class="sol" d="M0 50H1000" vector-effect="non-scaling-stroke"/>
      <path class="arc" d="M8 50Q500 -42 992 50" vector-effect="non-scaling-stroke"/>
      <path class="cache" pathLength="100" d="M8 50Q500 -42 992 50" vector-effect="non-scaling-stroke"/>
    </svg>
  </div>
<?php if (!$connecte): ?>
  <form class="card login rv" method="post" action="stats.php">
    <h2>Mot de passe</h2>
    <label for="mdp">Réservé à Mike et au capitaine</label>
    <input id="mdp" name="mdp" type="password" autocomplete="current-password" autofocus required>
    <?php if ($erreur): ?><p class="erreur"><?= h($erreur) ?></p><?php endif; ?>
    <button type="submit">Entrer</button>
  </form>
<?php else: ?>
  <script>try { localStorage.setItem("wc_pas_compter", "1"); } catch (e) {}</script>
  <?php if (!$mois_dispo): ?>
    <section class="card rv"><p class="vide">Aucune visite enregistrée pour l'instant. Le compteur tourne depuis sa mise en ligne :
      les premières visites apparaîtront ici.</p></section>
  <?php else: [$a, $m] = explode('-', $mois); ?>
    <div class="choix rv">
      <form class="mois" method="get" action="stats.php">
        <label for="m">Mois</label>
        <select id="m" name="mois" onchange="this.form.submit()">
          <?php foreach ($mois_dispo as $md): [$aa, $mm] = explode('-', $md); ?>
            <option value="<?= h($md) ?>"<?= $md === $mois ? ' selected' : '' ?>><?= h(MOIS[(int) $mm] . ' ' . $aa) ?></option>
          <?php endforeach; ?>
        </select>
        <noscript><button type="submit">Voir</button></noscript>
      </form>
    </div>

    <div class="kpis">
      <div class="kpi rv" style="--d:1"><b data-n="<?= $total_visiteurs ?>"><?= n($total_visiteurs) ?></b><span>visites en <?= h(MOIS[(int) $m]) ?></span></div>
      <div class="kpi rv" style="--d:2"><b data-n="<?= round(count($par_jour) ? $total_visiteurs / count($par_jour) : 0, 1) ?>" data-d="1"><?= number_format(count($par_jour) ? $total_visiteurs / count($par_jour) : 0, 1, '.', "'") ?></b><span>visites par jour en moyenne</span></div>
      <div class="kpi rv" style="--d:3"><b data-n="<?= $total_vues ?>"><?= n($total_vues) ?></b><span>pages vues</span></div>
      <div class="kpi rv" style="--d:4"><b data-n="<?= $total_visiteurs ? round($total_vues / $total_visiteurs, 1) : 0 ?>" data-d="1"><?= $total_visiteurs ? number_format($total_vues / $total_visiteurs, 1, '.', "'") : '0' ?></b><span>pages par visite</span></div>
    </div>

    <section class="card rv" style="--d:5">
      <h2>Visites par jour · <?= h(MOIS[(int) $m] . ' ' . $a) ?></h2>
      <?php $nb_jours = (int) date('t', strtotime($mois . '-01'));
      $max = max(array_map(function ($d) { return count($d['visiteurs']); }, $par_jour) ?: [0]) ?: 1; ?>
      <div class="cols" role="img" aria-label="Visites par jour du mois ; le détail est dans le tableau « Par jour » plus bas">
        <?php for ($d = 1; $d <= $nb_jours; $d++):
            $j = sprintf('%s-%02d', $mois, $d);
            $v = isset($par_jour[$j]) ? count($par_jour[$j]['visiteurs']) : 0;
            $p = $par_jour[$j]['vues'] ?? 0; ?>
          <div tabindex="0" data-t="<?= h(JOURS[(int) date('N', strtotime($j))] . ' ' . jour($j) . ' : ' . n($v) . ($v > 1 ? ' visites' : ' visite') . ', ' . n($p) . ($p > 1 ? ' pages' : ' page')) ?>"><i class="<?= $v ? '' : 'zero' ?>" style="height:<?= round(100 * $v / $max) ?>%;--i:<?= $d ?>"></i></div>
        <?php endfor; ?>
      </div>
      <div class="cols-l"><?php for ($d = 1; $d <= $nb_jours; $d++): ?><span><?= ($d === 1 || $d % 5 === 0) ? $d : '' ?></span><?php endfor; ?></div>
    </section>

    <section class="card rv" style="--d:6">
      <h2>Par semaine</h2>
      <table>
        <thead><tr><th>Semaine</th><th class="num">Visites</th><th class="num">Pages</th><th></th></tr></thead>
        <?php $max = max(array_map(function ($s) { return count($s['visiteurs']); }, $par_semaine) ?: [0]);
        foreach ($par_semaine as $lundi => $s):
            $libelle = 'du ' . jour($lundi) . ' au ' . jour(date('Y-m-d', strtotime($lundi . ' +6 days')));
            echo barre(h($libelle), count($s['visiteurs']), $max, '<td class="num soft">' . n($s['vues']) . '</td>');
        endforeach; ?>
      </table>
    </section>

    <div class="grid">
      <?= repartition('Appareils', $appareils, NOMS_APPAREILS) ?>
      <?= repartition('Systèmes', $systemes) ?>
      <?= repartition('Pages vues', $pages, NOMS_PAGES) ?>
      <?= repartition('Compétition regardée', $comps, NOMS_COMPS) ?>
    </div>

    <section class="card rv">
      <h2>Heures des pages vues</h2>
      <?php $mh = max($heures) ?: 1; ?>
      <div class="cols" role="img" aria-label="Pages vues par heure de la journée">
        <?php foreach ($heures as $hh => $v): ?><div tabindex="0" data-t="<?= $hh ?> h : <?= n($v) . ($v > 1 ? ' pages' : ' page') ?>"><i class="<?= $v ? '' : 'zero' ?>" style="height:<?= round(100 * $v / $mh) ?>%;--i:<?= $hh ?>"></i></div><?php endforeach; ?>
      </div>
      <div class="cols-l"><?php for ($hh = 0; $hh < 24; $hh++): ?><span><?= $hh % 3 === 0 ? $hh . ' h' : '' ?></span><?php endfor; ?></div>
    </section>

    <section class="card rv">
      <details>
        <summary>Par jour, en tableau (<?= count($par_jour) ?> <?= count($par_jour) > 1 ? 'jours' : 'jour' ?> avec des visites)</summary>
        <table>
          <thead><tr><th>Jour</th><th class="num">Visites</th><th class="num">Pages</th><th></th></tr></thead>
          <?php $max = max(array_map(function ($d) { return count($d['visiteurs']); }, $par_jour) ?: [0]);
          foreach (array_reverse($par_jour, true) as $j => $d):
              echo barre(h(JOURS[(int) date('N', strtotime($j))] . ' ' . jour($j)), count($d['visiteurs']), $max,
                  '<td class="num soft">' . n($d['vues']) . '</td>');
          endforeach; ?>
        </table>
      </details>
    </section>
  <?php endif; ?>
  <p class="note">Une visite = un appareil sur une journée (code anonyme qui change chaque jour, aucune adresse IP gardée,
    aucun cookie chez les joueurs). La télé, les robots et les navigateurs exclus (celui-ci, ou une adresse ouverte avec
    <code>?compter=non</code>) ne sont pas comptés.</p>
  <script>
    /* Les quatre chiffres montent jusqu'à leur valeur (la valeur finale est déjà dans la page si le script ne tourne pas) */
    (function () {
      if (!window.requestAnimationFrame || (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches)) return;
      var fmt = function (v, d) { var s = v.toFixed(d).split("."); return s[0].replace(/\B(?=(\d{3})+(?!\d))/g, "'") + (d ? "." + s[1] : ""); };
      [].forEach.call(document.querySelectorAll(".kpi b[data-n]"), function (el) {
        var fin = Number(el.getAttribute("data-n")), d = Number(el.getAttribute("data-d") || 0), texte = el.textContent, t0 = null;
        if (!fin) return;
        var pas = function (t) {
          if (t0 === null) t0 = t;
          var k = Math.min(1, (t - t0) / 1400);
          el.textContent = k < 1 ? fmt(fin * (1 - Math.pow(1 - k, 3)), d) : texte;
          if (k < 1) requestAnimationFrame(pas);
        };
        el.textContent = fmt(0, d);
        requestAnimationFrame(pas);
        setTimeout(function () { el.textContent = texte; }, 2200);
      });
    })();
  </script>
<?php endif; ?>
</div></main>
</body>
</html>
