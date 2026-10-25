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
2. **Envoi des fichiers** : avec un client SFTP ou FTP (Cyberduck, FileZilla), envoie **le contenu** du dossier `site/`
   dans le dossier du sous-domaine (`index.html`, `.htaccess`, `assets/` et `donnees/`). Les identifiants FTP/SFTP se créent
   dans le Manager.
3. **Chaque semaine** : régénère `saison.json` (commande ci-dessus), puis remplace ce seul fichier sur le serveur.

Pour intégrer la page au site Let's Golf existant, il suffit de copier le dossier tel quel dans un sous-dossier : tous les
chemins sont relatifs.

## Aller plus loin (plus tard)

- **Mise à jour automatique** : lancer l'export à intervalles réguliers (toutes les heures, par exemple) depuis un
  ordinateur toujours allumé, un serveur ou GitHub Actions, puis envoyer `saison.json` en SFTP. Les identifiants SGT et SFTP
  seraient alors des secrets, jamais écrits dans le dépôt.
- **Vote pour le prochain parcours, inscriptions** : c'est là qu'une base de données (Supabase, par exemple) deviendrait utile.

## Page pour la télévision du centre (`tv.html`)

Une page à part, indépendante du site des joueurs, à afficher sur l'écran du centre : `winterchallenge.letsgolf.ch/tv.html`.
Elle lit le même fichier `saison.json`, mais n'affiche que le logo, cinq cartes (semaine, prochain parcours, joueurs, meilleur net,
meilleur brut) et le classement, qui occupe tout le reste de l'écran.

- **Défilement automatique** toutes les 5 secondes : Hommes net, Hommes brut, Femmes net, Femmes brut, Seniors net, Seniors brut,
  puis on recommence. Chaque classement est coupé en pages équilibrées qui remplissent l'écran (par exemple 30 hommes en 3 pages de 10,
  plutôt que 10 + 10 + 10 lignes serrées ou 10 + 10 + 1). En Full HD, une page compte une dizaine de lignes ; le nombre de lignes et
  de semaines affichées s'adapte tout seul à la taille de l'écran.
- **Fondu** entre deux pages : le tableau s'efface, puis la nouvelle page apparaît ligne après ligne. Une barre fine en bas de la
  carte montre le temps restant avant la page suivante.
- **Réglages dans l'adresse** : `tv.html?duree=8` (secondes par page), `tv.html?lignes=5` (5 lignes au maximum par page).
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
