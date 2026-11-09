<?php
/* Compteur de visites du site des joueurs (winterchallenge.letsgolf.ch).
 *
 * app.js appelle ce fichier à chaque page affichée (compteur.php?p=classement&c=wc). Les pages télé ne l'appellent jamais :
 * la télé n'est donc pas comptée. Un navigateur peut aussi être exclu (adresse ?compter=non, ou ouverture de stats.php).
 *
 * Une ligne par page vue dans visites/AAAA-MM.csv : date et heure ; page ; compétition ; appareil ; système ; visiteur.
 * Le « visiteur » est un code brouillé (adresse IP + navigateur + date du jour + clé secrète du serveur) : il permet de
 * compter les visiteurs différents d'un jour sans garder d'adresse IP, et change chaque jour (aucun suivi d'un jour à l'autre).
 * Pas de cookie. Le dossier visites/ est créé ici et fermé au public (.htaccess). Lecture : stats.php, avec mot de passe.
 */

date_default_timezone_set('Europe/Zurich');
header('Cache-Control: no-store');
header('X-Robots-Tag: noindex');

const PAGES = ['classement', 'parcours', 'semaines', 'joueurs', 'regles'];
const COMPETITIONS = ['wc', 'sg'];
const ROBOTS = '/bot|crawl|spider|slurp|preview|headless|lighthouse|curl|wget|python|monitor|scan/i';

function appareil($ua, $mac_tactile)
{
    if ($mac_tactile || preg_match('/iPad|Tablet|PlayBook|Silk|Kindle|Android(?!.*Mobile)/i', $ua)) {
        return 'tablette';
    }
    if (preg_match('/Mobi|iPhone|iPod|Android|Windows Phone/i', $ua)) {
        return 'mobile';
    }
    return 'ordinateur';
}

function systeme($ua, $mac_tactile)
{
    if ($mac_tactile || preg_match('/iPhone|iPad|iPod/i', $ua)) return 'iOS';
    if (preg_match('/Android/i', $ua)) return 'Android';
    if (preg_match('/Windows/i', $ua)) return 'Windows';
    if (preg_match('/Macintosh|Mac OS X/i', $ua)) return 'macOS';
    if (preg_match('/CrOS/i', $ua)) return 'ChromeOS';
    if (preg_match('/Linux/i', $ua)) return 'Linux';
    return 'autre';
}

function dossier_visites()
{
    $dir = __DIR__ . '/visites';
    if (!is_dir($dir)) {
        @mkdir($dir, 0750);
    }
    if (!file_exists($dir . '/.htaccess')) {
        file_put_contents($dir . '/.htaccess',
            "# Données de visite : jamais lisibles depuis le web (seul stats.php les lit, sur le serveur)\n" .
            "<IfModule mod_authz_core.c>\n  Require all denied\n</IfModule>\n" .
            "<IfModule !mod_authz_core.c>\n  Deny from all\n</IfModule>\n");
    }
    return $dir;
}

function cle_secrete($dir)
{
    $fichier = $dir . '/cle.txt';
    if (!file_exists($fichier)) {
        file_put_contents($fichier, bin2hex(random_bytes(32)), LOCK_EX);
    }
    return trim((string) file_get_contents($fichier));
}

$ua = substr((string) ($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 400);
if ($ua !== '' && !preg_match(ROBOTS, $ua)) {
    $page = strtolower((string) ($_GET['p'] ?? ''));
    $page = in_array($page, PAGES, true) ? $page : 'autre';
    $comp = strtolower((string) ($_GET['c'] ?? 'wc'));
    $comp = in_array($comp, COMPETITIONS, true) ? $comp : 'autre';
    $mac_tactile = ($_GET['t'] ?? '') === '1';    // iPad récent : il se présente comme un Mac, app.js le signale

    $dir = dossier_visites();
    $ip = (string) ($_SERVER['REMOTE_ADDR'] ?? '');
    $visiteur = substr(hash('sha256', cle_secrete($dir) . '|' . date('Y-m-d') . '|' . $ip . '|' . $ua), 0, 16);
    $ligne = implode(';', [date('Y-m-d H:i:s'), $page, $comp, appareil($ua, $mac_tactile), systeme($ua, $mac_tactile), $visiteur]);
    file_put_contents($dir . '/' . date('Y-m') . '.csv', $ligne . "\n", FILE_APPEND | LOCK_EX);
}

// Réponse : une image transparente de 1 pixel
header('Content-Type: image/gif');
echo base64_decode('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7');
