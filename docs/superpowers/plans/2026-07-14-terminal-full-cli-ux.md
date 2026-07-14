# Terminal full CLI UX — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refondre l'interaction de `terminal/index.html` en 100% commande texte (`/help`, `/reroll`, `/export <fmt>`, `/clear`), retirer tous les boutons et `alert()`, sortir le seed de la grille pour l'afficher comme ligne de statut, ajouter un banner ASCII d'ouverture, et faire de chaque ligne tapée une entrée dans un log scrollback.

**Architecture:** Le pipeline de génération (`buildGrid` et tout ce qui en dépend) ne change pas — seule la couche d'interaction change. `#blason-script` (pur, testé) perd l'écriture du seed dans la grille au profit d'une fonction `formatSeedLine(meta)` réutilisée par les 3 serializers et par l'UI. `#blason-ui` (DOM, non testé) gagne un routeur de commande qui remplace le handler `Enter` actuel + tous les listeners de boutons.

**Tech Stack:** HTML/CSS/JS vanilla, fichier unique autonome, zéro dépendance/build. Tests `node:test` + `node:vm` (aucun npm).

**Spec source :** [2026-07-14-terminal-full-cli-ux-design.md](../specs/2026-07-14-terminal-full-cli-ux-design.md)

## Global Constraints

- **Fichier unique autonome** : tout dans `terminal/index.html`. Zéro dépendance externe, zéro build, zéro backend, zéro API.
- **Séparation stricte** `#blason-script` (pur, zéro DOM, testé) vs `#blason-ui` (DOM, non testé). Aucun code DOM ne fuit dans `#blason-script`.
- **Jamais `Math.random()`** — inchangé par ce plan, aucune tâche n'y touche.
- **Palette** : fond `#0A0A0A`, glyphes bleu `#6B7EC4`→`#8A9AD4`, accent hazard `#E61919`. Zéro `border-radius`, coins 90°, monospace exclusif.
- **Apostrophes typographiques dans les strings JS simple-quote** : le projet a buté 2 fois sur des caractères visuellement quasi-identiques transcrits par erreur (combining chars, apostrophe droite vs typographique — cf. CLAUDE.md). Règle stricte pour ce plan : **toute apostrophe dans un texte affiché à l'utilisateur s'écrit `’` (échappement Unicode explicite), jamais un caractère `'` ou `’` littéral.** Aucune ambiguïté possible à la transcription.
- **Plus de `vvd.world` / `odilon.wav`** dans cette variante terminal (branding retiré du spec, demande explicite) — le prompt devient `heraldic:~$` (au lieu de `heraldic@vvd:~$`).
- **`PNG` export reste 1080×1350`** (contrainte du spec précédent, non renégociée). L'ajout de la ligne seed se fait en réduisant légèrement la hauteur de cellule (`h / (rows + 1)` au lieu de `h / rows`), jamais en changeant les attributs `width`/`height` du `<canvas>`.
- **Grid** = `{ cols, rows, cells:Cell[][], seed:uint32, meta:{ seed:uint32, rev:string, unit:string } }` — `meta.seed` existe déjà (voir `buildGrid` actuel), aucune tâche n'a besoin de le rajouter.

---

## Ordre d'exécution

```
Task 1 ──> Task 2 ──> Task 3 ──> Task 4 ──> Task 5 ──> Task 6
```

**Strictement séquentiel, un agent frais par tâche, dans le dossier `main` (pas de worktree).**
Contrairement au plan précédent (build initial, où chaque tâche *ajoutait* du code
isolé à une ancre), ce plan *modifie* et *supprime* du code existant partagé
(`#blason-ui` en particulier est réécrit sur 3 tâches consécutives). Le
parallélisme via worktrees créerait des conflits non triviaux à chaque paire de
tâches touchant `#blason-ui`. Le gain de tokens vient — comme la dernière fois —
du **contexte isolé par agent** (chaque agent ne lit que sa tâche, pas tout le
plan ni tout l'historique du projet), pas de la concurrence d'exécution.

Chaque tâche est petite (2–5 min de travail réel), auto-portante (contient le
code complet avant/après, pas besoin de lire les autres tâches), se termine par
un commit atomique. Task 1–2 sont TDD strict (testées). Task 3–5 sont DOM/UI
(non testées par design du projet — vérification manuelle décrite dans chaque
tâche). Task 6 est documentation.

---

## Task 1: `#blason-script` — sortir le seed de la grille, extraire `formatSeedLine`

**Files:**
- Modify: `terminal/index.html` (`#blason-script`, fonction `overlayStructural`)
- Modify: `terminal/test/core.test.js`

**Interfaces:**
- Consumes: rien de nouveau.
- Produces: `overlayStructural(cells, params) -> Cell[][]` (signature changée : **le paramètre `meta` est retiré**, plus aucune tâche/écran ne doit lui passer 3 arguments) ; nouvelle fonction pure `formatSeedLine(meta) -> string`.

- [ ] **Step 1: Modifier `overlayStructural` — retirer l'écriture de la ligne data, retirer le paramètre `meta`**

Dans `terminal/index.html`, la fonction `overlayStructural` ressemble actuellement à :

```js
    function overlayStructural(cells, params, meta) {
      const rows = cells.length, cols = cells[0].length;
      const put = (r, c, ch, layer) => {
        if (r >= 0 && r < rows && c >= 0 && c < cols) {
          cells[r][c] = { char: ch, intensity: 1, layer: layer || 'struct' };
        }
      };
      // Cadre
      if (params.frame === 'box') {
        for (let c = 0; c < cols; c++) { put(0, c, '─'); put(rows - 1, c, '─'); }
        for (let r = 0; r < rows; r++) { put(r, 0, '│'); put(r, cols - 1, '│'); }
        put(0, 0, '┌'); put(0, cols - 1, '┐'); put(rows - 1, 0, '└'); put(rows - 1, cols - 1, '┘');
      } else if (params.frame === 'brackets') {
        put(0, 0, '['); put(0, cols - 1, ']'); put(rows - 1, 0, '['); put(rows - 1, cols - 1, ']');
      } else { // ticks
        for (let c = 0; c < cols; c += 8) { put(0, c, '+'); put(rows - 1, c, '+'); }
      }
      // Crosshairs aux intersections internes
      for (let r = 6; r < rows - 6; r += 12) {
        for (let c = 8; c < cols - 8; c += 16) put(r, c, '+');
      }
      // Ligne de données (avant-dernière ligne)
      const hex = (meta.seed >>> 0).toString(16).toUpperCase().padStart(8, '0');
      const label = `SEED 0x${hex}  REV ${meta.rev}  ${meta.unit}`;
      const start = 2;
      for (let i = 0; i < label.length && start + i < cols - 2; i++) {
        put(rows - 2, start + i, label[i], 'data');
      }
      return cells;
    }
```

Remplacer par (retire le bloc "Ligne de données" et le paramètre `meta`, ajoute
`formatSeedLine` juste après) :

```js
    function overlayStructural(cells, params) {
      const rows = cells.length, cols = cells[0].length;
      const put = (r, c, ch, layer) => {
        if (r >= 0 && r < rows && c >= 0 && c < cols) {
          cells[r][c] = { char: ch, intensity: 1, layer: layer || 'struct' };
        }
      };
      // Cadre
      if (params.frame === 'box') {
        for (let c = 0; c < cols; c++) { put(0, c, '─'); put(rows - 1, c, '─'); }
        for (let r = 0; r < rows; r++) { put(r, 0, '│'); put(r, cols - 1, '│'); }
        put(0, 0, '┌'); put(0, cols - 1, '┐'); put(rows - 1, 0, '└'); put(rows - 1, cols - 1, '┘');
      } else if (params.frame === 'brackets') {
        put(0, 0, '['); put(0, cols - 1, ']'); put(rows - 1, 0, '['); put(rows - 1, cols - 1, ']');
      } else { // ticks
        for (let c = 0; c < cols; c += 8) { put(0, c, '+'); put(rows - 1, c, '+'); }
      }
      // Crosshairs aux intersections internes
      for (let r = 6; r < rows - 6; r += 12) {
        for (let c = 8; c < cols - 8; c += 16) put(r, c, '+');
      }
      return cells;
    }

    function formatSeedLine(meta) {
      const hex = (meta.seed >>> 0).toString(16).toUpperCase().padStart(8, '0');
      return `SEED 0x${hex}  REV ${meta.rev}  ${meta.unit}`;
    }
```

Trouver ensuite, juste en dessous, le bloc d'export existant :

```js
    if (typeof module !== 'undefined' && module.exports) {
      Object.assign(module.exports, { overlayStructural });
    }
```

Le remplacer par :

```js
    if (typeof module !== 'undefined' && module.exports) {
      Object.assign(module.exports, { overlayStructural, formatSeedLine });
    }
```

- [ ] **Step 2: Mettre à jour l'appel dans `buildGrid`**

Trouver, plus bas dans `#blason-script` :

```js
      cells = overlayStructural(cells, params, meta);
```

Remplacer par (le 3ème argument disparaît — `meta` reste construit juste avant
et utilisé ensuite pour `grid.meta`, ça ne change pas) :

```js
      cells = overlayStructural(cells, params);
```

- [ ] **Step 3: Mettre à jour les tests existants sur `overlayStructural`**

Dans `terminal/test/core.test.js`, trouver le test :

```js
test('overlayStructural frame=box: coins et bords', () => {
  const core = loadBlasonCore();
  const cells = blankGrid(core, 80, 50);
  const meta = { seed: 0x7F3A, rev: '2.6', unit: 'UNIT/D-01' };
  core.overlayStructural(cells, { frame: 'box' }, meta);
  assert.equal(cells[0][0].char, '┌');
  assert.equal(cells[0][79].char, '┐');
  assert.equal(cells[49][0].char, '└');
  assert.equal(cells[49][79].char, '┘');
  assert.equal(cells[0][0].layer, 'struct');
});
```

Remplacer par :

```js
test('overlayStructural frame=box: coins et bords', () => {
  const core = loadBlasonCore();
  const cells = blankGrid(core, 80, 50);
  core.overlayStructural(cells, { frame: 'box' });
  assert.equal(cells[0][0].char, '┌');
  assert.equal(cells[0][79].char, '┐');
  assert.equal(cells[49][0].char, '└');
  assert.equal(cells[49][79].char, '┘');
  assert.equal(cells[0][0].layer, 'struct');
});
```

Trouver ensuite :

```js
test('overlayStructural: ligne data contient le SEED en hex et layer=data', () => {
  const core = loadBlasonCore();
  const cells = blankGrid(core, 80, 50);
  core.overlayStructural(cells, { frame: 'box' }, { seed: 0x7F3A, rev: '2.6', unit: 'UNIT/D-01' });
  const dataRow = cells[48].map(c => c.char).join('');
  assert.ok(dataRow.includes('SEED 0x'));
  assert.ok(dataRow.includes('00007F3A'));
  const hasDataLayer = cells[48].some(c => c.layer === 'data');
  assert.ok(hasDataLayer);
});
```

Remplacer par :

```js
test('overlayStructural: n\u2019écrit plus de ligne data dans la grille', () => {
  const core = loadBlasonCore();
  const cells = blankGrid(core, 80, 50);
  core.overlayStructural(cells, { frame: 'box' });
  const hasDataLayer = cells.some(row => row.some(c => c.layer === 'data'));
  assert.equal(hasDataLayer, false);
});

test('formatSeedLine: hex sur 8 caractères + rev + unit', () => {
  const { formatSeedLine } = loadBlasonCore();
  const line = formatSeedLine({ seed: 0x7F3A, rev: '2.6', unit: 'UNIT/D-01' });
  assert.equal(line, 'SEED 0x00007F3A  REV 2.6  UNIT/D-01');
});
```

Trouver enfin :

```js
test('overlayStructural frame=ticks: pas de bordure pleine', () => {
  const core = loadBlasonCore();
  const cells = blankGrid(core, 80, 50);
  core.overlayStructural(cells, { frame: 'ticks' }, { seed: 1, rev: '2.6', unit: 'U' });
  assert.equal(cells[0][0].char, '+'); // tick au coin
});
```

Remplacer par :

```js
test('overlayStructural frame=ticks: pas de bordure pleine', () => {
  const core = loadBlasonCore();
  const cells = blankGrid(core, 80, 50);
  core.overlayStructural(cells, { frame: 'ticks' });
  assert.equal(cells[0][0].char, '+'); // tick au coin
});
```

- [ ] **Step 4: Lancer les tests, vérifier vert**

Run: `node --test terminal/test/core.test.js`
Expected: tous les tests PASS (le test `buildGrid: grille complète bien formée`
et les autres tests `buildGrid`/`colorize` ne référencent pas la ligne data,
donc non affectés).

- [ ] **Step 5: Commit**

```bash
git add terminal/index.html terminal/test/core.test.js
git commit -m "refactor(terminal): sort le seed de la grille, extrait formatSeedLine"
```

---

## Task 2: `#blason-script` — les 3 serializers ajoutent le seed en métadonnée

**Files:**
- Modify: `terminal/index.html` (`#blason-script`, fonctions `serializeText`, `serializeAnsi`, `serializeSvg`)
- Modify: `terminal/test/core.test.js`

**Interfaces:**
- Consumes: `formatSeedLine(meta)` (Task 1).
- Produces: `serializeText(grid) -> string`, `serializeAnsi(grid) -> string`, `serializeSvg(grid, opts) -> string` — les 3 incluent désormais la ligne seed après l'art.

- [ ] **Step 1: Modifier `serializeText`**

Trouver :

```js
    function serializeText(grid) {
      return grid.cells.map(row => row.map(c => c.char).join('')).join('\n');
    }
```

Remplacer par :

```js
    function serializeText(grid) {
      const art = grid.cells.map(row => row.map(c => c.char).join('')).join('\n');
      return `${art}\n\n${formatSeedLine(grid.meta)}`;
    }
```

- [ ] **Step 2: Modifier `serializeAnsi`**

Trouver :

```js
    function serializeAnsi(grid) {
      const RESET = '\x1b[0m';
      return grid.cells.map(row => {
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
```

Remplacer par :

```js
    function serializeAnsi(grid) {
      const RESET = '\x1b[0m';
      const art = grid.cells.map(row => {
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
      return `${art}\n\n${formatSeedLine(grid.meta)}`;
    }
```

- [ ] **Step 3: Modifier `serializeSvg`**

Trouver :

```js
    function serializeSvg(grid, opts) {
      opts = opts || {};
      const cw = opts.cellW || 13.5, ch = opts.cellH || 27, fs = opts.fontSize || 24;
      const w = grid.cols * cw, h = grid.rows * ch;
      let out = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`;
      out += `<rect width="${w}" height="${h}" fill="#0A0A0A"/>`;
      out += `<g font-family="monospace" font-size="${fs}" xml:space="preserve">`;
      for (let r = 0; r < grid.rows; r++) {
        const y = ((r + 0.8) * ch).toFixed(1);
        for (let c = 0; c < grid.cols; c++) {
          const cell = grid.cells[r][c];
          if (cell.char === ' ' || cell.char === '⠀') continue;
          const x = (c * cw).toFixed(1);
          out += `<text x="${x}" y="${y}" fill="${cell.color}">${escapeXml(cell.char)}</text>`;
        }
      }
      out += `</g></svg>`;
      return out;
    }
```

Remplacer par (hauteur totale `+1` ligne, `<text>` supplémentaire sous l'art) :

```js
    function serializeSvg(grid, opts) {
      opts = opts || {};
      const cw = opts.cellW || 13.5, ch = opts.cellH || 27, fs = opts.fontSize || 24;
      const w = grid.cols * cw, h = (grid.rows + 1) * ch;
      let out = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`;
      out += `<rect width="${w}" height="${h}" fill="#0A0A0A"/>`;
      out += `<g font-family="monospace" font-size="${fs}" xml:space="preserve">`;
      for (let r = 0; r < grid.rows; r++) {
        const y = ((r + 0.8) * ch).toFixed(1);
        for (let c = 0; c < grid.cols; c++) {
          const cell = grid.cells[r][c];
          if (cell.char === ' ' || cell.char === '⠀') continue;
          const x = (c * cw).toFixed(1);
          out += `<text x="${x}" y="${y}" fill="${cell.color}">${escapeXml(cell.char)}</text>`;
        }
      }
      const seedY = ((grid.rows + 0.8) * ch).toFixed(1);
      out += `<text x="0" y="${seedY}" fill="#8A9AD4">${escapeXml(formatSeedLine(grid.meta))}</text>`;
      out += `</g></svg>`;
      return out;
    }
```

- [ ] **Step 4: Mettre à jour la fixture de test et les 3 tests de serializers**

Dans `terminal/test/core.test.js`, trouver :

```js
const FIXTURE_GRID = { cols: 3, rows: 2, cells: [
  [{ char: 'A', color: '#E61919', layer: 'data' },
   { char: 'B', color: '#8A9AD4', layer: 'struct' },
   { char: 'C', color: 'rgb(107, 126, 196)', layer: 'braille' }],
  [{ char: '⠁', color: 'rgb(120, 130, 200)', layer: 'braille' },
   { char: '⠀', color: 'rgb(107, 126, 196)', layer: 'braille' },
   { char: 'D', color: '#8A9AD4', layer: 'struct' }],
], seed: 42, meta: { rev: '2.6', unit: 'U' } };
```

Remplacer par (ajoute `seed` dans `meta`, comme le fait réellement `buildGrid`) :

```js
const FIXTURE_GRID = { cols: 3, rows: 2, cells: [
  [{ char: 'A', color: '#E61919', layer: 'data' },
   { char: 'B', color: '#8A9AD4', layer: 'struct' },
   { char: 'C', color: 'rgb(107, 126, 196)', layer: 'braille' }],
  [{ char: '⠁', color: 'rgb(120, 130, 200)', layer: 'braille' },
   { char: '⠀', color: 'rgb(107, 126, 196)', layer: 'braille' },
   { char: 'D', color: '#8A9AD4', layer: 'struct' }],
], seed: 42, meta: { seed: 42, rev: '2.6', unit: 'U' } };
```

Trouver :

```js
test('serializeText: lignes jointes, glyphes bruts', () => {
  const { serializeText } = loadBlasonCore();
  assert.equal(serializeText(FIXTURE_GRID), 'ABC\n⠁⠀D');
});
```

Remplacer par :

```js
test('serializeText: lignes jointes, glyphes bruts + ligne seed', () => {
  const { serializeText } = loadBlasonCore();
  assert.equal(serializeText(FIXTURE_GRID), 'ABC\n⠁⠀D\n\nSEED 0x0000002A  REV 2.6  U');
});
```

Trouver :

```js
test('serializeAnsi: contient un escape truecolor et un reset', () => {
  const { serializeAnsi } = loadBlasonCore();
  const out = serializeAnsi(FIXTURE_GRID);
  assert.ok(out.includes('\x1b[38;2;230;25;25m')); // rouge hazard du 'A'
  assert.ok(out.includes('\x1b[0m'));
  // le texte visible (hors escapes) reste lisible
  const stripped = out.replace(/\x1b\[[0-9;]*m/g, '');
  assert.equal(stripped, 'ABC\n⠁⠀D');
});
```

Remplacer par :

```js
test('serializeAnsi: contient un escape truecolor, un reset, et la ligne seed', () => {
  const { serializeAnsi } = loadBlasonCore();
  const out = serializeAnsi(FIXTURE_GRID);
  assert.ok(out.includes('\x1b[38;2;230;25;25m')); // rouge hazard du 'A'
  assert.ok(out.includes('\x1b[0m'));
  // le texte visible (hors escapes) reste lisible, seed inclus
  const stripped = out.replace(/\x1b\[[0-9;]*m/g, '');
  assert.equal(stripped, 'ABC\n⠁⠀D\n\nSEED 0x0000002A  REV 2.6  U');
});
```

Trouver :

```js
test('serializeSvg: enveloppe SVG + fond + dimensions', () => {
  const { serializeSvg } = loadBlasonCore();
  const svg = serializeSvg(FIXTURE_GRID, { cellW: 10, cellH: 20, fontSize: 18 });
  assert.ok(svg.startsWith('<svg'));
  assert.ok(svg.includes('width="30"'));   // 3 cols × 10
  assert.ok(svg.includes('height="40"'));  // 2 rows × 20
  assert.ok(svg.includes('fill="#0A0A0A"')); // fond
  assert.ok(svg.trim().endsWith('</svg>'));
});
```

Remplacer par (hauteur = `(rows+1) × ch` désormais) :

```js
test('serializeSvg: enveloppe SVG + fond + dimensions (rows+1 pour la ligne seed)', () => {
  const { serializeSvg } = loadBlasonCore();
  const svg = serializeSvg(FIXTURE_GRID, { cellW: 10, cellH: 20, fontSize: 18 });
  assert.ok(svg.startsWith('<svg'));
  assert.ok(svg.includes('width="30"'));   // 3 cols × 10
  assert.ok(svg.includes('height="60"'));  // (2 rows + 1) × 20
  assert.ok(svg.includes('fill="#0A0A0A"')); // fond
  assert.ok(svg.trim().endsWith('</svg>'));
});
```

Trouver :

```js
test('serializeSvg: dessine les glyphes non-blancs, saute le blank braille', () => {
  const { serializeSvg } = loadBlasonCore();
  const svg = serializeSvg(FIXTURE_GRID);
  assert.ok(svg.includes('>A</text>'));
  assert.ok(svg.includes('fill="#E61919"')); // couleur du 'A'
  // le blank U+2800 (cellule [1][1]) ne doit PAS produire de <text> pour ce glyphe
  const textCount = (svg.match(/<text /g) || []).length;
  assert.equal(textCount, 5); // A B C ⠁ D (5 non-blancs sur 6 cellules)
});
```

Remplacer par (le `<text>` de la ligne seed s'ajoute au compte) :

```js
test('serializeSvg: dessine les glyphes non-blancs, saute le blank braille, ajoute la ligne seed', () => {
  const { serializeSvg } = loadBlasonCore();
  const svg = serializeSvg(FIXTURE_GRID);
  assert.ok(svg.includes('>A</text>'));
  assert.ok(svg.includes('fill="#E61919"')); // couleur du 'A'
  assert.ok(svg.includes('SEED 0x0000002A')); // ligne seed présente
  // le blank U+2800 (cellule [1][1]) ne doit PAS produire de <text> pour ce glyphe
  const textCount = (svg.match(/<text /g) || []).length;
  assert.equal(textCount, 6); // A B C ⠁ D + 1 ligne seed
});
```

- [ ] **Step 5: Lancer les tests, vérifier vert**

Run: `node --test terminal/test/core.test.js`
Expected: tous les tests PASS.

- [ ] **Step 6: Commit**

```bash
git add terminal/index.html terminal/test/core.test.js
git commit -m "feat(terminal): les serializers texte/ANSI/SVG ajoutent le seed en métadonnée"
```

---

## Task 3: Markup + CSS — banner, retrait des boutons, conteneurs log/seed

**Files:**
- Modify: `terminal/index.html` (`<style>`, `<body>` — uniquement le markup, aucune logique JS)

**Interfaces:**
- Consumes: rien.
- Produces: éléments DOM `#blason-banner`, `#blason-log`, `#blason-seed` (nouveaux) ; `#blason-actions` et ses 6 `<button>` (supprimés) ; texte du prompt changé en `heraldic:~$`.

- [ ] **Step 1: Retirer les règles CSS des boutons**

Trouver, dans `<style>` :

```css
  button {
    background: var(--color-bg); color: var(--color-b); border: 1px solid var(--color-a);
    padding: 10px 14px; font-family: monospace; font-size: 14px; min-height: 44px;
    cursor: pointer; text-transform: uppercase;
  }
  button:hover:not(:disabled) { border-color: var(--color-b); }
  button:disabled { opacity: 0.5; cursor: not-allowed; }
  button:focus-visible { outline: 2px solid var(--color-b); outline-offset: 2px; }
```

Supprimer ce bloc entièrement (plus aucun `<button>` dans le fichier final).

- [ ] **Step 2: Ajouter les styles banner/log/seed**

Juste avant la fermeture `</style>` (là où se trouvait le bloc bouton retiré),
ajouter :

```css
  #blason-banner {
    margin: 0; color: var(--color-a); font-size: 13px; line-height: 1.3;
    width: 100%; max-width: 520px;
  }
  #blason-log {
    margin: 0; width: 100%; max-width: 520px; font-size: 13px; line-height: 1.4;
    white-space: pre-wrap; color: var(--color-b);
  }
  #blason-log .log-error { color: var(--color-hazard); }
  #blason-seed {
    font-size: 12px; color: var(--color-a); letter-spacing: 0.02em;
  }
```

- [ ] **Step 3: Réordonner et remplacer le markup du `<body>`**

Trouver :

```html
  <canvas id="blason-canvas" width="1080" height="1350" style="display:none"></canvas>
  <pre id="blason-out"></pre>
  <div id="blason-prompt">
    <label for="blason-input" class="sr-only">Mot-clé ou phrase à transformer en blason</label>
    <span aria-hidden="true">heraldic@vvd:~$</span>
    <input id="blason-input" type="text" placeholder="tape un mot puis Entrée" autocomplete="off" spellcheck="false">
  </div>
  <div id="blason-actions">
    <button id="blason-reroll" type="button">[ RE-ROLL ]</button>
    <button id="export-png" type="button">PNG</button>
    <button id="export-copy" type="button">COPIER TXT</button>
    <button id="export-txt" type="button">.TXT</button>
    <button id="export-ans" type="button">.ANS</button>
    <button id="export-svg" type="button">.SVG</button>
  </div>
```

Remplacer par (ordre : banner → log → prompt → art → seed, conforme au layout
du spec §3) :

```html
  <canvas id="blason-canvas" width="1080" height="1350" style="display:none"></canvas>
  <pre id="blason-banner">┌────────────────────────────────┐
│  HERALDIC TERMINAL              │
│  v2.6 — tape /help              │
└────────────────────────────────┘</pre>
  <div id="blason-log"></div>
  <div id="blason-prompt">
    <label for="blason-input" class="sr-only">Mot-clé ou phrase à transformer en blason, ou commande /help</label>
    <span aria-hidden="true">heraldic:~$</span>
    <input id="blason-input" type="text" placeholder="tape un mot ou /help" autocomplete="off" spellcheck="false">
  </div>
  <pre id="blason-out"></pre>
  <div id="blason-seed"></div>
```

- [ ] **Step 4: Vérification structurelle (grep, pas de navigateur requis)**

Run: `grep -c '<button' terminal/index.html`
Expected: `0`

Run: `grep -n 'id="blason-banner"\|id="blason-log"\|id="blason-seed"' terminal/index.html`
Expected: 3 lignes trouvées.

Run: `node --test terminal/test/core.test.js`
Expected: tous les tests PASS (cette tâche ne touche pas `#blason-script`, donc
aucune régression possible côté testé — mais on vérifie qu'on n'a rien cassé
par erreur en éditant le fichier).

- [ ] **Step 5: Vérification manuelle navigateur**

Ouvrir `terminal/index.html` dans un navigateur. Vérifier :
- Le banner box-drawing s'affiche en haut, aligné (ajuster le nombre d'espaces
  dans les lignes du `<pre>` si le rendu monospace décale légèrement les bords
  droits — cosmétique, pas bloquant).
- Aucun bouton visible à l'écran.
- Le prompt affiche `heraldic:~$` (pas `heraldic@vvd:~$`).

- [ ] **Step 6: Commit**

```bash
git add terminal/index.html
git commit -m "refactor(terminal): retire les boutons, ajoute banner + conteneurs log/seed"
```

---

## Task 4: `#blason-ui` — routeur de commande, log, `/help` `/reroll` `/clear` `/export`

**Files:**
- Modify: `terminal/index.html` (`#blason-ui`, tout le câblage d'interaction)

**Interfaces:**
- Consumes: `formatSeedLine` (Task 1), `buildGrid`/`makeEntropy`/`slugify`/`serializeText`/`serializeAnsi`/`serializeSvg` (existants/Task 2), éléments DOM `#blason-log`/`#blason-seed`/`#blason-input` (Task 3).
- Produces: `logLine(text, opts)`, `handleLine(raw)`, `runExport(fmt)` — tous internes à `#blason-ui`, aucun autre script n'en dépend.

- [ ] **Step 1: Remplacer tout le bloc d'interaction existant**

Trouver, dans `#blason-ui`, à partir de la déclaration des éléments DOM
jusqu'à la fin des listeners d'export (tout le bloc entre le commentaire
`<<< ANCHOR:UI` et la fin de `renderDecode`, PUIS tout ce qui suit `renderDecode`
jusqu'à la fermeture `</script>`) :

```js
    const input = document.getElementById('blason-input');
    const out = document.getElementById('blason-out');
    const rerollBtn = document.getElementById('blason-reroll');

    let currentText = '';
    let currentEntropy = 0;
    let currentGrid = null;

    function generate(text, entropy) {
      currentText = text;
      currentEntropy = entropy >>> 0;
      currentGrid = buildGrid(text, currentEntropy);
      renderDecode(currentGrid, out);
    }

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const text = input.value.trim();
        if (text.length === 0) return;
        generate(text, makeEntropy());
      }
    });

    rerollBtn.addEventListener('click', () => {
      if (currentText.length === 0) return;
      generate(currentText, makeEntropy());
    });

    // Raccourci clavier 'R' pour reroll (hors focus input)
    document.addEventListener('keydown', (e) => {
      if ((e.key === 'r' || e.key === 'R') && document.activeElement !== input) {
        if (currentText.length > 0) generate(currentText, makeEntropy());
      }
    });

    // T11: Câblage des 4 exports
    function downloadBlob(blob, filename) {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
    }

    function requireGrid() {
      if (!currentGrid) { alert('Génère un blason d’abord (tape un mot + Entrée).'); return false; }
      return true;
    }

    document.getElementById('export-png').addEventListener('click', () => {
      if (!requireGrid()) return;
      const cv = document.getElementById('blason-canvas');
      renderToCanvas(cv.getContext('2d'), currentGrid, cv.width, cv.height);
      cv.toBlob((blob) => downloadBlob(blob, `${slugify(currentText)}.png`), 'image/png');
    });

    document.getElementById('export-copy').addEventListener('click', async () => {
      if (!requireGrid()) return;
      await navigator.clipboard.writeText(serializeText(currentGrid));
    });

    document.getElementById('export-txt').addEventListener('click', () => {
      if (!requireGrid()) return;
      downloadBlob(new Blob([serializeText(currentGrid)], { type: 'text/plain' }), `${slugify(currentText)}.txt`);
    });

    document.getElementById('export-ans').addEventListener('click', () => {
      if (!requireGrid()) return;
      downloadBlob(new Blob([serializeAnsi(currentGrid)], { type: 'text/plain' }), `${slugify(currentText)}.ans`);
    });

    document.getElementById('export-svg').addEventListener('click', () => {
      if (!requireGrid()) return;
      downloadBlob(new Blob([serializeSvg(currentGrid)], { type: 'image/svg+xml' }), `${slugify(currentText)}.svg`);
    });
```

Remplacer l'intégralité de ce bloc par :

```js
    const input = document.getElementById('blason-input');
    const out = document.getElementById('blason-out');
    const logEl = document.getElementById('blason-log');
    const seedEl = document.getElementById('blason-seed');

    let currentText = '';
    let currentEntropy = 0;
    let currentGrid = null;

    function logLine(text, opts) {
      const div = document.createElement('div');
      if (opts && opts.error) div.className = 'log-error';
      div.textContent = text;
      logEl.appendChild(div);
    }

    function generate(text, entropy) {
      currentText = text;
      currentEntropy = entropy >>> 0;
      currentGrid = buildGrid(text, currentEntropy);
      renderDecode(currentGrid, out);
      seedEl.textContent = formatSeedLine(currentGrid.meta);
    }

    function downloadBlob(blob, filename) {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
    }

    const EXPORT_FORMATS = ['png', 'txt', 'copy', 'ans', 'svg'];

    function runExport(fmt) {
      if (fmt === 'png') {
        const cv = document.getElementById('blason-canvas');
        renderToCanvas(cv.getContext('2d'), currentGrid, cv.width, cv.height);
        cv.toBlob((blob) => downloadBlob(blob, `${slugify(currentText)}.png`), 'image/png');
      } else if (fmt === 'copy') {
        navigator.clipboard.writeText(serializeText(currentGrid));
      } else if (fmt === 'txt') {
        downloadBlob(new Blob([serializeText(currentGrid)], { type: 'text/plain' }), `${slugify(currentText)}.txt`);
      } else if (fmt === 'ans') {
        downloadBlob(new Blob([serializeAnsi(currentGrid)], { type: 'text/plain' }), `${slugify(currentText)}.ans`);
      } else if (fmt === 'svg') {
        downloadBlob(new Blob([serializeSvg(currentGrid)], { type: 'image/svg+xml' }), `${slugify(currentText)}.svg`);
      }
    }

    function requireGrid() {
      if (!currentGrid) {
        logLine(`aucun blason généré — tape un mot d\u2019abord`, { error: true });
        return false;
      }
      return true;
    }

    const COMMANDS = {
      help() {
        logLine([
          'commandes disponibles :',
          '  <texte>              génère un blason à partir du texte',
          '  /reroll              nouveau tirage du même texte',
          '  /export <fmt>        exporte le dernier blason (fmt: png, txt, copy, ans, svg)',
          '  /clear                vide l\u2019historique affiché',
          '  /help                 affiche cette liste',
        ].join('\n'));
      },
      reroll() {
        if (!requireGrid()) return;
        generate(currentText, makeEntropy());
      },
      clear() {
        logEl.innerHTML = '';
      },
    };

    function handleExport(arg) {
      if (!arg || !EXPORT_FORMATS.includes(arg)) {
        logLine(`format invalide — formats: ${EXPORT_FORMATS.join(', ')}`, { error: true });
        return;
      }
      if (!requireGrid()) return;
      runExport(arg);
    }

    function handleLine(raw) {
      const text = raw.trim();
      if (text.length === 0) return;
      logLine(`heraldic:~$ ${raw}`);
      if (text[0] === '/') {
        const [name, ...rest] = text.slice(1).split(/\s+/);
        const key = name.toLowerCase();
        if (key === 'export') { handleExport(rest[0] ? rest[0].toLowerCase() : undefined); return; }
        if (COMMANDS[key]) { COMMANDS[key](); return; }
        logLine(`commande inconnue: /${name} — tape /help`, { error: true });
        return;
      }
      generate(text, makeEntropy());
    }

    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      const raw = input.value;
      input.value = '';
      handleLine(raw);
    });
```

- [ ] **Step 2: Vérifier qu'aucun `alert(` ne subsiste**

Run: `grep -c 'alert(' terminal/index.html`
Expected: `0`

- [ ] **Step 3: Vérifier l'absence du raccourci `R` et des IDs de boutons disparus**

Run: `grep -n "e.key === 'r'\|export-png\|export-copy\|export-txt\|export-ans\|export-svg\|blason-reroll" terminal/index.html`
Expected: aucune ligne trouvée.

- [ ] **Step 4: `node --test` — vérifier qu'on n'a rien cassé côté testé**

Run: `node --test terminal/test/core.test.js`
Expected: tous les tests PASS (cette tâche ne touche que `#blason-ui`, non
testé, mais `buildGrid`/etc. doivent rester intacts).

- [ ] **Step 5: Vérification manuelle navigateur**

Ouvrir `terminal/index.html`. Vérifier :
- Taper un mot + Entrée → ligne échoée dans le log (`heraldic:~$ <mot>`),
  blason généré, ligne seed affichée sous l'art.
- `/help` + Entrée → liste des 5 commandes affichée dans le log.
- `/reroll` sans avoir généré de blason (recharger la page d'abord) → ligne
  d'erreur rouge dans le log, pas de crash console.
- `/reroll` après avoir généré un blason → nouveau tirage, même famille.
- `/clear` → log vidé, art + ligne seed toujours affichés.
- `/xyz` → `commande inconnue: /xyz — tape /help` en rouge dans le log.
- `/export` (sans argument) → ligne d'erreur listant les formats valides.
- Touche Entrée sur champ vide → rien ne se passe (pas de ligne vide dans le
  log).
- Console navigateur : aucune erreur JS.

- [ ] **Step 6: Commit**

```bash
git add terminal/index.html
git commit -m "feat(terminal): routeur de commande /help /reroll /clear /export, retire boutons et alert()"
```

---

## Task 5: `#blason-ui` — ligne seed dans l'export PNG (`renderToCanvas`)

**Files:**
- Modify: `terminal/index.html` (`#blason-ui`, fonction `renderToCanvas`)

**Interfaces:**
- Consumes: `formatSeedLine` (Task 1), appelée depuis `runExport('png')` (Task 4, inchangée par cette tâche).
- Produces: `renderToCanvas(ctx, grid, w, h)` modifiée — dessine désormais la
  ligne seed sous l'art, dans le même canvas 1080×1350.

- [ ] **Step 1: Modifier `renderToCanvas`**

Trouver :

```js
    function renderToCanvas(ctx, grid, w, h) {
      const cw = w / grid.cols, ch = h / grid.rows;
      ctx.fillStyle = '#0A0A0A';
      ctx.fillRect(0, 0, w, h);
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      ctx.font = `${Math.floor(ch * 0.9)}px monospace`;
      for (let r = 0; r < grid.rows; r++) {
        for (let c = 0; c < grid.cols; c++) {
          const cell = grid.cells[r][c];
          if (cell.char === ' ' || cell.char === '⠀') continue;
          ctx.fillStyle = cell.color;
          ctx.fillText(cell.char, c * cw + cw / 2, r * ch + ch / 2);
        }
      }
    }
```

Remplacer par (réserve la dernière tranche de hauteur — `h / (rows + 1)` — pour
la ligne seed, sans changer `w`/`h` du canvas, donc sans changer la taille du
PNG exporté) :

```js
    function renderToCanvas(ctx, grid, w, h) {
      const cw = w / grid.cols, ch = h / (grid.rows + 1);
      ctx.fillStyle = '#0A0A0A';
      ctx.fillRect(0, 0, w, h);
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      ctx.font = `${Math.floor(ch * 0.9)}px monospace`;
      for (let r = 0; r < grid.rows; r++) {
        for (let c = 0; c < grid.cols; c++) {
          const cell = grid.cells[r][c];
          if (cell.char === ' ' || cell.char === '⠀') continue;
          ctx.fillStyle = cell.color;
          ctx.fillText(cell.char, c * cw + cw / 2, r * ch + ch / 2);
        }
      }
      ctx.fillStyle = '#8A9AD4';
      ctx.textAlign = 'left';
      ctx.font = `${Math.floor(ch * 0.5)}px monospace`;
      ctx.fillText(formatSeedLine(grid.meta), cw * 0.3, grid.rows * ch + ch / 2);
    }
```

- [ ] **Step 2: `node --test` — vérifier qu'on n'a rien cassé côté testé**

Run: `node --test terminal/test/core.test.js`
Expected: tous les tests PASS (fonction non testée, mais ne doit rien casser
ailleurs dans le fichier).

- [ ] **Step 3: Vérification manuelle navigateur**

Ouvrir `terminal/index.html`, taper un mot + Entrée, `/export png`. Ouvrir le
PNG téléchargé : l'art occupe la quasi-totalité de l'image, une ligne de texte
bleu clair `SEED 0x...` est visible en bas, dans le canvas 1080×1350 (pas de
zone coupée ni de débordement).

- [ ] **Step 4: Commit**

```bash
git add terminal/index.html
git commit -m "feat(terminal): dessine la ligne seed dans l'export PNG"
```

---

## Task 6: Documentation — README + checklist de vérification manuelle

**Files:**
- Modify: `terminal/README.md`

**Interfaces:**
- Consumes: rien (documentation uniquement).
- Produces: rien consommé par du code.

- [ ] **Step 1: Réécrire tout le README**

Remplacer l'intégralité du contenu de `terminal/README.md` par :

```markdown
# Blason terminal (ASCII/braille)

Variante « pleine commande texte » du générateur de blasons — aucun bouton,
tout passe par le prompt.

## Usage

Ouvrir `terminal/index.html` dans un navigateur (aucun serveur requis).

- Taper un mot ou une phrase puis **Entrée** : le blason se décode caractère
  par caractère, la ligne `SEED 0x...` s'affiche sous l'illustration.
- Toute ligne commençant par `/` est une commande (voir ci-dessous). Le reste
  du texte tapé génère un blason.

## Commandes

| Commande | Effet |
|---|---|
| `<texte>` | Génère un blason à partir du texte |
| `/reroll` | Nouveau tirage du texte courant (même famille, nouvelle variante) |
| `/export <fmt>` | Exporte le dernier blason (`fmt` : `png`, `txt`, `copy`, `ans`, `svg`) |
| `/clear` | Vide l'historique affiché (le blason et le seed restent affichés) |
| `/help` | Affiche la liste des commandes |

Chaque ligne tapée (commande ou texte) s'ajoute à l'historique affiché
au-dessus du prompt, avec la réponse associée le cas échéant (erreur, aide).

## Différences avec la version racine (`../index.html`)

- **Vrai hasard** : chaque tirage est unique (entropie via `crypto.getRandomValues`).
  Le mot fixe la « famille » (symétrie, palette, cadre) ; le tirage varie le reste.
- **Rendu grille de caractères** braille + ASCII (source de vérité unique).
- **Animation de décodage** à la génération (respecte `prefers-reduced-motion`).
- **Interaction 100% commande texte**, zéro bouton, zéro `alert()`.
- Fond CRT `#0A0A0A`, accent rouge hazard `#E61919`.

## Exports

`/export png` · `/export copy` (presse-papier) · `/export txt` · `/export ans`
(ANSI couleur) · `/export svg`. Chaque export inclut la ligne `SEED 0x...` en
plus de l'illustration.

## Architecture

- `<script id="blason-script">` — logique pure (modèle, pipeline, serializers),
  zéro accès DOM, testée. Pipeline : `buildGrid(text, entropy)` →
  `deriveParams` → `generateParticles` → `rasterizeToDotField` →
  `dotFieldToBraille` → `overlayStructural` → `colorize`. Le seed n'est pas
  écrit dans la grille : `formatSeedLine(meta)` produit la ligne de statut,
  réutilisée par l'UI et par les 3 serializers texte/ANSI/SVG.
- `<script id="blason-ui">` — câblage DOM (prompt, routeur de commande,
  log scrollback, décodage, canvas, exports), non testé (vérif manuelle).

## Tests

\`\`\`bash
node --test terminal/test/core.test.js
\`\`\`

Zéro dépendance npm. `test/support/extract-core.js` extrait le contenu de
`<script id="blason-script">` via regex + `node:vm` et l'exécute dans un
sandbox exposant `{module: {exports: {}}}` — c'est ce qui permet de tester du
code shippé tel quel dans le navigateur sans aucun build.

`#blason-ui` (DOM) n'a pas de couverture automatisée par design — vérification
manuelle au navigateur requise pour tout changement dedans.

## Checklist de vérif manuelle (`#blason-ui`, non testé)

- [ ] Décodage joue à la génération, rendu instantané sous reduced-motion
- [ ] `/reroll` produit une variante de la même famille
- [ ] `/help` liste les 5 commandes
- [ ] `/clear` vide le log, garde l'art et le seed affichés
- [ ] `/export <fmt>` fonctionne pour les 5 formats, nommés `slugify(texte).*`,
      chacun contenant la ligne seed
- [ ] `/export` sans argument, ou avec un format invalide, affiche une erreur
      dans le log (pas de crash)
- [ ] `/reroll` ou `/export` sans blason généré affiche une erreur dans le log
- [ ] `/xyz` (commande inconnue) affiche `commande inconnue: /xyz — tape /help`
- [ ] Aucun `alert()`/`confirm()`/`prompt()` ne se déclenche dans aucun scénario
- [ ] Aucune erreur dans la console navigateur
```

- [ ] **Step 2: Commit**

```bash
git add terminal/README.md
git commit -m "docs(terminal): documente la grammaire de commande full-CLI"
```

---

## Critères d'acceptation finale (à vérifier après Task 6)

Reprend le §10 du spec — tous doivent être vrais :

1. Banner visible au chargement, aucun bouton dans le markup.
2. Mot + Entrée → échoé dans le log, décodage, art + ligne seed affichés.
3. `/reroll` sans blason → erreur log, pas de crash ; avec blason → nouvelle
   variante même famille.
4. Les 5 `/export <fmt>` fonctionnent, fichiers nommés `slugify(texte).<ext>`,
   contiennent la ligne seed (PNG : visuellement ; autres : dans le contenu).
5. `/export` invalide/absent → erreur log listant les formats valides.
6. `/help` → liste des commandes dans le log.
7. `/clear` → log vidé, art + seed inchangés à l'écran.
8. `/xyz` inconnu → `commande inconnue: /xyz — tape /help`.
9. Zéro `alert()`/`confirm()`/`prompt()` déclenché.
10. `node --test terminal/test/core.test.js` 100% vert.
11. `prefers-reduced-motion` : décodage instantané conservé (non touché par ce
    plan).
