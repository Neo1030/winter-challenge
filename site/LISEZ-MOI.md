# Site du Winter Challenge

Site statique (HTML, CSS, JavaScript) pour winterchallenge.letsgolf.ch : classements net et brut, parcours de la semaine,
résultats par semaine et fiches joueurs. Aucun outil de compilation, aucune base de données, aucun cookie ni traceur.

```
site/
├── index.html            le site des joueurs (menu, classements, parcours, fiches)
├── tv.html               la page pour la télévision du centre (Winter Challenge Results)
├── .htaccess             réglages Apache (le fichier de données n'est jamais gardé en cache)
├── assets/
│   ├── style.css         l'apparence (couleurs en tête de fichier)
│   ├── app.js            l'affichage du site des joueurs (lit donnees/saison.json)
│   ├── tv.css, tv.js     l'apparence et le défilement de la page télé
│   ├── logo-letsgolf.svg        logo Let's Golf    ┐ repris de letsgolf.ch
│   ├── favicon.png              icône ronde        ┘
│   └── fonts/figtree-latin.woff2  police Figtree (celle de letsgolf.ch), hébergée ici
└── donnees/
    └── saison.json       les données, générées par Python : le seul fichier qui change chaque semaine
```

## Voir le site chez soi

```bash
python3 scripts/export_site_data.py --depuis-fichier data/sgt_demo_site.json --demo    # données fictives
python3 scripts/serve_site.py                                                           # puis http://127.0.0.1:8765
```

## Mettre à jour les données

```bash
python3 scripts/export_site_data.py --tour 3910:Hommes --tour 3911:Femmes --tour 3912:Seniors
```

Cela relit l'API SGT, recalcule points, handicaps et classements, et réécrit `site/donnees/saison.json`.
Le parcours de la semaine vient de `config/prochain_parcours.json` (skill `choix-parcours`).
La clé de l'API SGT ne quitte jamais cet ordinateur : le site ne contient que le fichier de résultats.

## Mise en ligne chez Infomaniak

Les intitulés exacts du Manager Infomaniak peuvent varier un peu ; le principe reste le même.

1. **Sous-domaine** : dans le Manager, sur l'hébergement web du domaine letsgolf.ch, ajoute le site
   `winterchallenge.letsgolf.ch` avec son propre dossier. Si la zone DNS de letsgolf.ch est chez Infomaniak, l'adresse
   est créée automatiquement. Active le certificat SSL gratuit (Let's Encrypt) pour avoir le https.
2. **Accès FTP** : dans le Manager (FTP / SSH), crée un utilisateur de type **FTP** (et non « FTP + SSH », qui ouvre tout
   l'hébergement) limité au dossier du sous-domaine.
3. **Envoi des fichiers** : `python3 scripts/deploy_ftps.py` envoie le contenu de `site/` en FTPS (le mot de passe est demandé au
   clavier). `--essai` liste les fichiers sans rien envoyer ; `--donnees-seules` n'envoie que `saison.json`.
4. **Chaque semaine** : régénère `saison.json` (commande ci-dessus) et envoie-le, ou laisse la mise à jour automatique le faire.

Pour intégrer la page au site Let's Golf existant, il suffit de copier le dossier tel quel dans un sous-dossier : tous les
chemins sont relatifs.

## Mise à jour automatique (GitHub Actions)

La tâche `.github/workflows/mise-a-jour.yml` lit l'API SGT, recalcule les classements et envoie `saison.json` chez Infomaniak
**seulement si les résultats ont changé**. Rythme, heure de Suisse : toutes les 5 minutes de 08:00 à 22:00, puis une fois par
heure la nuit (`scripts/creneau.py` gère l'heure d'été). Elle est **inactive tant qu'on ne l'active pas**.

Dans GitHub, **Settings → Secrets and variables → Actions** :

| Type | Nom | Contenu |
|---|---|---|
| Secret | `SGT_USERNAME`, `SGT_PASSWORD` | compte administrateur SGT dédié à l'automate |
| Secret | `FTP_PASSWORD` | mot de passe de l'utilisateur FTP limité au dossier du site |
| Variable | `SGT_CLUB_URL` | nom du club dans l'adresse SGT (voir `.env.example`) |
| Variable | `FTP_USER` | `x12b2_winterchallenge` |
| Variable | `SGT_TOURS` | les tours et leur catégorie, par exemple `3910:Hommes 3911:Femmes 3912:Seniors` |
| Variable | `MISE_A_JOUR_ACTIVE` | `true` pour **allumer** la tâche (à créer en dernier ; supprime-la ou mets `false` pour l'éteindre) |

Pour essayer : onglet **Actions → Mise à jour des résultats → Run workflow**. Le parcours de la semaine vient de
`config/prochain_parcours.json` : il doit être **commité et poussé** pour être pris en compte (la tâche se relance alors toute seule).

Une tâche planifiée est désactivée par GitHub après 60 jours sans activité dans le dépôt ; une étape d'entretien la réactive
chaque nuit pour éviter cela.

**Fiabilité (constat du 26.10.2026)** : la planification de GitHub n'est pas garantie. Sa documentation dit que l'événement « can be
delayed during periods of high loads » et que « some queued jobs may be dropped »
([docs.github.com](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows)). Des
utilisateurs rapportent des exécutions manquantes ou en retard de plusieurs heures
([discussion #185355](https://github.com/orgs/community/discussions/185355),
[#210111](https://github.com/orgs/community/discussions/210111)). Ici, aucune exécution planifiée n'a démarré pendant plus d'une
heure après la mise en service. Pour une mise à jour fiable toutes les 5 minutes, il faut un déclencheur externe qui appelle
`workflow_dispatch` (voir ci-dessous), la planification de GitHub ne servant plus que de filet de sécurité.

## Aller plus loin (plus tard)

- **Vote pour le prochain parcours, inscriptions** : c'est là qu'une base de données (Supabase, par exemple) deviendrait utile.

## Page pour la télévision du centre (`tv.html`)

Une page à part, indépendante du site des joueurs, à afficher sur l'écran du centre : `winterchallenge.letsgolf.ch/tv.html`.
Elle lit le même fichier `saison.json`, mais n'affiche que le logo, cinq cartes (semaine, prochain parcours, joueurs, meilleur net,
meilleur brut) et le classement, qui occupe tout le reste de l'écran.

- **Défilement automatique** toutes les 10 secondes : Hommes net, Hommes brut, Femmes net, Femmes brut, Seniors net, Seniors brut,
  puis on recommence. Chaque classement est coupé en pages équilibrées qui remplissent l'écran (par exemple 30 hommes en 3 pages de 10,
  plutôt que 10 + 10 + 10 lignes serrées ou 10 + 10 + 1). En Full HD, une page compte une dizaine de lignes ; le nombre de lignes et
  de semaines affichées s'adapte tout seul à la taille de l'écran.
- **Fondu** entre deux pages : le tableau s'efface, puis la nouvelle page apparaît ligne après ligne. Une barre fine en bas de la
  carte montre le temps restant avant la page suivante.
- **Réglages dans l'adresse** : `tv.html?duree=15` (secondes par page, 10 par défaut), `tv.html?lignes=5` (5 lignes au maximum par page).
- **Mise en place** : ouvrir l'adresse dans le navigateur de la télévision ou d'un mini-PC, puis plein écran avec F11, la touche F
  ou un double-clic. Pour un affichage permanent, Chrome peut se lancer en mode kiosque :
  `chrome --kiosk https://winterchallenge.letsgolf.ch/tv.html`.
- **Mise à jour** : la page relit les résultats chaque minute et recharge son propre code toutes les 6 heures. Si la connexion
  coupe, elle garde l'affichage en cours. Les résultats ne changent que lorsque `saison.json` est remplacé sur le serveur.
- Le navigateur reçoit une demande pour garder l'écran allumé (selon l'appareil, il faut aussi désactiver la mise en veille).
- La page n'est pas référencée par les moteurs de recherche, mais son adresse n'est pas secrète.

## Fiche joueur et carte de score

- La fiche d'un joueur (clic sur son nom) montre deux graphiques : les **points de la tentative retenue pour chaque partie**
  (barres bleues : compte, rose : premier remplacé, grises : ne compte pas) et l'**évolution du handicap**. En survolant (souris),
  en touchant (téléphone) ou en naviguant au clavier, une **bulle** donne le détail : score en coups et par rapport au par,
  Stableford, points et tentatives.
- La fiche contient aussi une section **Statistiques**, en mètres : plus long drive, plus près du drapeau (par 3), fairways,
  greens et putts, par semaine et en moyenne, avec le rang du joueur parmi les joueurs de son tour. Elles viennent de l'API SGT
  (`tournaments/stats`) et portent sur **tous les tours de la semaine**, pas seulement le tour retenu pour le classement.
  **Unités à confirmer** : l'API ne les donne pas. On suppose des yards pour les drives et des pieds pour les distances au
  drapeau (documentation du site SGT) ; la conversion est dans `winter_challenge/stats.py` (`YARD_M`, `FOOT_M`).
  Pour vérifier : comparer un drive ou une distance de `saison.json` avec ce que SGT affiche pour le même tournoi.
- La page « Parcours » a trois sous-onglets (Hommes, Femmes, Seniors, un tournoi chacun) : la **semaine en cours**, la **semaine
  prochaine** (tournoi déjà créé chez SGT, sinon le parcours choisi avec le skill) et l'**historique** des semaines terminées.
  Chaque parcours montre ses réglages : départ, pente et cotation, neuf joué et par, stimp, fermeté des greens et des fairways,
  vent, météo, positions des drapeaux, gimmies (en mètres) et putting.
  **D'où ça vient :** l'API de club ne donne pas ces réglages. Ils sont lus sur la page publique du tournoi
  (`simulatorgolftour.com/tournament/<id>`, bloc « Round settings », code dans `winter_challenge/sgt_page.py`). C'est une lecture
  de page, donc plus fragile qu'une API : si SGT change sa page, les réglages disparaissent du site (le reste continue).
  Pour ne pas solliciter SGT toutes les 5 minutes, un tournoi terminé n'est pas relu : ses réglages sont repris du fichier déjà publié.
  La longueur, la description et la vidéo viennent de l'archive `config/historique_parcours.json`, remplie par le skill
  `choix-parcours` à chaque parcours choisi (SGT ne les donne pas).
- La page « Parcours » affiche **directement l'image de la carte de score** du parcours de la semaine (longueurs par départ, pars,
  index des trous). L'image est chargée depuis simulatorgolftour.com : elle appartient à SGT et à ses concepteurs. Si SGT la rend
  indisponible, la page affiche un bouton qui ouvre la carte chez SGT. Pour ne plus dépendre d'eux, on pourrait en garder une
  copie sur le site avec leur accord.

## Identité visuelle

Le site reprend celle de letsgolf.ch : police **Figtree**, bleu nuit `#001c33`, bleu ciel `#35abe2`, boutons en pilule, titres
en majuscules, logo en haut à gauche et favicon rond. Le site est **clair uniquement** : fond blanc, bandeau d'accueil bleu pâle,
même quand le téléphone du visiteur est en mode sombre. Le bleu ciel de la marque sert aux décors et aux accents ; les textes et
boutons utilisent une variante plus foncée (`--sky-ink`) pour rester lisibles.

- **Couleurs** : variables au début de `assets/style.css` (`--navy`, `--sky`, `--sky-ink`, `--sky-soft`…).
- **Logo** : fichier `assets/logo-letsgolf.svg` à remplacer s'il change (le logo appartient à Let's Golf).
- **Police** : Figtree est sous licence libre (SIL OFL) ; elle est hébergée sur le site, sans appel à Google.
- **Textes des règles** : dans la fonction `viewRules` de `assets/app.js`.

## Confidentialité

Seuls les pseudos GSPro sont publiés (pas de nom ni d'e-mail). Il est prudent d'informer les joueurs que leur pseudo et
leurs résultats apparaissent sur le site.
