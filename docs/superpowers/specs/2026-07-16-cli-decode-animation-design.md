# Spec — Animation de décodage pour la génération en CLI

**Date :** 2026-07-16
**Statut :** validé (brainstorming)
**Emplacement cible :** `cli/lib/`, `cli/bin/heraldic.js`, `cli/test/`.
**Dépend de :** [2026-07-16-heraldic-cli-design.md](2026-07-16-heraldic-cli-design.md) — porte l'animation `renderDecode` de `terminal/index.html` vers le CLI Node.js déjà livré (`heraldic` npm package, mergé sur `main`).

## 1. Contexte et intention

`terminal/index.html` anime la révélation d'un blason généré via `renderDecode` (`terminal/index.html:453-493`) : `requestAnimationFrame`, révélation par vagues depuis le centre de la grille vers les bords, caractères braille "scramble" avant de se stabiliser sur le caractère final, respecte `prefers-reduced-motion`. Le CLI Node.js (`cli/`) génère actuellement le blason instantanément (`generate()` dans `bin/heraldic.js` fait `buildGrid` puis `console.log(serializeAnsi(...))` en un seul passage, zéro animation).

L'utilisateur veut la même expérience de révélation dans un vrai terminal.

## 2. Décisions actées

| Sujet | Décision | Pourquoi |
|---|---|---|
| Fidélité | Port fidèle de l'algorithme `renderDecode` (mêmes constantes, même stagger par distance au centre, même jeu de caractères scramble) | Cohérence directe avec l'UX déjà validée côté HTML |
| Mécanisme de rafraîchissement | `setInterval` + réécriture ANSI (`\x1b[<rows>A` puis `\x1b[0J`) — pas de dépendance TUI | Pas de `requestAnimationFrame` hors navigateur ; cohérent avec la contrainte déjà actée "sortie scrollante classique, pas de TUI" du spec CLI parent |
| Fréquence | 50ms (20fps), pas 60fps | Une frame = jusqu'à 4000 cellules avec séquences ANSI couleur ; 60fps sur un vrai TTY (a fortiori SSH) est inutilement lourd pour un gain visuel marginal |
| Fallback non-TTY | `process.stdout.isTTY === false` → affichage instantané via `serializeAnsi` existant | Équivalent direct de `prefers-reduced-motion` : un flux non-interactif (pipe, CI, redirection fichier) n'a rien à gagner à une animation, et l'ANSI cursor-move y serait de toute façon inutile/cassé |
| Interruption/concurrence | Jeton de génération (`generation`, incrémenté à chaque `generate()`) vérifié à chaque tick ; une boucle périmée s'arrête sans écrire | Même mécanisme que `decodeGeneration` en HTML ; protège contre la même classe de bug que la régression `/quit` déjà rencontrée (lignes bufferisées traitées avant la fin d'une opération async en cours) |
| Découpage code | `cli/lib/animate.js` (pur, testable) pour le calcul de frame ; boucle `setInterval`/écriture stdout dans `cli/bin/heraldic.js` (I/O, non testé) | Respecte la séparation logique pure / I/O déjà établie dans le projet (`#blason-script` vs `#blason-ui`, et son équivalent `lib/` vs `bin/` en CLI) |
| Refactor `serialize.js` | Extraction de `cellsToAnsi(cells)` depuis `serializeAnsi`, réutilisée par `animate.js` | Évite de dupliquer la logique de regroupement de couleurs ANSI (run-length) déjà écrite et testée |

## 3. Structure

```
cli/
├── lib/
│   ├── animate.js          # NOUVEAU — computeDecodeFrame, SCRAMBLE_CHARS, DECODE_DURATION_MS, DECODE_STAGGER_MS
│   ├── serialize.js         # MODIFIÉ — extraction de cellsToAnsi(cells), exportée
│   └── core.js               # inchangé — grid.seed, grid.rows, grid.cols déjà exposés par buildGrid
├── bin/heraldic.js           # MODIFIÉ — generate() devient async, boucle d'animation, jeton de génération
└── test/
    └── animate.test.js       # NOUVEAU
```

Zéro nouvelle dépendance npm.

## 4. Algorithme de frame (`computeDecodeFrame`)

Port direct de `renderDecode` (`terminal/index.html:465-488`) :

- Entrées : `grid` (résultat de `buildGrid`, avec `.rows`, `.cols`, `.cells`, `.seed`), `t` (ms écoulées depuis le début de l'anim), `rng` (générateur `mulberry32(grid.seed >>> 0)`, **jamais `Math.random()`**).
- `cx = grid.cols / 2`, `cy = grid.rows / 2`, `maxD = Math.hypot(cx, cy)`.
- `DECODE_DURATION_MS = 500`, `DECODE_STAGGER_MS = 500` (constantes exportées, valeurs identiques au HTML `DUR`/`STAGGER`).
- Pour chaque cellule `(r, c)` : `d = Math.hypot(c - cx, r - cy) / maxD`, `cellStart = d * DECODE_STAGGER_MS`.
  - `t >= cellStart + DECODE_DURATION_MS` → caractère final (`cell.char`, `cell.color`).
  - `t < cellStart` → blanc : `cell.char === '⠀' ? '⠀' : ' '` (préserve le blanc braille comme le HTML), `cell.color` inchangée.
  - sinon → caractère tiré de `SCRAMBLE_CHARS` via `rng()`, `cell.color` inchangée.
- Retour : `{ done, cells }` où `done = true` seulement quand toutes les cellules ont atteint leur caractère final (dernière cellule à `d=1` termine à `t = DECODE_STAGGER_MS + DECODE_DURATION_MS = 1000ms`).
- `SCRAMBLE_CHARS = '⠿⣿⢿⡿⣻⠷█▓▒░/\\|+°'` (valeur identique au HTML).

Fonction pure : mêmes `(grid, t, rng)` → même résultat. Consommation du `rng` déterministe (une valeur tirée par cellule actuellement en phase scramble, ordre ligne-major).

## 5. Boucle I/O (`bin/heraldic.js`)

```
generate(text, entropy):
  currentText = text
  currentGrid = buildGrid(text, entropy)
  generation += 1
  myGeneration = generation
  await playDecodeAnimation(currentGrid, myGeneration)

playDecodeAnimation(grid, myGeneration):
  if !process.stdout.isTTY:
    console.log(serializeAnsi(grid))
    return
  rng = mulberry32(grid.seed >>> 0)
  start = Date.now()
  first = true
  loop toutes les 50ms tant que generation === myGeneration:
    t = Date.now() - start
    frame = computeDecodeFrame(grid, t, rng)
    if !first: écrire "\x1b[<rows>A\x1b[0J"
    écrire cellsToAnsi(frame.cells) + "\n"
    first = false
    if frame.done:
      écrire "\n" + formatSeedLine(grid.meta)
      arrêter la boucle, résoudre la promesse
  si generation !== myGeneration à un tick : arrêter la boucle sans écrire, résoudre la promesse (génération périmée, une frame plus récente a pris le relais)
```

`rl.on('line', ...)` devient `async` et `await handleLine(line)` avant `rl.prompt()` (mineur changement de signature, cohérent avec le pattern `pendingExport` déjà présent pour `/export`). `COMMANDS.reroll` devient `async` et `await generate(...)`.

Curseur masqué pendant l'animation (`\x1b[?25l` au début, `\x1b[?25h` à la fin ou sur `/quit`/`Ctrl+C`) pour éviter le clignotement visible du curseur pendant la réécriture.

## 6. Gestion d'erreurs et cas limites

- Flux non-TTY (pipe, redirection, CI) → zéro animation, comportement actuel inchangé (`serializeAnsi` direct).
- Lignes bufferisées arrivant pendant une animation en cours (paste multi-lignes) → chaque nouvel appel à `generate()` incrémente `generation` ; les boucles périmées s'arrêtent silencieusement, seule la plus récente écrit à l'écran. Pas de corruption d'affichage par écritures concurrentes.
- `/quit` ou `Ctrl+C` pendant une animation → le curseur doit être restauré (`\x1b[?25h`) avant sortie ; `quitting=true` empêche tout nouveau `generate()` d'être déclenché, l'animation en cours se termine naturellement (son `generation` reste valide) ou est coupée proprement à la fermeture du process.
- `/export` et `/reroll` restent utilisables dès que `currentGrid` est assigné (avant même la fin de l'animation cosmétique), comme aujourd'hui — aucun changement d'état requis pour ces commandes.

## 7. Tests

`cli/test/animate.test.js` (`node:test`) :
- cellule à `d=0` (centre) : blanche avant `t=0+ε` impossible (cellStart=0) — donc dès `t=0` elle est en phase scramble ou déjà finale selon `t` vs `DECODE_DURATION_MS`.
- cellule à `d=1` (coin le plus excentré) : blanche pour `t < DECODE_STAGGER_MS`, scramble pour `DECODE_STAGGER_MS <= t < DECODE_STAGGER_MS + DECODE_DURATION_MS`, finale pour `t >= DECODE_STAGGER_MS + DECODE_DURATION_MS`.
- `done === true` seulement quand `t >= DECODE_STAGGER_MS + DECODE_DURATION_MS`.
- déterminisme : mêmes `(grid, t, rng)` (rng frais de même seed) → même résultat.
- caractères scramble toujours issus de `SCRAMBLE_CHARS`.

`cli/test/serialize.test.js` : ajout d'un test pour `cellsToAnsi` extrait (même comportement de regroupement de couleurs que l'actuel test de `serializeAnsi`, qui continue de passer sans modification de son propre test).

`bin/heraldic.js` (boucle `setInterval`, I/O terminal) : non testé automatiquement, vérification manuelle au vrai terminal après implémentation — comme le reste de `#blason-ui`/`bin/`.

## Hors scope

- Flag `--no-anim` ou toute configuration de l'animation (fréquence, durée) — non demandé, YAGNI.
- Gestion du redimensionnement du terminal pendant l'animation.
- Spinner ou indicateur de chargement pendant `buildGrid` (calcul synchrone quasi-instantané).
- Toute animation sur `/export` (écriture fichier, pas de rendu visuel concerné).
