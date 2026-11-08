---
name: inscrire-joueurs
description: Inscrit de nouveaux joueurs au Winter Challenge et au Short Game à partir d'un fichier Excel ou d'un texte (pseudo, e-mail, prénom, nom, handicap réel, homme/femme/senior) : contrôle les informations, crée les comptes Simulator Golf Tour, les ajoute au Short Game et au tour de leur catégorie, tient à jour le fichier des handicaps. À utiliser quand Mike ou le capitaine donne des inscriptions, un nouveau joueur, un fichier d'inscrits, « inscris-le », « crée le compte », ou quand un nouveau tournoi a été créé et que les joueurs doivent y être inscrits.
---

# Inscription des joueurs

Tu aides Mike et le capitaine du Winter Challenge (Let's Golf, Bussigny) à inscrire des joueurs. Tutoie, réponds en français, ton direct et factuel. Les règles de fond (Short Game en brut à 0, handicap réel, tours) sont dans `CLAUDE.md` : relis-les si besoin.

Les outils sont dans le dépôt, à lancer depuis sa racine : `scripts/inscrire_joueurs.py` et `winter_challenge/inscription.py`.

## Les six informations, toutes obligatoires

| Information | Remarque |
|---|---|
| Pseudo (nickname) | Celui de SGT, identique dans GSPro. 3 à 30 caractères : lettres, chiffres, `_`, `-`. Un pseudo SGT ne se renomme pas. |
| Adresse e-mail | Sert à « mot de passe oublié ». |
| Prénom | |
| Nom | |
| Handicap réel | Nombre (`11`, `11,5`). `+2` = handicap plus, compté `-2`. Un `0` est une valeur valable : ne le confonds pas avec un oubli. |
| Catégorie | Homme, Femme ou Senior. |

**S'il manque une information (ou si elle est invalide), demande-la à la personne avant de créer quoi que ce soit** : liste précisément, joueur par joueur, ce qui manque. Ne devine jamais un handicap, une catégorie ou une adresse. Le script refuse d'ailleurs de rien écrire tant que toute la liste n'est pas complète (code de sortie 2).

## Procédure

1. **Récupère la liste.** Un fichier Excel ou CSV (première ligne = titres de colonnes, libres : « Surnom », « Mail », « Hdc »… sont reconnus), ou du texte dans la conversation. Pour du texte, écris les joueurs dans un fichier CSV du dossier temporaire (colonnes `pseudo;email;prenom;nom;handicap;categorie`) puis passe-le avec `--fichier`. Pour un seul joueur, tu peux passer les options `--pseudo --email --prenom --nom --handicap --categorie`.
2. **Simule** : `python3 scripts/inscrire_joueurs.py --fichier <liste> --simuler`. Rien n'est écrit. Le script contrôle les six informations, les doublons, les pseudos et e-mails déjà pris chez SGT, et montre ce qui serait fait pour chaque joueur.
3. **Montre le résultat à la personne**, en une phrase par joueur : compte créé ou déjà existant, tours, handicap. Signale tout ce qui sort de l'ordinaire : pseudo ou e-mail déjà pris par un autre compte, handicap plus, handicap arrondi (SGT n'accepte que des entiers : 11,5 → 12), joueur déjà inscrit.
4. **Demande la confirmation** avant d'écrire. La création d'un compte SGT est durable : l'API ne permet pas de le supprimer. Si la personne a déjà dit « vas-y, inscris-les » après avoir vu les informations, ne redemande pas.
5. **Exécute** la même commande sans `--simuler`. Vérifie la fin du compte rendu (« N joueur(s) traité(s), 0 en erreur ») et dis ce qui s'est passé.
6. **Mets en ligne les handicaps** : `config/joueurs.csv` (pseudo, catégorie, handicap réel ; ni nom ni e-mail) a reçu une ligne par nouveau joueur. Propose de le commiter et de le pousser : la mise à jour automatique du site le lit (le site se met à jour dans les minutes qui suivent le push). Ne commite pas sans accord.
7. **Donne la durée d'un tour complet de la télé**, à chaque inscription, sans qu'on la demande : `python3 scripts/duree_tv.py` (nombre de pages × secondes par page, pour 8 et 10 s). Mike la reporte dans Zebrix.
8. **Rappelle aux joueurs** (ou à la personne qui les a donnés) de choisir leur mot de passe avec « mot de passe oublié » sur simulatorgolftour.com, avec l'adresse e-mail donnée. Le compte est créé avec un mot de passe aléatoire que personne ne connaît.

## Ce que fait le script, joueur par joueur

- Compte SGT : créé si le pseudo et l'e-mail sont libres ; réutilisé si les deux appartiennent au même compte ; refus si l'un des deux appartient à un autre compte.
- Tours : le **Short Game** (3909, mixte) et le tour de la catégorie (Hommes 3910, Femmes 3911, Seniors 3912).
- Tournois : tous ceux de ces deux tours. Handicap **0** au Short Game, handicap **réel** (arrondi) dans le tour de catégorie.
- Fichiers : une ligne dans `config/joueurs.csv` (versionné), et l'identité complète dans `data/joueurs_inscrits.csv` (reste sur cet ordinateur, sert plus tard pour GSPro).
- Il **ne modifie jamais l'existant** : compte, handicap d'une inscription déjà faite, ligne déjà présente du fichier des handicaps. Si quelque chose diffère (« pas modifié : voulu 0 »), il le dit. Pour corriger un handicap existant, c'est une demande explicite à part.

## Nouveau tournoi créé par le capitaine

Quand un nouveau tournoi apparaît chez SGT (nouvelle semaine du Winter Challenge, nouveau mois du Short Game), les joueurs ne sont pas forcément inscrits dedans : `python3 scripts/inscrire_joueurs.py --completer --simuler` montre qui manque, puis sans `--simuler` pour les inscrire (handicap du fichier `config/joueurs.csv` ; 0 au Short Game).

## Limites

- Ce skill ne crée pas de tournoi chez SGT et ne crée pas les joueurs dans GSPro (étape à part, à partir de `data/joueurs_inscrits.csv`).
- Prénom et nom ne sont pas envoyés à SGT (l'API de création ne les prend pas) : ils ne servent qu'au journal local.
- Chaque connexion à l'API peut invalider la clé de la mise à jour automatique : un échec « INVALID API KEY » juste après une inscription se corrige tout seul à l'exécution suivante.
