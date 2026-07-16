# Animation de décodage CLI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Porter l'animation de révélation `renderDecode` de `terminal/index.html` vers le CLI Node.js `heraldic`, avec la même mécanique de stagger/scramble, un fallback instantané hors TTY, et une protection anti-corruption pour les lignes bufferisées.

**Architecture:** Extraction de `cellsToAnsi` depuis `lib/serialize.js` (réutilisé par la nouvelle animation), nouveau module pur `lib/animate.js` (`computeDecodeFrame`, testable), et câblage I/O dans `bin/heraldic.js` (boucle `setInterval`, non testée automatiquement — comme le reste de `bin/`).

**Tech Stack:** Node.js natif (`node:test`, aucune nouvelle dépendance npm).

## Global Constraints

- Jamais `Math.random()` — tout tirage aléatoire passe par `mulberry32(seed)` fourni en argument (`grid.seed >>> 0`), jamais un nouveau seed ad hoc.
- Apostrophes typographiques (`’`, U+2019) dans toutes les chaînes JS à quotes simples contenant du français — jamais d'apostrophe droite (`'`, U+0027) qui casserait la chaîne. Transcrire tel quel depuis ce document.
- Séparation stricte logique pure / I/O : `lib/animate.js` ne touche ni `process.stdout`, ni `setInterval`, ni aucune horloge (`Date.now()`) — il reçoit `t` en paramètre. Toute la boucle temporisée vit dans `bin/heraldic.js`.
- Zéro nouvelle dépendance npm.
- `DECODE_DURATION_MS = 500`, `DECODE_STAGGER_MS = 500`, `SCRAMBLE_CHARS = '⠿⣿⢿⡿⣻⠷█▓▒░/\\|+°'` — valeurs identiques à `terminal/index.html:458,462` (`DUR`, `STAGGER`, `SCRAMBLE`), non négociables (parité visuelle avec le HTML).
- Fréquence de rafraîchissement CLI : 50ms (20fps) — décision actée dans le spec (`docs/superpowers/specs/2026-07-16-cli-decode-animation-design.md`), différente du 60fps `requestAnimationFrame` du HTML.
- Fallback non-TTY : `process.stdout.isTTY === false` → impression instantanée via `serializeAnsi` existant, aucune écriture ANSI de contrôle curseur.
- Tests : `node --test` (pas d'argument, comme configuré dans `cli/package.json`).

---

### Task 1: Extraction de `cellsToAnsi` dans `lib/serialize.js`

**Files:**
- Modify: `cli/lib/serialize.js`
- Test: `cli/test/serialize.test.js`

**Interfaces:**
- Produces: `cellsToAnsi(cells)` — `cells` est `grid.cells` (tableau 2D de `{ char, color }`), retourne une chaîne ANSI truecolor (une ligne par rangée, jointes par `\n`, sans footer seed). Utilisée par `serializeAnsi(grid)` et, à la Task 3, par la boucle d'animation dans `bin/heraldic.js`.

- [ ] **Step 1: Écrire le test pour `cellsToAnsi`**

Ajouter dans `cli/test/serialize.test.js`, après l'import existant (ligne 4), en ajoutant `cellsToAnsi` à la déstructuration :

```js
const { serializeText, serializeAnsi, parseColor, escapeXml, serializeSvg, cellsToAnsi } = require('../lib/serialize');
```

Ajouter ce test après le test `'serializeAnsi: contient un escape truecolor, un reset, et la ligne seed'` (après la ligne 30 actuelle) :

```js
test('cellsToAnsi: rend les cellules d’une grille en art ANSI truecolor, sans le footer seed', () => {
  const out = cellsToAnsi(FIXTURE_GRID.cells);
  assert.ok(out.includes('\x1b[38;2;230;25;25m'));
  const stripped = out.replace(/\x1b\[[0-9;]*m/g, '');
  assert.equal(stripped, 'ABC\n⠁⠀D');
});
```

- [ ] **Step 2: Lancer les tests, vérifier l'échec**

Run: `cd cli && npm test`
Expected: FAIL — `cellsToAnsi is not a function` (ou `undefined`).

- [ ] **Step 3: Extraire `cellsToAnsi` dans `lib/serialize.js`**

Remplacer la fonction `serializeAnsi` actuelle (lignes 18-33 de `cli/lib/serialize.js`) par :

```js
function cellsToAnsi(cells) {
  const RESET = '\x1b[0m';
  return cells.map(row => {
    let line = '', last = null;
    for (const cell of row) {
      if (cell.color !== last) {
        const [r, g, b] = parseColor(cell.color);
        line += `\x1b[38;2;${r};${g};${b}m`;
        last = cell.color;
      }
      line += cell.char;
    }
    return line + RESET;
  }).join('\n');
}

function serializeAnsi(grid) {
  return `${cellsToAnsi(grid.cells)}\n\n${formatSeedLine(grid.meta)}`;
}
```

Mettre à jour l'export en bas du fichier :

```js
module.exports = { parseColor, serializeText, serializeAnsi, escapeXml, serializeSvg, cellsToAnsi };
```

- [ ] **Step 4: Lancer les tests, vérifier le succès**

Run: `cd cli && npm test`
Expected: PASS — tous les tests de `serialize.test.js` (y compris le nouveau et l'existant `serializeAnsi`, inchangé, qui doit continuer à passer sans modification).

- [ ] **Step 5: Commit**

```bash
git add cli/lib/serialize.js cli/test/serialize.test.js
git commit -m "refactor(cli): extrait cellsToAnsi de serializeAnsi pour réutilisation par l'animation"
```

---

### Task 2: Module pur `lib/animate.js` (`computeDecodeFrame`)

**Files:**
- Create: `cli/lib/animate.js`
- Test: `cli/test/animate.test.js`

**Interfaces:**
- Consumes: `mulberry32` depuis `../lib/core` (déjà exporté).
- Produces: `computeDecodeFrame(grid, t, rng)` — `grid` a `.rows`, `.cols`, `.cells` (tableau 2D `{char, color}`) ; `t` en millisecondes ; `rng` une fonction `mulberry32(seed)`. Retourne `{ done, cells }` où `cells` a la même forme que `grid.cells` avec `char` substitué selon la phase d'animation, `color` inchangée. Consommé par `bin/heraldic.js` à la Task 3.
- Exporte aussi `SCRAMBLE_CHARS`, `DECODE_DURATION_MS`, `DECODE_STAGGER_MS`.

- [ ] **Step 1: Écrire les tests (échec attendu)**

Créer `cli/test/animate.test.js` :

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { mulberry32 } = require('../lib/core');
const { computeDecodeFrame, SCRAMBLE_CHARS, DECODE_DURATION_MS, DECODE_STAGGER_MS } = require('../lib/animate');

function makeGrid(rows, cols) {
  const cells = [];
  for (let r = 0; r < rows; r++) {
    const row = [];
    for (let c = 0; c < cols; c++) row.push({ char: 'X', color: '#8A9AD4' });
    cells.push(row);
  }
  return { rows, cols, cells, seed: 1 };
}

test('computeDecodeFrame : la cellule la plus excentrée reste blanche avant son cellStart', () => {
  const grid = makeGrid(3, 3);
  const rng = mulberry32(1);
  const frame = computeDecodeFrame(grid, 0, rng);
  assert.equal(frame.cells[0][0].char, ' ');
  assert.equal(frame.done, false);
});

test('computeDecodeFrame : la cellule centrale (d=0) atteint son caractère final dès t >= DECODE_DURATION_MS', () => {
  const grid = makeGrid(3, 3);
  const rng = mulberry32(1);
  const frame = computeDecodeFrame(grid, DECODE_DURATION_MS, rng);
  assert.equal(frame.cells[1][1].char, 'X');
});

test('computeDecodeFrame : les caractères en cours de révélation viennent de SCRAMBLE_CHARS', () => {
  const grid = makeGrid(5, 5);
  const rng = mulberry32(7);
  const frame = computeDecodeFrame(grid, 1, rng);
  let sawScramble = false;
  for (const row of frame.cells) {
    for (const cell of row) {
      if (cell.char !== ' ' && cell.char !== 'X') {
        assert.ok(SCRAMBLE_CHARS.includes(cell.char));
        sawScramble = true;
      }
    }
  }
  assert.ok(sawScramble);
});

test('computeDecodeFrame : done=true seulement quand t >= DECODE_STAGGER_MS + DECODE_DURATION_MS', () => {
  const grid = makeGrid(4, 4);
  const early = computeDecodeFrame(grid, DECODE_STAGGER_MS + DECODE_DURATION_MS - 1, mulberry32(1));
  assert.equal(early.done, false);
  const late = computeDecodeFrame(grid, DECODE_STAGGER_MS + DECODE_DURATION_MS, mulberry32(1));
  assert.equal(late.done, true);
});

test('computeDecodeFrame : déterministe pour un même (grid, t, rng frais de même seed)', () => {
  const grid = makeGrid(4, 4);
  const a = computeDecodeFrame(grid, 200, mulberry32(99));
  const b = computeDecodeFrame(grid, 200, mulberry32(99));
  assert.deepEqual(a, b);
});
```

- [ ] **Step 2: Lancer les tests, vérifier l'échec**

Run: `cd cli && npm test`
Expected: FAIL — `Cannot find module '../lib/animate'`.

- [ ] **Step 3: Implémenter `lib/animate.js`**

Créer `cli/lib/animate.js` :

```js
'use strict';

const SCRAMBLE_CHARS = '⠿⣿⢿⡿⣻⠷█▓▒░/\\|+°';
const DECODE_DURATION_MS = 500;
const DECODE_STAGGER_MS = 500;

function computeDecodeFrame(grid, t, rng) {
  const cx = grid.cols / 2, cy = grid.rows / 2;
  const maxD = Math.hypot(cx, cy);
  let done = true;
  const cells = [];
  for (let r = 0; r < grid.rows; r++) {
    const row = [];
    for (let c = 0; c < grid.cols; c++) {
      const cell = grid.cells[r][c];
      const d = Math.hypot(c - cx, r - cy) / maxD;
      const cellStart = d * DECODE_STAGGER_MS;
      if (t >= cellStart + DECODE_DURATION_MS) {
        row.push({ char: cell.char, color: cell.color });
      } else if (t < cellStart) {
        row.push({ char: cell.char === '⠀' ? '⠀' : ' ', color: cell.color });
        done = false;
      } else {
        const ch = SCRAMBLE_CHARS[Math.floor(rng() * SCRAMBLE_CHARS.length)];
        row.push({ char: ch, color: cell.color });
        done = false;
      }
    }
    cells.push(row);
  }
  return { done, cells };
}

module.exports = { SCRAMBLE_CHARS, DECODE_DURATION_MS, DECODE_STAGGER_MS, computeDecodeFrame };
```

- [ ] **Step 4: Lancer les tests, vérifier le succès**

Run: `cd cli && npm test`
Expected: PASS — tous les tests, y compris les 5 nouveaux de `animate.test.js`.

- [ ] **Step 5: Commit**

```bash
git add cli/lib/animate.js cli/test/animate.test.js
git commit -m "feat(cli): ajoute computeDecodeFrame, port pur de l'algorithme renderDecode du HTML"
```

---

### Task 3: Câblage de l'animation dans `bin/heraldic.js`

**Files:**
- Modify: `cli/bin/heraldic.js`

**Interfaces:**
- Consumes: `computeDecodeFrame`, `DECODE_STAGGER_MS`, `DECODE_DURATION_MS` depuis `../lib/animate` ; `cellsToAnsi` depuis `../lib/serialize` ; `mulberry32`, `formatSeedLine` depuis `../lib/core` (`formatSeedLine` déjà importé indirectement via `serializeAnsi`, à importer explicitement ici).

Pas de fichier de test automatisé pour ce module (I/O terminal, comme le reste de `bin/` — cohérent avec le spec CLI parent). Vérification par script (fallback non-TTY, automatisable) + vérification manuelle en terminal réel (boucle animée, non automatisable).

- [ ] **Step 1: Remplacer les imports en tête de `cli/bin/heraldic.js`**

Remplacer les lignes 8-10 actuelles :

```js
const { buildGrid, slugify } = require('../lib/core');
const { serializeText, serializeAnsi, serializeSvg } = require('../lib/serialize');
const { serializeSvgToPngBuffer } = require('../lib/png');
```

par :

```js
const { buildGrid, slugify, mulberry32, formatSeedLine } = require('../lib/core');
const { serializeText, serializeAnsi, serializeSvg, cellsToAnsi } = require('../lib/serialize');
const { serializeSvgToPngBuffer } = require('../lib/png');
const { computeDecodeFrame, DECODE_STAGGER_MS, DECODE_DURATION_MS } = require('../lib/animate');
```

- [ ] **Step 2: Ajouter la constante de fréquence et le jeton de génération**

Après la ligne `let quitting = false;` (ligne 27 actuelle), ajouter :

```js
const FRAME_INTERVAL_MS = 50;
let generation = 0;
```

- [ ] **Step 3: Remplacer `generate()` par la version animée**

Remplacer la fonction `generate` actuelle (lignes 29-33) par :

```js
function playDecodeAnimation(grid, myGeneration) {
  if (!process.stdout.isTTY) {
    console.log(serializeAnsi(grid));
    return Promise.resolve();
  }
  const rng = mulberry32(grid.seed >>> 0);
  const start = Date.now();
  let first = true;
  process.stdout.write('\x1b[?25l');
  return new Promise((resolve) => {
    const timer = setInterval(() => {
      if (generation !== myGeneration) {
        clearInterval(timer);
        process.stdout.write('\x1b[?25h');
        resolve();
        return;
      }
      const t = Date.now() - start;
      const frame = computeDecodeFrame(grid, t, rng);
      if (!first) process.stdout.write(`\x1b[${grid.rows}A\x1b[0J`);
      process.stdout.write(cellsToAnsi(frame.cells) + '\n');
      first = false;
      if (frame.done) {
        clearInterval(timer);
        console.log(`\n${formatSeedLine(grid.meta)}`);
        process.stdout.write('\x1b[?25h');
        resolve();
      }
    }, FRAME_INTERVAL_MS);
  });
}

async function generate(text, entropy) {
  currentText = text;
  currentGrid = buildGrid(text, entropy);
  generation += 1;
  await playDecodeAnimation(currentGrid, generation);
}
```

- [ ] **Step 4: Rendre `COMMANDS.reroll` et `handleLine` async**

Remplacer `reroll()` dans l'objet `COMMANDS` (ligne 81-84 actuelle) :

```js
  async reroll() {
    if (!requireGrid()) return;
    await generate(currentText, makeEntropy());
  },
```

Remplacer la fonction `handleLine` (lignes 94-106 actuelles) :

```js
async function handleLine(raw) {
  const text = raw.trim();
  if (text.length === 0) return;
  if (text[0] === '/') {
    const [name, ...rest] = text.slice(1).split(/\s+/);
    const key = name.toLowerCase();
    if (key === 'export') { handleExport(rest[0] ? rest[0].toLowerCase() : undefined); return; }
    if (Object.hasOwn(COMMANDS, key)) { await COMMANDS[key](); return; }
    console.log(`commande inconnue: /${name} — tape /help`);
    return;
  }
  await generate(text, makeEntropy());
}
```

- [ ] **Step 5: Rendre le handler `rl.on('line', ...)` async**

Remplacer les lignes 116-121 actuelles :

```js
rl.prompt();
rl.on('line', (line) => {
  if (quitting) return;
  handleLine(line);
  rl.prompt();
});
```

par :

```js
rl.prompt();
rl.on('line', async (line) => {
  if (quitting) return;
  await handleLine(line);
  rl.prompt();
});
```

- [ ] **Step 6: Vérification automatisée — fallback non-TTY**

Run:

```bash
cd cli && printf 'chateau\n/quit\n' | node bin/heraldic.js > /tmp/heraldic-anim-smoke.log; echo "exit=$?"
grep -c 'SEED 0x' /tmp/heraldic-anim-smoke.log
grep -c $'\x1b\[?25l' /tmp/heraldic-anim-smoke.log
```

Expected:
- `exit=0`
- le grep `SEED 0x` retourne `1` (une seule génération, imprimée instantanément — le flux n'est pas un TTY donc `playDecodeAnimation` prend la branche fallback)
- le grep de l'escape `\x1b[?25l` (masquage curseur, exclusif à la branche TTY) retourne `0` — confirme que le fallback ne touche jamais le curseur

- [ ] **Step 7: Vérification manuelle — animation en terminal réel**

Cette étape ne peut pas être scriptée (nécessite un vrai TTY et une observation visuelle) :

1. `cd cli && node bin/heraldic.js`
2. Taper `chateau` puis Entrée.
3. Observer : la grille se révèle progressivement depuis le centre vers les bords sur environ 1 seconde (caractères braille "scramble" avant stabilisation), pas d'affichage instantané.
4. Une fois stabilisé, la ligne `SEED 0x...` apparaît sous la grille, le curseur clignote normalement au prompt (pas resté masqué).
5. Retaper un mot pendant que l'animation précédente n'est pas encore terminée (si possible) — vérifier qu'il n'y a pas de corruption visuelle (caractères mélangés de deux générations superposées), la nouvelle génération doit prendre le dessus proprement.
6. Taper `/quit` pendant une animation en cours — vérifier que le programme se termine proprement et que le curseur est visible après sortie (`\x1b[?25h` bien envoyé).

Documenter le résultat de cette vérification manuelle dans le rapport de tâche.

- [ ] **Step 8: Commit**

```bash
git add cli/bin/heraldic.js
git commit -m "feat(cli): anime la révélation du blason en TTY, fallback instantané sinon"
```

---

## Vérification finale

```bash
cd cli && npm test
```

Expected: tous les tests passent (existants + nouveaux `animate.test.js` + extension `serialize.test.js`), aucun changement de comportement sur `serializeText`, `serializeSvg`, `/export`.
