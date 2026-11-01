# Winter Challenge 2026-2027 · Let's Golf (Bussigny)

Championnat hebdomadaire de golf sur simulateur (GSPro), joué sur Simulator Golf Tour (SGT), de fin octobre 2026 à avril 2027.
Les données viennent de l'API SGT du club `LetsGolf` (clubId 644). Python calcule les points, les handicaps et les classements,
puis publie le site https://winterchallenge.letsgolf.ch et la page télé (`tv.html`, `tvreduit.html` en 1229 × 1080).

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
  scripts/export_site_data.py, indicateur `brut_seul` dans saison.json, lu par site/assets/app.js et tv.js.
- À confirmer avec le capitaine : les points du Short Game (aujourd'hui, mêmes points Stableford brut que le Winter Challenge).

### Winter Challenge : handicaps

- On reçoit le **handicap réel** du joueur. Le calcul utilise la **moitié** (handicap de jeu de départ = 50 % du réel,
  `game_handicap` dans scoring.py : 11 → 6). Les deux valeurs existent, comme dans l'Excel d'origine.
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
- La création d'un compte SGT est **durable** (l'API ne peut pas supprimer un compte) : toujours simuler d'abord et faire
  confirmer. Le mot de passe est aléatoire et inconnu : le joueur utilise « mot de passe oublié » avec son e-mail.
- Après une inscription : commite et pousse `config/joueurs.csv` (la mise à jour des résultats le lit). Nom, prénom et e-mail
  restent dans `data/joueurs_inscrits.csv` (non versionné, sur cet ordinateur), pour créer plus tard les joueurs dans GSPro.
- Quand le capitaine crée un nouveau tournoi chez SGT : `python3 scripts/inscrire_joueurs.py --completer` inscrit les membres
  qui manquent (handicap réel, ou 0 au Short Game).

## Chez SGT et GitHub : pièges connus

- SGT garde **une seule clé API par compte administrateur** : chaque connexion locale peut invalider celle de la mise à jour
  automatique (échec « INVALID API KEY » à la prochaine exécution, sans gravité). Évite de multiplier les connexions locales.
- Variable GitHub `SGT_TOURS` : `3910:Hommes 3911:Femmes 3912:Seniors 3909:Mixte:Short_Game` (le tiret bas remplace l'espace).
- La mise à jour automatique (« Mise à jour des résultats », toutes les ~5 minutes) écrit `donnees/saison.json` en ligne.
  `python3 scripts/deploy_ftps.py` n'envoie **pas** ce fichier (sinon des joueurs et des semaines disparaissent) : `--avec-donnees`
  seulement si c'est voulu.
- **Mise en ligne du site : automatique.** Chaque push sur `main` qui touche `site/` lance le workflow « Mise en ligne du site »
  (`.github/workflows/mise-en-ligne.yml`) : tests, puis envoi FTPS avec les identifiants du dépôt. Plus de mot de passe à taper ;
  un test qui échoue bloque l'envoi. Un push met le site (et la télé) en ligne : relis avant de pousser. Après un push, suis le
  workflow (`gh run list --workflow mise-en-ligne.yml`) et compare un fichier en ligne avec le local pour confirmer.
  Envoi à la main, si besoin : `python3 scripts/deploy_ftps.py` (le mot de passe se tape dans un terminal, jamais dans un fichier).
- Le calendrier : la semaine en cours est le tournoi dont la date de début est aujourd'hui ou la plus récente.

## Contrôles

`python3 -m unittest discover tests` avant tout commit. Aperçu local : `python3 scripts/serve_site.py` (`--demo` pour les données fictives).
Le site et la page télé sont du JavaScript sans dépendance, écrits pour d'anciens navigateurs (lecteur Zebrix) : pas de `?.` ni
de `??` dans `tv.js`.
