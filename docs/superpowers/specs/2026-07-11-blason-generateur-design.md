# Blason générateur — vvd.world × odilon.wav

Design validé le 2026-07-11.

## Contexte

Générateur procédural de blasons/emblèmes pour personnages et factions de vvd.world. Un texte en entrée (mot ou phrase, longueur libre) produit un emblème unique et déterministe : même texte → même image, toujours.

Direction artistique : charte odilon.wav — fond noir, pointillisme, palette bleu-gris désaturé (#6B7EC4 / #8A9AD4), formes organiques érodées, aucun contour net. Doit lire comme un artefact du même univers dungeon synth, pas comme un logo héraldique classique.

## Contraintes

- Aucune dépendance externe, aucune API, aucun backend.
- Fichier unique autonome (HTML/JS).
- Génération procédurale pure : hash du texte → paramètres visuels.
- Composition lisible comme emblème (symétrie), pas comme bruit aléatoire.
- Export PNG, ratio 4:5, ≥ 1080×1350.

## Hors scope (cette session)

PWA, app en ligne, déploiement, galerie, sauvegarde. Session dédiée future une fois le générateur validé visuellement.

## Architecture

Un seul fichier `index.html` : markup UI minimal + `<canvas>` + script inline. Pas de build, pas de dépendance.

### 1. Hash déterministe

Texte (mot ou phrase) → hash 32 bits (algorithme type djb2 ou FNV-1a, char par char, insensible à la casse ou non — à trancher en implémentation, sans impact design). Le hash sert de seed à un PRNG seedé (mulberry32). Toute la génération consomme ensuite ce PRNG dans un ordre fixe — jamais `Math.random()`. Garantit : même texte → même séquence de nombres → même image, à chaque fois, sur toute machine.

### 2. Paramètres dérivés du seed

Dans l'ordre de consommation du PRNG :

1. **Type de symétrie** : axiale verticale (miroir gauche/droite) OU radiale à k branches (k ∈ {3,4,6,8}). Choix pondéré par le PRNG.
2. **Nombre de clusters organiques** : 3 à 7, placés dans le secteur de base (moitié du canvas pour axiale, 1/k pour radiale).
3. **Pour chaque cluster** : position (contrainte au secteur de base, avec marge pour éviter le bord), rayon d'influence, densité locale, quantité de particules.
4. **Jitter/érosion** : amplitude du bruit gaussien appliqué à la dispersion des particules autour de chaque cluster.
5. **Variation chromatique** : décalage de teinte/luminosité par particule autour de la palette de base.

### 3. Construction de la forme — champ de particules pur

Pas de silhouette ni contour fixe. La forme émerge du nuage de points :

1. Génère les clusters du secteur de base (structure interne, non dessinée directement).
2. Duplique/reflète ces clusters selon la symétrie choisie pour couvrir tout l'emblème (miroir ou rotation k fois).
3. Autour de chaque cluster (dupliqué compris), disperse ses particules avec un bruit gaussien décroissant depuis le centre du cluster (plus dense au centre, se raréfiant vers la périphérie).
4. Chaque particule : rayon 1-3px, couleur proche de #6B7EC4/#8A9AD4 avec variation d'opacité/luminosité légère (texture pointilliste).
5. Fond noir plein (#000000 ou proche). Aucun cadre, aucune vignette, aucun cercle de contention — la densité décroissante donne la limite naturellement.
6. Aucun texte, aucun label sur le visuel exporté. Emblème seul.

### 4. Rendu et export

- Canvas rendu nativement à 1080×1350 (pas d'upscale post-génération).
- Bouton "Exporter PNG" → `canvas.toBlob` + lien de téléchargement, nom de fichier dérivé du texte source (slugifié).

### 5. Interface

- Champ texte libre (mot ou phrase, sans limite de longueur imposée), placeholder du type "mot-clé ou phrase".
- Génération live à la saisie (`input` event) ou bouton "Générer" — à trancher en implémentation selon perf perçue.
- Aperçu canvas.
- Bouton "Exporter PNG".

## Plan de test

Valider le prototype avec 4 textes d'exemple choisis pour couvrir mot court, mot long, et phrase :
- Un mot court
- Un mot long
- Une phrase courte
- Une phrase longue

Vérifier pour chacun : régénération du même texte → pixels identiques (déterminisme) ; les 4 rendus sont visuellement distincts (diversité) ; lecture immédiate comme emblème symétrique, pas comme pattern aléatoire.

## Critères de succès

- Même texte → même image, toujours (déterminisme vérifiable en régénérant).
- 4 exemples visuellement distincts et cohérents avec la charte odilon.wav.
- Export PNG 4:5 fonctionnel, résolution ≥ 1080×1350.
- Aucune dépendance externe, fichier unique ouvrable directement dans un navigateur.
