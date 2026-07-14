# Spec — Terminal full CLI UX (refonte interaction `terminal/index.html`)

**Date :** 2026-07-14
**Statut :** validé (brainstorming)
**Emplacement cible :** `terminal/index.html` (fichier existant, refonte de `#blason-ui` + ajustement `#blason-script`)
**Dépend de :** [2026-07-12-blason-terminal-ascii-design.md](2026-07-12-blason-terminal-ascii-design.md) — ce spec ne remet pas en cause le pipeline de génération (`buildGrid`, braille, palette), il refond uniquement la couche d'interaction.

## 1. Contexte et intention

Retours utilisateur après tests de `terminal/index.html` (livré en Task 1–12,
cf. commits `9301215`…`688949c`) : l'interface actuelle mélange prompt
texte + boutons cliquables (`RE-ROLL`, `PNG`, `COPIER TXT`, `.TXT`, `.ANS`,
`.SVG`). Ce n'est pas cohérent avec l'intention « programme terminal » —
l'utilisateur veut une interaction **100% commande texte**, sans bouton,
avec une esthétique d'ouverture façon programme CLI (banner ASCII).

**Direction future (hors scope ici) :** un vrai CLI natif (Node/binaire).
Ce spec ne construit pas ce CLI et n'architecture pas de code partagé
navigateur/Node — le DOM et un vrai TTY sont des modèles d'I/O trop
différents pour justifier une abstraction commune maintenant (YAGNI).
Seule la **grammaire de commande** (`/help`, `/reroll`, `/export <fmt>`,
`/clear`) est pensée pour se transposer telle quelle sur un futur CLI ; le
cœur pur (`buildGrid`, serializers) est déjà portable par construction
(séparation stricte déjà en place, cf. CLAUDE.md).

## 2. Ce qui change vs. l'implémentation actuelle

| Actuel | Nouveau | Pourquoi |
|---|---|---|
| Boutons cliquables pour reroll/export | Commandes tapées uniquement (`/reroll`, `/export <fmt>`) | Immersion terminal totale, zéro chrome UI non-texte |
| Raccourci clavier `R` pour reroll | Supprimé | Un seul point d'entrée (le prompt), cohérent avec l'esprit commande |
| `alert()` natif navigateur pour les erreurs | Ligne d'erreur dans le log terminal (`commande inconnue: /xyz`) | Une popup navigateur casse l'illusion terminal |
| Seed imprimé **dans** la grille (`overlayStructural`, avant-dernière ligne) | Seed **hors** grille, ligne de statut UI sous l'illustration | Séparation art / métadonnée, demande explicite |
| Pas de commande `/help` | `/help` liste les commandes disponibles | Découvrabilité, demande explicite |
| Pas de banner d'ouverture | Banner ASCII fixe (box-drawing) + tagline/version au-dessus du prompt | Effet « programme qui s'ouvre » |
| Une seule ligne de sortie (le rendu) | Log scrollback : chaque ligne tapée + sa réponse s'empilent | Vrai comportement terminal, historique consultable |

## 3. Layout

```
┌─────────────────────────────────────────┐
│ BANNER (fixe, statique, box-drawing)     │  toujours visible, ne bouge pas
│  titre + tagline + version               │
├─────────────────────────────────────────┤
│ LOG scrollback                           │  s'accumule : chaque ligne tapée
│  heraldic@vvd:~$ chateau                 │  (commande ou texte libre) + la
│  heraldic@vvd:~$ /help                   │  réponse associée si applicable
│  commandes: /reroll /export <fmt> /clear │  (help text, erreur, rien pour
│  heraldic@vvd:~$ ▊ (input actif ici)     │  une génération réussie)
├─────────────────────────────────────────┤
│ ART — grille braille/ASCII générée       │  remplacée à chaque génération/
│  (inchangé : pipeline buildGrid)         │  reroll, animation decode conservée
├─────────────────────────────────────────┤
│ SEED 0x1A2B3C4D  REV 2.6  UNIT/D-01      │  ligne de statut, sous l'art,
└─────────────────────────────────────────┘  mise à jour à chaque génération
```

- Canvas (`#blason-canvas`) reste en DOM caché, utilisé uniquement comme
  tampon de rendu pour l'export PNG — inchangé.
- Aucun `<button>` dans le markup final.
- Frappe caractère par caractère ne déclenche rien : seul **Entrée** valide
  la ligne (comportement déjà en place, confirmé inchangé — pas de preview
  live pendant la saisie).

## 4. Grammaire de commande

Ligne tapée + Entrée → routée ainsi :

1. **Commence par `/`** → commande. Le mot après `/` est comparé aux
   commandes connues (insensible à la casse) :
   - `/help` → affiche la liste des commandes dans le log.
   - `/reroll` → nouveau tirage du texte courant (même famille, nouvelle
     entropy). Si aucun blason n'a encore été généré : ligne d'erreur
     `aucun blason généré — tape un mot d'abord`.
   - `/export <png|txt|copy|ans|svg>` → déclenche l'export correspondant.
     Sans argument ou argument invalide : ligne d'erreur listant les formats
     valides. Sans blason généré : même erreur que `/reroll`.
   - `/clear` → vide le log scrollback (l'art et la ligne seed à l'écran ne
     sont pas affectés).
   - Toute autre commande → `commande inconnue: /xyz — tape /help`.
2. **Ne commence pas par `/`, non vide** → texte à blasonner. Génère un
   nouveau blason (nouvelle entropy) comme aujourd'hui. Pas de ligne de
   réponse dans le log au-delà de l'écho de la commande tapée (le résultat
   est visuel : l'art + la ligne seed se mettent à jour).
3. **Vide** → aucune action (comportement actuel conservé).

Dans tous les cas, la ligne tapée (prompt + texte) est ajoutée au log de
façon permanente avant traitement, puis l'input se vide.

### Contenu de `/help`

```
commandes disponibles :
  <texte>              génère un blason à partir du texte
  /reroll              nouveau tirage du même texte
  /export <fmt>        exporte le dernier blason (fmt: png, txt, copy, ans, svg)
  /clear                vide l'historique affiché
  /help                 affiche cette liste
```

Texte exact affiné à l'implémentation si besoin d'ajustement de largeur
(contrainte monospace), sans changer le fond.

## 5. Banner

Bloc **statique** (ne dépend pas du texte tapé ni du seed), box-drawing
uniquement (`─│┌┐└┘`, déjà utilisés dans `overlayStructural` pour le cadre
`box`), pas de lettrage figlet caractère-par-caractère.

Raison : le projet a déjà rencontré 3 fois le même piège (caractères
Unicode visuellement quasi-identiques mais fonctionnellement différents —
combining chars, apostrophe typographique, cf. CLAUDE.md). Un banner figlet
multi-lignes transcrit à la main est exactement le type de contenu fragile
à ce piège. Un bloc box-drawing simple donne le même effet « programme qui
s'ouvre » sans ce risque.

Exemple de forme (contenu exact ajustable à l'implémentation, dans le même
esprit) :

```
┌──────────────────────────────┐
│  HERALDIC TERMINAL            │
│  vvd.world × odilon.wav       │
│  v2.6 — tape /help            │
└──────────────────────────────┘
```

## 6. Seed hors grille

- `overlayStructural` **n'écrit plus** la ligne data (`SEED 0x… REV… UNIT…`)
  dans `cells`. La ligne de la grille qu'elle occupait (avant-dernière ligne)
  redevient une ligne d'art normale (pas de réaffectation spéciale).
- Nouvelle fonction pure `formatSeedLine(meta)` dans `#blason-script` :
  retourne la string `SEED 0x… REV … UNIT/D-01` (même format qu'aujourd'hui).
  Réutilisée par :
  - l'UI (affichage de la ligne de statut sous l'art),
  - les 4 serializers, qui l'ajoutent en métadonnée séparée (§7).
- `Grid.meta` (déjà présent : `{ seed, rev, unit }`) reste la source de
  vérité ; `formatSeedLine` en dérive juste la représentation texte.

## 7. Exports — seed en métadonnée séparée

Le seed n'étant plus dans `grid.cells`, chaque export l'ajoute explicitement
pour ne pas perdre la traçabilité du tirage :

- **`serializeText(grid)`** : art + `\n\n` + `formatSeedLine(grid.meta)`.
- **`serializeAnsi(grid)`** : idem, ligne seed en couleur neutre (pas de
  code couleur spécial requis, texte brut suffit après le `RESET` de la
  dernière ligne d'art).
- **`serializeSvg(grid, opts)`** : `<text>` supplémentaire sous la dernière
  ligne d'art ; `viewBox`/hauteur du SVG augmentés d'une `ch` (hauteur de
  ligne) en conséquence.
- **PNG (`renderToCanvas`)** : canvas légèrement plus haut (+ 1 ligne de
  hauteur `ch`), ligne seed dessinée sous l'art avec la même police/couleur
  que l'ancienne ligne data.
- **Copier (clipboard)** : passe par `serializeText`, donc seed inclus
  automatiquement.

Nom de fichier export inchangé : `slugify(texte).<ext>`.

## 8. Erreurs et feedback — plus de `alert()`

Toute communication passe par une ligne ajoutée au log scrollback (même
mécanisme que la réponse à `/help`) :
- Commande inconnue.
- `/reroll` ou `/export` sans blason généré.
- `/export` avec format invalide/manquant.

Aucun `alert()`, `confirm()` ou `prompt()` natif navigateur dans la version
finale.

## 9. Impact code

### `#blason-script` (pur, testé)

- `overlayStructural` : retirer le bloc qui écrit la ligne data (§6). Les
  tests existants sur `overlayStructural`/`buildGrid` qui vérifient la
  présence de cette ligne dans `cells` doivent être mis à jour pour vérifier
  son **absence**, et la présence des infos dans `grid.meta` à la place.
- Nouvelle fonction pure `formatSeedLine(meta) -> string`, exportée et
  testée (format exact, padding hex sur 8 caractères — comportement porté
  tel quel de l'actuel `overlayStructural`).
- `serializeText`, `serializeAnsi`, `serializeSvg` : ajout de l'appel à
  `formatSeedLine` en fin de sortie. Tests à étendre pour vérifier la
  présence de la ligne seed dans chaque sortie sérialisée.

### `#blason-ui` (DOM, non testé — vérif manuelle)

- Suppression : `#blason-actions` et ses 6 boutons, tous leurs event
  listeners, le raccourci clavier `R`, `alert()` dans `requireGrid`.
- Nouveau : élément DOM pour le log scrollback (ajout de lignes, pas de
  limite de historique gérée pour cette itération — `/clear` suffit).
- Nouveau : élément DOM pour la ligne de statut seed, mis à jour après
  chaque génération/reroll via `formatSeedLine(grid.meta)`.
- Nouveau : banner statique, markup HTML fixe (pas généré en JS).
- Nouveau : routeur de commande sur `Enter` (remplace la logique actuelle
  qui traite tout texte non vide comme génération). Dispatch vers
  génération, `/help`, `/reroll`, `/export <fmt>`, `/clear`, ou erreur.
- `renderToCanvas` et export PNG : ajuster hauteur canvas + dessin ligne
  seed (§7).

### Documentation

- `README.md` (`terminal/`) : section Usage réécrite (plus de mention de
  boutons/raccourci `R`), grammaire de commande documentée, checklist de
  vérif manuelle mise à jour (§10).

## 10. Critères d'acceptation

1. Charger `terminal/index.html` : banner visible immédiatement, aucun
   bouton dans le markup, curseur/prompt prêt à taper.
2. Taper un mot + Entrée : ligne échoée dans le log, animation décodage,
   art affiché, ligne seed affichée sous l'art.
3. `/reroll` : nouveau tirage même famille ; sans blason généré au
   préalable → ligne d'erreur dans le log, pas de crash.
4. `/export png|txt|copy|ans|svg` : chaque format déclenche son
   téléchargement/copie, nommé `slugify(texte).<ext>`, contient la ligne
   seed en plus de l'art (sauf PNG où c'est visuel).
5. `/export` avec format invalide ou absent → ligne d'erreur listant les
   formats valides, pas de crash.
6. `/help` → liste des commandes affichée dans le log.
7. `/clear` → log vidé, art + ligne seed à l'écran inchangés.
8. `/xyz` inconnu → `commande inconnue: /xyz — tape /help` dans le log.
9. Aucun `alert()`/`confirm()`/`prompt()` déclenché dans aucun scénario.
10. `node --test terminal/test/core.test.js` : 100% vert (tests mis à jour
    pour refléter §6/§7).
11. `prefers-reduced-motion` : comportement de décodage instantané conservé
    (inchangé par ce spec).

## 11. Hors scope (explicite)

CLI natif Node/binaire (direction future, nouveau cycle brainstorming →
spec → plan le moment venu). Historique de log persistant entre sessions
(localStorage). Auto-complétion des commandes. Navigation historique au
clavier (flèches haut/bas façon shell). Modification du pipeline de
génération (`buildGrid` et tout ce qui en dépend) — inchangé par ce spec.
