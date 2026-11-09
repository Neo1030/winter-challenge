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
const NOMS_PAGES = ['classement' => 'Classement', 'parcours' => 'Parcours', 'semaines' => 'Semaines / mois',
    'joueurs' => 'Joueurs', 'regles' => 'Règles', 'autre' => 'Autre'];
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

/* Une ligne de tableau avec une barre proportionnelle */
function barre($libelle, $valeur, $max, $extra = '')
{
    $pc = $max > 0 ? round(100 * $valeur / $max) : 0;
    return '<tr><th scope="row">' . $libelle . '</th><td class="num">' . n($valeur) . '</td>' . $extra .
        '<td class="bar"><span style="width:' . $pc . '%"></span></td></tr>';
}
function repartition($titre, $valeurs, $noms = [])
{
    $total = array_sum($valeurs);
    $max = $valeurs ? max($valeurs) : 0;
    $html = '<section class="card"><h2>' . h($titre) . '</h2>';
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
  <title>Visites · Winter Challenge</title>
  <link rel="icon" href="assets/icone-winter-challenge.svg" type="image/svg+xml">
  <style>
    @font-face { font-family: "Figtree"; font-weight: 300 900; font-display: swap; src: url("assets/fonts/figtree-latin.woff2") format("woff2"); }
    :root { --navy: #001c33; --sky: #35abe2; --sky-ink: #0f7db3; --soft: #50677a; --line: #dbe7f0; --bg2: #f0f7fb; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: "Figtree", Helvetica, Arial, sans-serif; color: var(--navy); background: var(--bg2); }
    header { background: var(--navy); color: #fff; padding: 18px 16px; }
    header .wrap { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; }
    header h1 { margin: 0; font-size: 1.25rem; text-transform: uppercase; letter-spacing: .04em; }
    header a { color: #fff; }
    .wrap { max-width: 980px; margin: 0 auto; }
    main { padding: 20px 16px 40px; }
    .card { background: #fff; border-radius: 16px; padding: 18px 20px; margin-bottom: 18px; box-shadow: 0 6px 20px rgba(0,28,51,.07); overflow-x: auto; }
    h2 { margin: 0 0 12px; font-size: 1rem; text-transform: uppercase; letter-spacing: .04em; }
    .kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 14px; margin-bottom: 18px; }
    .kpi { background: #fff; border-radius: 16px; padding: 16px 18px; box-shadow: 0 6px 20px rgba(0,28,51,.07); border-top: 3px solid var(--sky); }
    .kpi b { display: block; font-size: 2rem; line-height: 1.1; }
    .kpi span { color: var(--soft); font-size: .9rem; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 0 18px; }
    table { width: 100%; border-collapse: collapse; font-size: .95rem; }
    th, td { padding: 6px 8px; border-bottom: 1px solid var(--line); text-align: left; white-space: nowrap; }
    thead th { color: var(--soft); font-weight: 600; font-size: .85rem; }
    .num { text-align: right; font-variant-numeric: tabular-nums; width: 1%; }
    .soft { color: var(--soft); }
    .bar { width: 60%; min-width: 80px; }
    .bar span { display: block; height: 10px; border-radius: 5px; background: var(--sky); min-width: 2px; }
    .hours { display: flex; align-items: flex-end; gap: 3px; height: 120px; }
    .hours div { flex: 1; background: var(--sky); border-radius: 3px 3px 0 0; min-height: 1px; }
    .hours-l { display: flex; gap: 3px; font-size: .7rem; color: var(--soft); }
    .hours-l span { flex: 1; text-align: center; }
    form.mois { display: flex; gap: 8px; align-items: center; }
    select, input, button { font: inherit; padding: 8px 12px; border-radius: 999px; border: 1px solid var(--line); }
    button { background: var(--sky-ink); color: #fff; border: 0; cursor: pointer; }
    .login { max-width: 360px; margin: 60px auto; }
    .login input { width: 100%; margin: 10px 0; border-radius: 10px; }
    .erreur { color: #c0392b; }
    .vide, .note { color: var(--soft); }
    .note { font-size: .88rem; }
  </style>
</head>
<body>
<header><div class="wrap">
  <h1>Visites du site</h1>
  <?php if ($connecte): ?><a href="stats.php?sortir=1">Se déconnecter</a><?php endif; ?>
</div></header>
<main><div class="wrap">
<?php if (!$connecte): ?>
  <form class="card login" method="post" action="stats.php">
    <h2>Accès réservé</h2>
    <label for="mdp">Mot de passe</label>
    <input id="mdp" name="mdp" type="password" autocomplete="current-password" autofocus required>
    <?php if ($erreur): ?><p class="erreur"><?= h($erreur) ?></p><?php endif; ?>
    <button type="submit">Entrer</button>
  </form>
<?php else: ?>
  <script>try { localStorage.setItem("wc_pas_compter", "1"); } catch (e) {}</script>
  <?php if (!$mois_dispo): ?>
    <section class="card"><p class="vide">Aucune visite enregistrée pour l'instant. Le compteur tourne depuis sa mise en ligne :
      les premières visites apparaîtront ici.</p></section>
  <?php else: [$a, $m] = explode('-', $mois); ?>
    <section class="card">
      <form class="mois" method="get" action="stats.php">
        <label for="m">Mois</label>
        <select id="m" name="mois" onchange="this.form.submit()">
          <?php foreach ($mois_dispo as $md): [$aa, $mm] = explode('-', $md); ?>
            <option value="<?= h($md) ?>"<?= $md === $mois ? ' selected' : '' ?>><?= h(MOIS[(int) $mm] . ' ' . $aa) ?></option>
          <?php endforeach; ?>
        </select>
        <noscript><button type="submit">Voir</button></noscript>
      </form>
    </section>

    <div class="kpis">
      <div class="kpi"><b><?= n($total_visiteurs) ?></b><span>visites en <?= h(MOIS[(int) $m]) ?></span></div>
      <div class="kpi"><b><?= number_format(count($par_jour) ? $total_visiteurs / count($par_jour) : 0, 1, '.', "'") ?></b><span>visites par jour en moyenne</span></div>
      <div class="kpi"><b><?= n($total_vues) ?></b><span>pages vues</span></div>
      <div class="kpi"><b><?= $total_visiteurs ? number_format($total_vues / $total_visiteurs, 1, '.', "'") : '0' ?></b><span>pages par visite</span></div>
    </div>

    <section class="card">
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

    <section class="card">
      <h2>Par jour</h2>
      <table>
        <thead><tr><th>Jour</th><th class="num">Visites</th><th class="num">Pages</th><th></th></tr></thead>
        <?php $max = max(array_map(function ($d) { return count($d['visiteurs']); }, $par_jour) ?: [0]);
        foreach (array_reverse($par_jour, true) as $j => $d):
            echo barre(h(JOURS[(int) date('N', strtotime($j))] . ' ' . jour($j)), count($d['visiteurs']), $max,
                '<td class="num soft">' . n($d['vues']) . '</td>');
        endforeach; ?>
      </table>
    </section>

    <div class="grid">
      <?= repartition('Appareils', $appareils, NOMS_APPAREILS) ?>
      <?= repartition('Systèmes', $systemes) ?>
      <?= repartition('Pages vues', $pages, NOMS_PAGES) ?>
      <?= repartition('Compétition regardée', $comps, NOMS_COMPS) ?>
    </div>

    <section class="card">
      <h2>Heures des pages vues</h2>
      <?php $mh = max($heures) ?: 1; ?>
      <div class="hours" role="img" aria-label="Pages vues par heure de la journée">
        <?php foreach ($heures as $hh => $v): ?><div style="height:<?= round(100 * $v / $mh) ?>%" title="<?= $hh ?> h : <?= n($v) ?>"></div><?php endforeach; ?>
      </div>
      <div class="hours-l"><?php for ($hh = 0; $hh < 24; $hh++): ?><span><?= $hh % 3 === 0 ? $hh : '' ?></span><?php endfor; ?></div>
    </section>
  <?php endif; ?>
  <p class="note">Une visite = un appareil sur une journée (code anonyme qui change chaque jour, aucune adresse IP gardée,
    aucun cookie chez les joueurs). La télé, les robots et les navigateurs exclus (celui-ci, ou une adresse ouverte avec
    <code>?compter=non</code>) ne sont pas comptés.</p>
<?php endif; ?>
</div></main>
</body>
</html>
