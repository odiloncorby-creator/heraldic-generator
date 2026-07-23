# Export "clean" (motif pur) — CLI heraldic — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 4 new CLI export formats (`png-clean`, `png-clean-story`, `mp4-clean`, `mp4-clean-story`) that emit only the generated silhouette — no decorative braille frame, no `SEED ...` metadata line.

**Architecture:** `buildGrid` gains an additive `opts.clean` flag that skips the existing `overlayStructural` call. `serializeSvg` gains an additive `opts.seedLine` flag (default `true`) that, when `false`, drops the reserved metadata row and the `<text>` element for it. `cli/bin/heraldic.js` wires both flags through `runExport`, regenerating a clean grid on demand from the same `(text, entropy)` pair already used for the on-screen blason.

**Tech Stack:** Node.js (`node:test` for tests), no new dependencies.

## Global Constraints

- Jamais `Math.random()` — toute génération reste sur le flux `mulberry32(seed)` existant (CLAUDE.md). Aucune nouvelle source d'aléatoire n'est introduite par ce travail.
- Zéro nouvelle dépendance npm ou système.
- Scope strictement `cli/` — ne pas toucher `index.html` (racine) ni `terminal/index.html` (confirmé avec l'utilisateur pendant le brainstorming).
- `buildGrid(text, entropy, opts)` et `serializeSvg(grid, opts)` doivent rester rétrocompatibles : nouvelles options additives, tout appel existant sans ces options (y compris `automation-social-heraldic/weekly-post.js`) garde un comportement strictement identique.

---

### Task 1: `buildGrid` — option `clean` (saute le cadre)

**Files:**
- Modify: `cli/lib/core.js:192-210` (fonction `buildGrid`)
- Test: `cli/test/core.test.js`

**Interfaces:**
- Consumes: rien de nouveau — utilise `overlayStructural` déjà existant dans le même fichier.
- Produces: `buildGrid(text, entropy, { clean: true })` — grille sans aucune cellule `layer === 'struct'`. Consommé par Task 3 (`cli/bin/heraldic.js`).

- [ ] **Step 1: Write the failing test**

Dans `cli/test/core.test.js`, ajouter après le test `'buildGrid: même mot = même seed de famille (symétrie stable)'` (fin de fichier) :

```js
test('buildGrid: opts.clean saute overlayStructural — aucune cellule layer "struct"', () => {
  const { buildGrid } = core;
  const grid = buildGrid('sthol', 42, { clean: true });
  const hasStructLayer = grid.cells.some(row => row.some(c => c.layer === 'struct'));
  assert.equal(hasStructLayer, false);
});

test('buildGrid: sans opts.clean, le cadre reste présent (non-régression)', () => {
  const { buildGrid } = core;
  const grid = buildGrid('sthol', 42);
  assert.equal(grid.cells[0][0].layer, 'struct');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd cli && node --test test/core.test.js`
Expected: FAIL sur `'buildGrid: opts.clean saute overlayStructural — aucune cellule layer "struct"'` (le cadre est actuellement toujours appliqué, `hasStructLayer` vaut `true`).

- [ ] **Step 3: Write minimal implementation**

Dans `cli/lib/core.js`, fonction `buildGrid` (ligne 192), remplacer :

```js
  let cells = dotFieldToBraille(field, cols, rows);
  const meta = { seed, rev: '2.6', unit: 'UNIT/D-01' };
  cells = overlayStructural(cells, params);
  const grid = colorize(cells, params);
```

par :

```js
  let cells = dotFieldToBraille(field, cols, rows);
  const meta = { seed, rev: '2.6', unit: 'UNIT/D-01' };
  if (!opts.clean) cells = overlayStructural(cells, params);
  const grid = colorize(cells, params);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd cli && node --test test/core.test.js`
Expected: PASS (tous les tests, y compris les 2 nouveaux)

- [ ] **Step 5: Commit**

```bash
git add cli/lib/core.js cli/test/core.test.js
git commit -m "feat(cli): buildGrid opts.clean saute le cadre overlayStructural"
```

---

### Task 2: `serializeSvg` — option `seedLine` (retire la ligne metadata)

**Files:**
- Modify: `cli/lib/serialize.js:42-65` (fonction `serializeSvg`)
- Test: `cli/test/serialize.test.js`

**Interfaces:**
- Consumes: rien de nouveau.
- Produces: `serializeSvg(grid, { seedLine: false })` — SVG dont la hauteur de contenu est `grid.rows * ch` (au lieu de `(grid.rows + 1) * ch`) et qui ne contient aucun `<text>` de ligne SEED. Combinable avec `canvasW`/`canvasH` (letterbox) déjà existants. Consommé par Task 3.

- [ ] **Step 1: Write the failing test**

Dans `cli/test/serialize.test.js`, ajouter après le test `'serializeSvg: cellH calculé...'`/`'canvasH applique un letterbox...'` (fin de fichier) :

```js
test('serializeSvg: seedLine:false retire la ligne SEED et la ligne réservée', () => {
  const grid = {
    cols: 80, rows: 50,
    cells: Array.from({ length: 50 }, () => Array.from({ length: 80 }, () => ({ char: ' ', color: '#8A9AD4' }))),
    meta: { seed: 1, rev: '2.6', unit: 'U' },
  };
  const svg = serializeSvg(grid, { seedLine: false });
  const height = Number(svg.match(/height="([\d.]+)"/)[1]);
  assert.equal(height, 50 * 27);
  assert.ok(!svg.includes('SEED 0x'));
});

test('serializeSvg: seedLine par défaut (absent) garde le comportement actuel', () => {
  const grid = {
    cols: 80, rows: 50,
    cells: Array.from({ length: 50 }, () => Array.from({ length: 80 }, () => ({ char: ' ', color: '#8A9AD4' }))),
    meta: { seed: 1, rev: '2.6', unit: 'U' },
  };
  const svg = serializeSvg(grid);
  const height = Number(svg.match(/height="([\d.]+)"/)[1]);
  assert.equal(height, 51 * 27);
  assert.ok(svg.includes('SEED 0x'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd cli && node --test test/serialize.test.js`
Expected: FAIL sur le premier nouveau test — `height` vaut `51*27` (1377) et non `50*27` (1350), et le SVG contient `SEED 0x` (l'option `seedLine` n'existe pas encore, tout est toujours émis).

- [ ] **Step 3: Write minimal implementation**

Dans `cli/lib/serialize.js`, remplacer toute la fonction `serializeSvg` (lignes 42-65) par :

```js
function serializeSvg(grid, opts) {
  opts = opts || {};
  const cw = opts.cellW || 13.5, ch = opts.cellH || 27, fs = opts.fontSize || 24;
  const seedLine = opts.seedLine !== false;
  const rowsForContent = seedLine ? grid.rows + 1 : grid.rows;
  const contentW = grid.cols * cw, contentH = rowsForContent * ch;
  const canvasW = opts.canvasW || contentW, canvasH = opts.canvasH || contentH;
  const offsetX = ((canvasW - contentW) / 2).toFixed(1), offsetY = ((canvasH - contentH) / 2).toFixed(1);
  let out = `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasW}" height="${canvasH}" viewBox="0 0 ${canvasW} ${canvasH}">`;
  out += `<rect width="${canvasW}" height="${canvasH}" fill="#0A0A0A"/>`;
  out += `<g transform="translate(${offsetX}, ${offsetY})">`;
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
  if (seedLine) {
    const seedY = ((grid.rows + 0.8) * ch).toFixed(1);
    out += `<text x="0" y="${seedY}" fill="#8A9AD4">${escapeXml(formatSeedLine(grid.meta))}</text>`;
  }
  out += `</g></g></svg>`;
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd cli && node --test test/serialize.test.js`
Expected: PASS (tous les tests, y compris les 2 nouveaux et les tests existants — notamment celui du letterbox `canvasH` qui ne passe pas `seedLine`, donc reste en mode `true` par défaut).

- [ ] **Step 5: Commit**

```bash
git add cli/lib/serialize.js cli/test/serialize.test.js
git commit -m "feat(cli): serializeSvg opts.seedLine retire la ligne metadata"
```

---

### Task 3: `heraldic.js` — formats `-clean`, entropy mémorisée, aide, README

**Files:**
- Modify: `cli/bin/heraldic.js` (plusieurs sections, détail ci-dessous)
- Modify: `cli/README.md` (table des formats)
- Pas de test automatisé (le fichier `cli/bin/heraldic.js` est le câblage CLI/REPL, non couvert par des tests unitaires dans ce repo — même statut que `#blason-ui`). Vérification manuelle en Step 6.

**Interfaces:**
- Consumes: `buildGrid(text, entropy, { clean: true })` (Task 1), `serializeSvg(grid, { seedLine, canvasW, canvasH, cellW, cellH })` (Task 2).
- Produces: 4 nouveaux formats CLI utilisables via `/export png-clean`, `/export png-clean-story`, `/export mp4-clean`, `/export mp4-clean-story`.

- [ ] **Step 1: Étendre `EXPORT_FORMATS`**

Dans `cli/bin/heraldic.js` ligne 22, remplacer :

```js
const EXPORT_FORMATS = ['png', 'png-story', 'mp4', 'mp4-story', 'txt', 'ans', 'svg'];
```

par :

```js
const EXPORT_FORMATS = ['png', 'png-story', 'png-clean', 'png-clean-story', 'mp4', 'mp4-story', 'mp4-clean', 'mp4-clean-story', 'txt', 'ans', 'svg'];
```

- [ ] **Step 2: `svgOptsFor` — paramètre `clean`**

Lignes 25-27, remplacer :

```js
function svgOptsFor(grid, story) {
  return story ? { canvasH: STORY_HEIGHT } : undefined;
}
```

par :

```js
function svgOptsFor(grid, story, clean) {
  const opts = { seedLine: !clean };
  if (story) opts.canvasH = STORY_HEIGHT;
  return opts;
}
```

- [ ] **Step 3: `renderFramePng` et `encodeVideo` — paramètre `seedLine`**

Ligne 32-35, remplacer :

```js
async function renderFramePng(grid, cells, cellW, cellH, canvasH) {
  const svg = serializeSvg({ cols: grid.cols, rows: grid.rows, cells, meta: grid.meta }, { cellW, cellH, canvasH });
  return serializeSvgToPngBuffer(svg);
}
```

par :

```js
async function renderFramePng(grid, cells, cellW, cellH, canvasH, seedLine) {
  const svg = serializeSvg({ cols: grid.cols, rows: grid.rows, cells, meta: grid.meta }, { cellW, cellH, canvasH, seedLine });
  return serializeSvgToPngBuffer(svg);
}
```

Ligne 56-76, dans `encodeVideo`, remplacer la signature et l'appel interne :

```js
async function encodeVideo(grid, cellW, cellH, outPath, canvasH) {
```
→
```js
async function encodeVideo(grid, cellW, cellH, outPath, canvasH, seedLine) {
```

et à l'intérieur de la boucle :

```js
      const png = await renderFramePng(grid, frame.cells, cellW, cellH, canvasH);
```
→
```js
      const png = await renderFramePng(grid, frame.cells, cellW, cellH, canvasH, seedLine);
```

- [ ] **Step 4: `generate()` — mémoriser `currentEntropy`**

Ligne 82-85, remplacer :

```js
let currentText = '';
let pendingExport = Promise.resolve();
let currentGrid = null;
let quitting = false;
```

par :

```js
let currentText = '';
let currentEntropy = null;
let pendingExport = Promise.resolve();
let currentGrid = null;
let quitting = false;
```

Ligne 122-128, dans `generate`, remplacer :

```js
async function generate(text, entropy) {
  currentText = text;
  currentGrid = buildGrid(text, entropy);
  generation += 1;
  pendingGenerate = playDecodeAnimation(currentGrid, generation);
  await pendingGenerate;
}
```

par :

```js
async function generate(text, entropy) {
  currentText = text;
  currentEntropy = entropy;
  currentGrid = buildGrid(text, entropy);
  generation += 1;
  pendingGenerate = playDecodeAnimation(currentGrid, generation);
  await pendingGenerate;
}
```

- [ ] **Step 5: `runExport` — parsing `clean`/`story` combinés**

Lignes 138-156, remplacer toute la fonction :

```js
async function runExport(fmt) {
  const story = fmt.endsWith('-story');
  const suffix = story ? '-story' : '';
  const filename = `${slugify(currentText)}${suffix}.${fmt.replace('-story', '')}`;
  if (fmt === 'txt') {
    fs.writeFileSync(filename, serializeText(currentGrid));
  } else if (fmt === 'ans') {
    fs.writeFileSync(filename, serializeAnsi(currentGrid));
  } else if (fmt === 'svg') {
    fs.writeFileSync(filename, serializeSvg(currentGrid));
  } else if (fmt === 'png' || fmt === 'png-story') {
    const buffer = await serializeSvgToPngBuffer(serializeSvg(currentGrid, svgOptsFor(currentGrid, story)));
    fs.writeFileSync(filename, buffer);
  } else if (fmt === 'mp4' || fmt === 'mp4-story') {
    const canvasH = story ? STORY_HEIGHT : undefined;
    await encodeVideo(currentGrid, 13.5, 27, filename, canvasH);
  }
  console.log(`écrit: ${filename}`);
}
```

par :

```js
async function runExport(fmt) {
  const clean = fmt.includes('-clean');
  const story = fmt.includes('-story');
  const suffix = (clean ? '-clean' : '') + (story ? '-story' : '');
  const ext = fmt.replace('-clean', '').replace('-story', '');
  const filename = `${slugify(currentText)}${suffix}.${ext}`;
  const grid = clean ? buildGrid(currentText, currentEntropy, { clean: true }) : currentGrid;
  if (fmt === 'txt') {
    fs.writeFileSync(filename, serializeText(grid));
  } else if (fmt === 'ans') {
    fs.writeFileSync(filename, serializeAnsi(grid));
  } else if (fmt === 'svg') {
    fs.writeFileSync(filename, serializeSvg(grid));
  } else if (ext === 'png') {
    const buffer = await serializeSvgToPngBuffer(serializeSvg(grid, svgOptsFor(grid, story, clean)));
    fs.writeFileSync(filename, buffer);
  } else if (ext === 'mp4') {
    const canvasH = story ? STORY_HEIGHT : undefined;
    await encodeVideo(grid, 13.5, 27, filename, canvasH, !clean);
  }
  console.log(`écrit: ${filename}`);
}
```

- [ ] **Step 6: Aide `/help`**

Ligne 175, remplacer :

```js
      '  /export <fmt>         exporte le dernier blason (fmt: png, png-story, mp4, mp4-story, txt, ans, svg)',
```

par :

```js
      '  /export <fmt>         exporte le dernier blason (fmt: png, png-story, png-clean, png-clean-story, mp4, mp4-story, mp4-clean, mp4-clean-story, txt, ans, svg)',
```

- [ ] **Step 7: `cli/README.md` — documenter les 4 nouveaux formats**

Dans la table des formats supportés (section "Video export"), remplacer :

```markdown
- `png`: single frame PNG (1080×1377)
- `png-story`: tall story-format PNG (1080×1920) — same 1080×1377 render as `png`, letterboxed (centered, black margins top/bottom) rather than stretched
- `mp4`: video with decode animation (1080×1376, 30fps, ~2.2s) — height rounds down for H.264/yuv420p even-dimension requirement
- `mp4-story`: tall video with decode animation (1080×1920, 30fps, ~2.2s) — same letterbox treatment as `png-story`
- `txt`: plain text
- `ans`: ANSI colored text
- `svg`: scalable vector
```

par :

```markdown
- `png`: single frame PNG (1080×1377)
- `png-story`: tall story-format PNG (1080×1920) — same 1080×1377 render as `png`, letterboxed (centered, black margins top/bottom) rather than stretched
- `png-clean`: motif only, no decorative frame, no SEED metadata line (1080×1350)
- `png-clean-story`: `png-clean` render (1080×1350), letterboxed in a 1080×1920 canvas
- `mp4`: video with decode animation (1080×1376, 30fps, ~2.2s) — height rounds down for H.264/yuv420p even-dimension requirement
- `mp4-story`: tall video with decode animation (1080×1920, 30fps, ~2.2s) — same letterbox treatment as `png-story`
- `mp4-clean`: motif-only video, no frame, no SEED line (1080×1350, already even — no H.264 rounding)
- `mp4-clean-story`: `mp4-clean` render, letterboxed in a 1080×1920 canvas
- `txt`: plain text
- `ans`: ANSI colored text
- `svg`: scalable vector
```

- [ ] **Step 8: Run full test suite (non-régression)**

Run: `cd cli && npm test`
Expected: PASS (tous les tests, y compris ceux des Tasks 1 et 2)

- [ ] **Step 9: Vérification manuelle des 4 nouveaux formats**

```bash
cd cli
printf 'sthol\n/export png-clean\n/export png-clean-story\n/export mp4-clean\n/export mp4-clean-story\n/quit\n' | node bin/heraldic.js
sips -g pixelWidth -g pixelHeight sthol-clean.png sthol-clean-story.png
ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 sthol-clean.mp4 sthol-clean-story.mp4
```

Expected :
- `sthol-clean.png` → 1080×1350
- `sthol-clean-story.png` → 1080×1920
- `sthol-clean.mp4` → 1080×1350
- `sthol-clean-story.mp4` → 1080×1920

Ouvrir `sthol-clean.png` (via l'outil `Read` ou un visualiseur) et confirmer visuellement : pas de cadre braille sur les bords, pas de ligne "SEED 0x..." — uniquement le motif. Nettoyer les fichiers générés après vérification (`rm sthol-clean*.png sthol-clean*.mp4`).

- [ ] **Step 10: Commit**

```bash
git add cli/bin/heraldic.js cli/README.md
git commit -m "feat(cli): export png-clean/mp4-clean (motif pur, sans cadre ni SEED)"
```

---

## Verification Summary

1. `cd cli && npm test` — suite complète verte (Tasks 1, 2 + non-régression).
2. Vérification manuelle Task 3 Step 9 — dimensions correctes + inspection visuelle des 2 PNG (normal-clean et clean-story).
3. `/help` affiche bien les 4 nouveaux formats dans la liste.
