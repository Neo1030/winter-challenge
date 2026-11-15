# Winter Challenge 2026-2027 · Let's Golf (Bussigny)

Championnat hebdomadaire de golf sur simulateur (GSPro), joué sur Simulator Golf Tour (SGT), de fin octobre 2026 à avril 2027.
Les données viennent de l'API SGT du club `LetsGolf` (clubId 644). Python calcule les points, les handicaps et les classements,
puis publie le site https://winterchallenge.letsgolf.ch et la page télé (`tv.html`, qui s'adapte aussi à une zone de 1229 × 1080).

**Deux personnes utilisent cet outil pendant la saison : Mike (développement) et le capitaine.** Tout doit rester fiable :
vérifie avant d'écrire chez SGT, ne modifie jamais l'existant sans demande explicite, dis clairement ce qui a été fait.
Réponds en français, en tutoyant, ton concret. Francs suisses (CHF), dates JJ.MM.AAAA, apostrophe pour les milliers (1'500).

## Règles à garder en tête en permanence

### Short Game : brut seulement, handicap 0 pour tous (décision de Mike, 01.11.2026)

- Le Short Game se joue **pour tous les joueurs, sans exception, avec un handicap de 0**. Tout le monde est en **stroke play brut**.
- **Il n'y a aucun score net, aucun classement net et aucun calcul de handicap pour le Short Game.** Ni sur le site, ni sur la
  page télé, ni dans les données. Ne les remets jamais, même « pour compléter » ou pour une démonstration.
- Chez SGT, toute inscription à un tournoi du Short Game se fait avec le handicap **0**.
- Le Short Game dure **5 mois, avec 5 parcours** (un tournoi par mois) et **les 5 résultats comptent tous** au classement : aucun résultat
  n'est « à remplacer » (`BRUT_SEUL = {"Short Game": 5}` dans scripts/export_site_data.py ; indicateur `meilleurs` dans saison.json).
- Le Short Game est un tour mixte (`Mixte`, tour 3909) : pas de découpage Hommes / Femmes / Seniors, le fichier des handicaps
  réels ne s'y applique pas.
- Dans le code : `build_season(..., gross_only=True)` (winter_challenge/season.py), constante `BRUT_SEUL` dans
  scripts/export_site_data.py, indicateur `brut_seul` dans saison.json, lu par site/assets/refonte.js et tv2.js.
- À confirmer avec le capitaine : les points du Short Game (aujourd'hui, mêmes points Stableford brut que le Winter Challenge).

### Carte pas finie : pas de statistiques (décision de Mike, 15.11.2026)

- Un joueur qui n'a **pas fini sa carte** (ni 9 ni 18 trous joués) n'a **aucune statistique** : ni tuile (FIR, GIR, drive,
  closest to the pin, putts…), ni stats dans sa fiche, ni coup par coup. SGT compte pourtant ses trous joués : on les écarte
  (`complete_players` dans winter_challenge/stats.py, `shots_of` dans sgt_page.py). Vaut pour toutes les compétitions.
- La surveillance des données SGT reste en place ; elle ne surveille les statistiques d'un joueur que pour les semaines où il a
  un résultat (`facts` et `_still_watched` dans winter_challenge/surveillance.py).

### Winter Challenge : handicaps

- On reçoit le **handicap réel** du joueur. Le calcul utilise **75 %** du réel (handicap de jeu de départ, décision de Mike du 08.11.2026 ;
  `game_handicap` et `GAME_HANDICAP_SHARE` dans scoring.py : 11 → 8). L'ancien classeur prenait 50 %. Les deux valeurs existent, comme dans l'Excel d'origine.
- Sans handicap réel connu, le handicap de jeu de départ est 0. L'index SGT n'est pas utilisé.
- Le handicap de jeu bouge à la fin de chaque semaine (+1 sous 100 points nets, sinon − (points − 100) / 10).
- Les handicaps réels sont dans `config/joueurs.csv` (`pseudo;categorie;handicap_reel`), lu par la mise à jour automatique.
- Chez SGT, l'inscription aux tournois du Winter Challenge se fait avec le handicap **réel**.
- Le capitaine se réserve le droit de **déplacer le tee de départ** des joueurs en haut du classement si l'écart devient trop important
  (règle affichée sur la page Règles du site).
- Classement final : somme des 8 meilleurs résultats. Points : 100 + (Stableford − 36) × 10 sur 18 trous (− 18 sur 9), minimum 30.

## Inscrire des joueurs (skill `inscrire-joueurs`)

Chaque joueur a **six informations obligatoires** : pseudo (nickname SGT, identique dans GSPro), e-mail, prénom, nom,
**handicap réel**, catégorie (**Homme, Femme ou Senior**). Elles arrivent par un fichier Excel, ou par du texte dans la
conversation. **S'il manque une information, demande-la avant d'écrire quoi que ce soit.**

- Chaque joueur est inscrit au **Short Game** (toujours, handicap 0) **et** au tour de sa catégorie (Hommes 3910, Femmes 3911,
  Seniors 3912), avec son handicap réel, dans tous les tournois de ces tours.
- Commande : `python3 scripts/inscrire_joueurs.py --fichier liste.xlsx --simuler`, puis sans `--simuler`. Voir le skill.
- Ne touche jamais aux joueurs déjà en place (compte, handicap, inscriptions, ligne de `config/joueurs.csv`).
- La création d'un compte SGT est **durable** (l'API ne peut pas supprimer un compte) : toujours simuler d'abord.
  **Feu vert de Mike (09.11.2026)** : quand on demande d'inscrire un joueur et que la simulation est propre (les six
  informations présentes, pseudo et e-mail libres, e-mail sans faute apparente, « 0 en erreur »), crée le compte et inscris-le
  chez SGT **sans demander**, puis commite et pousse `config/joueurs.csv` **sans demander**. Au moindre doute (pseudo ou e-mail
  déjà pris, e-mail suspect ou proche d'un compte existant, handicap inhabituel, joueur déjà en place, erreur), arrête-toi et demande.
  Le mot de passe est aléatoire et inconnu : le joueur utilise « mot de passe oublié » avec son e-mail.
- Après une inscription : commite et pousse `config/joueurs.csv` (la mise à jour des résultats le lit). Nom, prénom et e-mail
  restent dans `data/joueurs_inscrits.csv` (non versionné, sur cet ordinateur), pour créer plus tard les joueurs dans GSPro.
- **Après chaque inscription, donne toujours la durée d'un tour complet de la page télé** (`python3 scripts/duree_tv.py`,
  9 joueurs par page, 4 s par page de classement et 8 s par page de statistiques) : Mike la reporte dans Zebrix. La page télé
  l'affiche aussi d'après les résultats réels avec `tv.html?debug=1`.
- Quand le capitaine crée un nouveau tournoi chez SGT : `python3 scripts/inscrire_joueurs.py --completer` inscrit les membres
  qui manquent (handicap réel, ou 0 au Short Game).

## Chez SGT et GitHub : pièges connus

- SGT garde **une seule clé API par compte administrateur** : chaque connexion locale peut invalider celle de la mise à jour
  automatique (échec « INVALID API KEY » à la prochaine exécution, sans gravité). Évite de multiplier les connexions locales.
- Deux données viennent des **pages publiques du site SGT**, pas de l'API (voir winter_challenge/sgt_page.py) : les réglages
  du tournoi (stimp, gimmies, vent…) et le **plus long drive** (l'API n'a que la moyenne, qu'on n'affiche pas). SGT a refait son
  site le 14.11.2026 et la lecture des réglages s'était arrêtée sans erreur : si des réglages ou des drives disparaissent du site,
  regarde d'abord si SGT a changé ses pages.
- Variable GitHub `SGT_TOURS` : `3910:Hommes 3911:Femmes 3912:Seniors 3909:Mixte:Short_Game` (le tiret bas remplace l'espace).
- La mise à jour automatique (« Mise à jour des résultats », toutes les ~5 minutes) écrit `donnees/saison.json` en ligne.
  `python3 scripts/deploy_ftps.py` n'envoie **pas** ce fichier (sinon des joueurs et des semaines disparaissent) : `--avec-donnees`
  seulement si c'est voulu.
- **Mise en ligne du site : automatique.** Chaque push sur `main` qui touche `site/` lance le workflow « Mise en ligne du site »
  (`.github/workflows/mise-en-ligne.yml`) : tests, puis envoi FTPS avec les identifiants du dépôt. Plus de mot de passe à taper ;
  un test qui échoue bloque l'envoi. Un push met le site (et la télé) en ligne : relis avant de pousser. Après un push, suis le
  workflow (`gh run list --workflow mise-en-ligne.yml`) et compare un fichier en ligne avec le local pour confirmer.
  Envoi à la main, si besoin : `python3 scripts/deploy_ftps.py` (le mot de passe se tape dans un terminal, jamais dans un fichier).
- **Le calendrier vient uniquement de SGT** (décision de Mike, 01.11.2026) : les dates sont celles des tournois saisis par le
  capitaine, jamais des dates choisies ici. Semaine en cours = le tournoi dont la date de début est aujourd'hui ou la plus récente ;
  WC1, WC2… = l'ordre des dates de début. Le site et la télé n'affichent que la semaine en cours et, au plus, le parcours de la
  semaine suivante : jamais plus loin. Fin affichée d'une semaine = veille du début du tournoi suivant (chez SGT, les tournois
  restent ouverts jusqu'en fin de saison).

## Coup par coup (fiche joueur)

- La fiche d'un joueur montre son tour **coup par coup** (un arc par coup, coloré selon l'endroit où la balle s'arrête, putts,
  pénalités). L'API SGT ne donne pas ces données : elles viennent de l'onglet « Shot data » d'une carte de score du site SGT,
  `https://simulatorgolftour.com/sgt-api/scorecard/<tournoi>/<id joueur>/indv/shots` (page publique, sans connexion).
  **Accord de Mike du 15.11.2026**, pour tous les joueurs, tous les tournois, chaque semaine. C'est une lecture de page, plus
  fragile que l'API : si SGT change sa page, le bloc disparaît de la fiche et le reste du site ne bouge pas.
- Code : `parse_shots`, `shots_of` dans `winter_challenge/sgt_page.py` ; la mise à jour des résultats écrit `donnees/coups.json`
  à côté de `saison.json` (jamais envoyé par la mise en ligne du site, comme `saison.json`). Une page n'est relue que si la carte
  du joueur a changé ; au plus 60 pages par mise à jour (`SHOTS_PER_RUN`), le reste suit à la suivante.
- Distances converties en mètres. Rien n'est inventé : un texte que SGT écrit autrement est montré tel quel, une fin de trou
  absente chez SGT est signalée comme telle. Pas de coups fictifs dans les données de démonstration.

## Organisation du site (depuis le 15.11.2026)

- **Le site des joueurs** est la refonte « Trajectoire » (motion design) : `site/index.html`, `site/assets/refonte.css`,
  `site/assets/refonte.js`. À chaque modification du style ou du script, augmente le numéro après `v=` dans `site/index.html`
  (le même pour les deux), sinon un navigateur peut garder l'ancienne version.
- **Mode clair** : bouton clair / sombre en haut du site (sombre par défaut, choix gardé dans le navigateur, `wc_theme`). Les
  couleurs sont des variables au début de `refonte.css` (`:root` pour la nuit, `:root[data-theme="clair"]` pour le jour) : n'écris
  jamais une couleur de fond ou de texte en dur dans une règle, sinon elle casse l'un des deux modes. La télé reste sombre.
- **La page télé** est `site/tv.html` (avec `assets/tv2.css` et `assets/tv2.js`, même habillage). Elle s'adapte seule à la zone
  1229 × 1080 (le panneau de gauche passe en bandeau) : `tvreduit.html` ne fait que renvoyer vers `tv.html`.
  Réglages : `?duree=` (pages de classement, 4 s par défaut), `?stats=` (pages de statistiques, 8 s par défaut, ou le double de
  `?duree=`), `?lignes=`, `?debut=stats`, `?debug=1`. 9 joueurs par page en 1920 × 1080. Durée d'un tour : `python3 scripts/duree_tv.py`.
  Augmente le numéro après `v=` dans `tv.html` à chaque modification. Syntaxe prudente pour Zebrix (`tests/test_tv.py`).
- Le QR code du panneau de la télé (`assets/qr-site.svg`) mène à https://winterchallenge.letsgolf.ch : image fixe, à régénérer si
  l'adresse change (version 3, correction M, sans marge ; la marge blanche vient du style).
- **L'ancien site et l'ancienne page télé sont gardés sous `site/v1/`** (décision de Mike) : https://winterchallenge.letsgolf.ch/v1/,
  `/v1/tv.html`, `/v1/tvreduit.html`, et leurs pages de démonstration. Ils lisent les mêmes données (`../donnees/saison.json`).
  N'y touche pas sans demande. L'ancienne adresse `/v2/` renvoie vers le site.
- Les mêmes règles partout : Short Game en brut seulement, jamais plus loin que le parcours de la semaine suivante, la télé
  n'est jamais comptée dans les visites.
- Le déploiement n'efface rien en ligne : les anciens fichiers de la racine (`assets/app.js`, `assets/tv.js`, `/v2/refonte.*`…)
  y restent, sans être utilisés.
- Aperçu local : `python3 scripts/serve_site.py --demo`, puis http://127.0.0.1:8765/ , `/tv.html` , `/v1/`.

## Visites du site

- `site/compteur.php` compte les pages vues du site des joueurs (appelé par refonte.js, et par l'ancien site sous /v1, seulement sur
  winterchallenge.letsgolf.ch).
  La télé n'est jamais comptée. Pas de cookie, pas d'adresse IP gardée : un code brouillé qui change chaque jour.
  Les données restent en ligne dans `visites/` (fermé au public, jamais versionné ni envoyé par le déploiement).
- `https://winterchallenge.letsgolf.ch/stats.php` : statistiques avec mot de passe. Mot de passe : `python3 scripts/mot_de_passe_stats.py`
  (tapé dans un terminal, seule l'empreinte va dans `site/stats-cle.php`, **hors Git** : à envoyer à la main avec
  `python3 scripts/deploy_ftps.py`, la mise en ligne automatique ne l'envoie ni ne l'efface). `?compter=non` exclut un navigateur du compteur.

## Contrôles

`python3 -m unittest discover tests` avant tout commit. Aperçu local : `python3 scripts/serve_site.py` (`--demo` pour les données fictives).
Le site et la page télé sont du JavaScript sans dépendance, écrits pour d'anciens navigateurs (lecteur Zebrix) : pas de `?.` ni
de `??` dans `tv2.js`.
