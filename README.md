# Winter Challenge 2026-2027

Compétition hebdomadaire de golf sur simulateur au Let's Golf (Bussigny). Les scores de la semaine sont récupérés
depuis l'API de Simulator Golf Tour (SGT) ; Python calcule les points, les handicaps et les classements, puis écrit un
classeur Excel (sans macros).

## Règles du classement

- Une semaine (WC1, WC2…) = un tournoi SGT, un seul tour par joueur. Les deux classements, brut et net, utilisent ce même tour.
- Points : `100 + (Stableford − 36) × 10` sur 18 trous (`− 18` sur 9 trous), minimum 30.
- Classement final : somme des **8 meilleurs** résultats de la saison. Dans le classeur, ces résultats sont en vert et le
  plus petit d'entre eux (le premier à être remplacé) est en rouge.
- Handicap de jeu : +1 sous les 100 points nets, sinon `− (points − 100) / 10`. Il ne change qu'à la fin de la semaine,
  en cours de semaine. Handicap de départ : 50 % du handicap réel.

Ces règles sont dans `winter_challenge/scoring.py` et `winter_challenge/season.py`.

## Mise en route

```bash
cp .env.example .env     # puis remplir SGT_CLUB_URL, SGT_USERNAME, SGT_PASSWORD
python3 scripts/build_workbook.py --tour 3901:Test --saison 2026-2027 --sortie Winter-Challenge_Test.xlsx
```

- `--tour ID:Catégorie` : un tour SGT par catégorie, à répéter (Hommes, Femmes, Seniors…).
- `--joueurs fichier.csv` : fichier optionnel `pseudo;categorie;handicap_reel` pour imposer catégorie et handicap
  de départ. Sans lui, le handicap fixé par le club dans SGT est utilisé, puis l'index SGT.
- `--depuis-fichier data/sgt_brut.json` : refait le classeur sans appeler l'API (les données du dernier appel sont
  enregistrées dans `data/sgt_brut.json`).

Le classeur contient : `Classement Net`, `Classement Brut`, `Résultats` (un tour par joueur et par semaine), `Semaines`, `Joueurs`
et `Paramètres`. Il est entièrement régénéré à chaque lancement : ne pas le corriger à la main.

L'API est celle des clubs « Full Suite » de SGT : <https://simulatorgolftour.com/docs/clubapi>.
La clé API est valable 24 h et se redemande automatiquement avec le compte administrateur.

## Choix du parcours de la semaine

Le skill `choix-parcours` (dossier `.claude/skills/`) aide le capitaine à choisir le parcours : cinq questions
(longueur, difficulté, style, zone, nouveauté), puis dix parcours parmi les ≈ 2'750 de Simulator Golf Tour, avec
longueurs, conditions et liens vidéo. Le parcours choisi devient le prochain parcours (`config/prochain_parcours.json`).
Les parcours déjà joués sont dans `config/parcours_joues.txt`.

```bash
python3 scripts/parcours_sgt.py liste --difficulte moyen --style montagne --zone suisse --limite 16
python3 scripts/parcours_sgt.py choisir 1416 --semaine 3 --neuf Front
```

## Site web des résultats

Le dossier `site/` contient le site pour winterchallenge.letsgolf.ch (classements, parcours de la semaine, semaines,
fiches joueurs) et la page `tv.html` pour la télévision du centre (classements qui défilent tout seuls). C'est un site statique, sans base de données ni compilation, alimenté par `site/donnees/saison.json`
que génère `scripts/export_site_data.py`. Voir [site/LISEZ-MOI.md](site/LISEZ-MOI.md) pour le voir en local, le mettre à jour
et le mettre en ligne chez Infomaniak.

## Contrôles

```bash
python3 -m unittest discover tests
pip install openpyxl
python3 scripts/validate_workbook.py chemin/vers/ancien.xlsm   # recalcule les 411 résultats de 2025-2026
python3 scripts/sgt_discover.py                                # liste les tours et tournois du club
```

Simulation d'une saison complète (joueurs fictifs, sans appeler l'API) :

```bash
python3 scripts/simulate_season.py chemin/ancien.xlsm
python3 scripts/build_workbook.py --depuis-fichier data/sgt_simule.json --sortie Winter-Challenge_Simulation.xlsx
```

## Confidentialité

`.env`, les classeurs et le dossier `data/` sont ignorés par git : ils contiennent des mots de passe,
des noms et des adresses e-mail.
