# CLI Node.js `heraldic` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Porter le pipeline pur de `terminal/index.html` (`#blason-script`) en package Node.js publiable `heraldic`, avec un REPL scrollant dans un vrai terminal offrant la même grammaire de commande (`/help`, `/reroll`, `/export <fmt>`, `/clear`).

**Architecture:** Nouveau dossier `cli/` autonome (package npm séparé, aucune dépendance croisée avec `index.html`/`terminal/index.html`). `cli/lib/core.js` porte le cœur pur (hash, PRNG, dérivation de paramètres, génération de particules, rastérisation braille) ; `cli/lib/serialize.js` porte les sérialiseurs texte/ANSI/SVG ; `cli/lib/png.js` ajoute l'export PNG via rastérisation du SVG (`sharp`, seule dépendance npm) ; `cli/bin/heraldic.js` est le point d'entrée exécutable (boucle `readline`, routage de commandes, écriture de fichiers).

**Tech Stack:** Node.js natif (`node:test`, `readline`, `fs`, `crypto`) + une dépendance : `sharp`.

## Global Constraints

- Aucune dépendance croisée entre `cli/` et `index.html`/`terminal/index.html` — port propre, duplication assumée (DOM vs vrai TTY, YAGNI déjà acté dans le spec terminal).
- Une seule dépendance npm ajoutée sur tout le projet : `sharp`.
- Formats d'export : `png`, `txt`, `ans`, `svg` (pas de `copy`).
- Toute apostrophe typographique française (`’`, U+2019) dans une chaîne à quotes simples doit être échappée `’` — jamais transcrite en apostrophe droite `'` (piège déjà rencontré deux fois dans ce projet, cf. `CLAUDE.md`).
- Suppression des diacritiques dans `slugify` : forme échappée `\u0300-\u036f` uniquement, jamais de caractères combinants littéraux collés dans la regex.
- `npm publish` n'est **jamais** exécuté dans ce plan — action différée, confirmation explicite de l'utilisateur requise au moment venu.
- Package : `name: "heraldic"`, `version: "0.1.0"`, `bin: { heraldic: "./bin/heraldic.js" }`.

---

### Task 1: Cœur pur (`cli/lib/core.js`)

**Files:**
- Create: `cli/package.json`
- Create: `cli/lib/core.js`
- Test: `cli/test/core.test.js`

**Interfaces:**
- Consumes: rien (première tâche).
- Produces (`module.exports` de `cli/lib/core.js`) :
  - `COLS` = 80, `ROWS` = 50, `DOT_W` = 160, `DOT_H` = 200 (nombres)
  - `hashString(text: string): number`
  - `mulberry32(seed: number): () => number`
  - `slugify(text: string): string`
  - `gaussianRandom(rng: () => number): number`
  - `deriveParams(familyRng: () => number, variantRng: () => number): { symmetry, sectorAngle, clusters, jitter, paletteBias, densityBand }`
  - `overlayStructural(cells: Cell[][], params: object): Cell[][]`
  - `formatSeedLine(meta: { seed: number, rev: string, unit: string }): string`
  - `generateParticles(params: object, rng: () => number, width: number, height: number): { x: number, y: number }[]`
  - `rasterizeToDotField(particles: {x,y}[], dotW: number, dotH: number): Float64Array`
  - `dotFieldToBraille(dotField: Float64Array, cols: number, rows: number, threshold?: number): Cell[][]`
  - `colorize(cells: Cell[][], params: object): { cols: number, rows: number, cells: Cell[][] }`
  - `buildGrid(text: string, entropy: number, opts?: { cols?: number, rows?: number }): { cols, rows, cells, seed, meta }`
  - où `Cell = { char: string, intensity: number, layer: string, color?: string }`

- [ ] **Step 1: Créer `cli/package.json`**

```json
{
  "name": "heraldic",
  "version": "0.1.0",
  "description": "Générateur procédural de blasons ASCII/braille en CLI — même texte, même blason, toujours.",
  "bin": {
    "heraldic": "./bin/heraldic.js"
  },
  "files": [
    "bin",
    "lib"
  ],
  "engines": {
    "node": ">=18"
  },
  "scripts": {
    "test": "node --test test/"
  },
  "license": "MIT"
}
```

- [ ] **Step 2: Écrire le test qui va échouer — `cli/test/core.test.js`**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const assertLoose = require('node:assert');
const core = require('../lib/core');

test('constantes de grille figées', () => {
  const { COLS, ROWS, DOT_W, DOT_H } = core;
  assert.equal(COLS, 80);
  assert.equal(ROWS, 50);
  assert.equal(DOT_W, 160);
  assert.equal(DOT_H, 200);
});

test('hashString déterministe', () => {
  const { hashString } = core;
  assert.equal(hashString('sthol'), hashString('sthol'));
  assert.notEqual(hashString('sthol'), hashString('kaldrek'));
});

test('mulberry32 reproductible', () => {
  const { mulberry32 } = core;
  const a = mulberry32(123), b = mulberry32(123);
  assertLoose.deepEqual([a(), a(), a()], [b(), b(), b()]);
});

test('slugify utilise la forme échappée des diacritiques', () => {
  const { slugify } = core;
  assert.equal(slugify('Épée Ardente'), 'epee-ardente');
  assert.equal(slugify(''), 'blason');
});

test('deriveParams: même famille pour même familyRng, micro variable', () => {
  const { mulberry32, deriveParams } = core;
  const p1 = deriveParams(mulberry32(42), mulberry32(1));
  const p2 = deriveParams(mulberry32(42), mulberry32(2));
  assert.deepEqual(p1.symmetry, p2.symmetry);
  assert.equal(p1.paletteBias, p2.paletteBias);
  assert.notDeepEqual(p1.clusters, p2.clusters);
});

test('deriveParams: bornes des paramètres', () => {
  const { mulberry32, deriveParams } = core;
  const p = deriveParams(mulberry32(7), mulberry32(9));
  assert.ok(['axial', 'radial'].includes(p.symmetry.type));
  assert.ok(p.clusters.length >= 3 && p.clusters.length <= 7);
  assert.ok(p.jitter >= 0.3 && p.jitter <= 0.8);
  for (const c of p.clusters) {
    assert.ok(c.distance >= 0.15 && c.distance <= 0.9);
    assert.ok(c.particleCount > 0);
  }
});

test('gaussianRandom: renvoie un nombre fini', () => {
  const { mulberry32, gaussianRandom } = core;
  const rng = mulberry32(3);
  for (let i = 0; i < 20; i++) assert.ok(Number.isFinite(gaussianRandom(rng)));
});

test('generateParticles: respecte la symétrie radiale (k centres)', () => {
  const { mulberry32, generateParticles } = core;
  const params = { symmetry: { type: 'radial', k: 4 }, sectorAngle: Math.PI / 2,
    clusters: [{ angle: 0.3, distance: 0.5, radius: 0.1, particleCount: 10 }],
    jitter: 0.5, paletteBias: 0.5, densityBand: 1 };
  const pts = generateParticles(params, mulberry32(1), 160, 200);
  assert.equal(pts.length, 4 * 10);
  for (const p of pts) { assert.ok(Number.isFinite(p.x)); assert.ok(Number.isFinite(p.y)); }
});

test('generateParticles: axial = 2 centres miroir', () => {
  const { mulberry32, generateParticles } = core;
  const params = { symmetry: { type: 'axial', k: 2 }, sectorAngle: Math.PI,
    clusters: [{ angle: 0.3, distance: 0.5, radius: 0.1, particleCount: 5 }],
    jitter: 0.5, paletteBias: 0.5, densityBand: 1 };
  const pts = generateParticles(params, mulberry32(1), 160, 200);
  assert.equal(pts.length, 2 * 5);
});

test('rasterizeToDotField: longueur et normalisation', () => {
  const { rasterizeToDotField } = core;
  const field = rasterizeToDotField([{ x: 5, y: 5 }, { x: 5, y: 5 }, { x: 10, y: 10 }], 160, 200);
  assert.equal(field.length, 160 * 200);
  let max = 0; for (const v of field) if (v > max) max = v;
  assert.equal(max, 1);
  assert.equal(field[5 * 160 + 5], 1);
  assert.equal(field[10 * 160 + 10], 0.5);
});

test('rasterizeToDotField: ignore les points hors champ', () => {
  const { rasterizeToDotField } = core;
  const field = rasterizeToDotField([{ x: -1, y: 5 }, { x: 999, y: 5 }], 160, 200);
  let sum = 0; for (const v of field) sum += v;
  assert.equal(sum, 0);
});

test('dotFieldToBraille: dimensions de la grille', () => {
  const { dotFieldToBraille } = core;
  const field = new Float64Array(160 * 200);
  const cells = dotFieldToBraille(field, 80, 50);
  assert.equal(cells.length, 50);
  assert.equal(cells[0].length, 80);
});

test('dotFieldToBraille: champ vide = blank braille U+2800', () => {
  const { dotFieldToBraille } = core;
  const cells = dotFieldToBraille(new Float64Array(160 * 200), 80, 50);
  assert.equal(cells[0][0].char, '⠀');
  assert.equal(cells[0][0].intensity, 0);
  assert.equal(cells[0][0].layer, 'braille');
});

test('dotFieldToBraille: point haut-gauche allume dot1 (0x2801)', () => {
  const { dotFieldToBraille } = core;
  const field = new Float64Array(160 * 200);
  field[0] = 1;
  const cells = dotFieldToBraille(field, 80, 50);
  assert.equal(cells[0][0].char, '⠁');
});

test('dotFieldToBraille: cellule pleine = 0x28FF', () => {
  const { dotFieldToBraille } = core;
  const field = new Float64Array(160 * 200);
  for (let dy = 0; dy < 4; dy++) for (let dx = 0; dx < 2; dx++) field[dy * 160 + dx] = 1;
  const cells = dotFieldToBraille(field, 80, 50);
  assert.equal(cells[0][0].char, '⣿');
  assert.equal(cells[0][0].intensity, 1);
});

test('dotFieldToBraille: gamma relève un point faible sous le seuil linéaire', () => {
  const { dotFieldToBraille } = core;
  const field = new Float64Array(160 * 200);
  field[0] = 0.02;
  const cells = dotFieldToBraille(field, 80, 50);
  assert.equal(cells[0][0].char, '⠁');
});

function blankGrid(cols, rows) {
  return core.dotFieldToBraille(new Float64Array(cols * 2 * rows * 4), cols, rows);
}

test('overlayStructural: cadre braille fermé (coins alignés sur l’intérieur)', () => {
  const cells = blankGrid(80, 50);
  core.overlayStructural(cells, {});
  assert.equal(cells[0][0].char, '⡏');
  assert.equal(cells[0][79].char, '⢹');
  assert.equal(cells[49][0].char, '⣇');
  assert.equal(cells[49][79].char, '⣸');
  assert.equal(cells[0][0].layer, 'struct');
});

test('overlayStructural: n’écrit plus de ligne data dans la grille', () => {
  const cells = blankGrid(80, 50);
  core.overlayStructural(cells, {});
  const hasDataLayer = cells.some(row => row.some(c => c.layer === 'data'));
  assert.equal(hasDataLayer, false);
});

test('formatSeedLine: hex sur 8 caractères + rev + unit', () => {
  const { formatSeedLine } = core;
  const line = formatSeedLine({ seed: 0x7F3A, rev: '2.6', unit: 'UNIT/D-01' });
  assert.equal(line, 'SEED 0x00007F3A  REV 2.6  UNIT/D-01');
});

test('colorize: couleurs par layer', () => {
  const cells = [[
    { char: '⣿', intensity: 1, layer: 'braille' },
    { char: '│', intensity: 1, layer: 'struct' },
    { char: 'S', intensity: 1, layer: 'data' },
  ]];
  const grid = core.colorize(cells, { paletteBias: 0.5 });
  assert.equal(grid.cells[0][2].color, '#E61919');
  assert.equal(grid.cells[0][1].color, '#8A9AD4');
  assert.ok(/^rgb\(/.test(grid.cells[0][0].color));
});

test('buildGrid: grille complète bien formée', () => {
  const { buildGrid, COLS, ROWS } = core;
  const grid = buildGrid('sthol', 0xABCDEF01);
  assert.equal(grid.cols, COLS);
  assert.equal(grid.rows, ROWS);
  assert.equal(grid.cells.length, ROWS);
  assert.equal(grid.cells[0].length, COLS);
  assert.equal(grid.seed, (grid.seed >>> 0));
  assert.ok(grid.cells.every(row => row.every(c => typeof c.color === 'string')));
});

test('buildGrid: déterministe pour (texte, entropy) fixés', () => {
  const { buildGrid } = core;
  const a = buildGrid('sthol', 42);
  const b = buildGrid('sthol', 42);
  const flat = g => g.cells.map(r => r.map(c => c.char).join('')).join('\n');
  assert.equal(flat(a), flat(b));
});

test('buildGrid: vrai hasard — entropies différentes = grilles différentes', () => {
  const { buildGrid } = core;
  const flat = g => g.cells.map(r => r.map(c => c.char).join('')).join('\n');
  assert.notEqual(flat(buildGrid('sthol', 1)), flat(buildGrid('sthol', 2)));
});

test('buildGrid: même mot = même seed de famille (symétrie stable)', () => {
  const { buildGrid } = core;
  const g1 = buildGrid('sthol', 111);
  const g2 = buildGrid('sthol', 222);
  const frameChar = g => g.cells[0][0].char;
  assert.equal(frameChar(g1), frameChar(g2));
});
```

- [ ] **Step 3: Lancer les tests, vérifier l'échec**

Run: `cd cli && node --test test/core.test.js`
Expected: FAIL — `Cannot find module '../lib/core'`

- [ ] **Step 4: Écrire `cli/lib/core.js`**

```js
'use strict';

const COLS = 80;
const ROWS = 50;
const DOT_W = COLS * 2;   // 160
const DOT_H = ROWS * 4;   // 200

function hashString(text) {
  let hash = 5381;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) + hash) + text.charCodeAt(i);
    hash = hash >>> 0;
  }
  return hash >>> 0;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function slugify(text) {
  const slug = text
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return slug.length > 0 ? slug : 'blason';
}

function gaussianRandom(rng) {
  let u = 0, v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function deriveParams(familyRng, variantRng) {
  const symmetryOptions = [
    { type: 'axial', k: 2 },
    { type: 'radial', k: 3 },
    { type: 'radial', k: 4 },
    { type: 'radial', k: 6 },
    { type: 'radial', k: 8 },
  ];
  const symmetry = symmetryOptions[Math.floor(familyRng() * symmetryOptions.length)];
  const sectorAngle = symmetry.type === 'axial' ? Math.PI : (2 * Math.PI / symmetry.k);
  const paletteBias = familyRng();
  const densityBand = 1.1 + familyRng() * 1.0;

  const clusterCount = 3 + Math.floor(variantRng() * 5); // 3..7
  const clusters = [];
  for (let i = 0; i < clusterCount; i++) {
    clusters.push({
      angle: variantRng() * sectorAngle,
      distance: 0.15 + variantRng() * 0.75,
      radius: 0.10 + variantRng() * 0.16,
      particleCount: Math.floor((260 + variantRng() * 420) * densityBand),
    });
  }
  const jitter = 0.3 + variantRng() * 0.5;

  return { symmetry, sectorAngle, clusters, jitter, paletteBias, densityBand };
}

function overlayStructural(cells, params) {
  const rows = cells.length, cols = cells[0].length;
  const put = (r, c, ch, layer) => {
    if (r >= 0 && r < rows && c >= 0 && c < cols) {
      cells[r][c] = { char: ch, intensity: 1, layer: layer || 'struct' };
    }
  };
  for (let c = 0; c < cols; c++) { put(0, c, '⠉'); put(rows - 1, c, '⣀'); }
  for (let r = 0; r < rows; r++) { put(r, 0, '⡇'); put(r, cols - 1, '⢸'); }
  put(0, 0, '⡏'); put(0, cols - 1, '⢹'); put(rows - 1, 0, '⣇'); put(rows - 1, cols - 1, '⣸');
  return cells;
}

function formatSeedLine(meta) {
  const hex = (meta.seed >>> 0).toString(16).toUpperCase().padStart(8, '0');
  return `SEED 0x${hex}  REV ${meta.rev}  ${meta.unit}`;
}

function generateParticles(params, rng, width, height) {
  const cx = width / 2, cy = height / 2;
  const maxRadius = Math.min(width, height) * 0.42;
  const particles = [];
  for (const cluster of params.clusters) {
    const baseAngle = cluster.angle - Math.PI / 2;
    const baseX = cx + Math.cos(baseAngle) * cluster.distance * maxRadius;
    const baseY = cy + Math.sin(baseAngle) * cluster.distance * maxRadius;
    const centers = [];
    if (params.symmetry.type === 'axial') {
      centers.push([baseX, baseY]);
      centers.push([2 * cx - baseX, baseY]);
    } else {
      for (let k = 0; k < params.symmetry.k; k++) {
        const rot = baseAngle + k * params.sectorAngle;
        centers.push([
          cx + Math.cos(rot) * cluster.distance * maxRadius,
          cy + Math.sin(rot) * cluster.distance * maxRadius,
        ]);
      }
    }
    for (const [ccx, ccy] of centers) {
      for (let p = 0; p < cluster.particleCount; p++) {
        const r = Math.abs(gaussianRandom(rng)) * cluster.radius * maxRadius * params.jitter;
        const theta = rng() * Math.PI * 2;
        particles.push({ x: ccx + Math.cos(theta) * r, y: ccy + Math.sin(theta) * r });
      }
    }
  }
  return particles;
}

function rasterizeToDotField(particles, dotW, dotH) {
  const field = new Float64Array(dotW * dotH);
  for (const pt of particles) {
    const x = Math.round(pt.x), y = Math.round(pt.y);
    if (x >= 0 && x < dotW && y >= 0 && y < dotH) field[y * dotW + x] += 1;
  }
  let max = 0;
  for (let i = 0; i < field.length; i++) if (field[i] > max) max = field[i];
  if (max > 0) for (let i = 0; i < field.length; i++) field[i] /= max;
  return field;
}

const BRAILLE_BITS = [
  [0x01, 0x08],
  [0x02, 0x10],
  [0x04, 0x20],
  [0x40, 0x80],
];

const FIELD_GAMMA = 0.55;

function dotFieldToBraille(dotField, cols, rows, threshold) {
  if (threshold === undefined) threshold = 0.06;
  const dotW = cols * 2;
  const cells = [];
  for (let ry = 0; ry < rows; ry++) {
    const row = [];
    for (let cx = 0; cx < cols; cx++) {
      let bits = 0, sum = 0;
      for (let dy = 0; dy < 4; dy++) {
        for (let dx = 0; dx < 2; dx++) {
          const raw = dotField[(ry * 4 + dy) * dotW + (cx * 2 + dx)];
          const v = raw > 0 ? Math.pow(raw, FIELD_GAMMA) : 0;
          sum += v;
          if (v > threshold) bits |= BRAILLE_BITS[dy][dx];
        }
      }
      row.push({ char: String.fromCharCode(0x2800 + bits), intensity: sum / 8, layer: 'braille' });
    }
    cells.push(row);
  }
  return cells;
}

function colorize(cells, params) {
  const A = [0x6B, 0x7E, 0xC4], B = [0x8A, 0x9A, 0xD4];
  const rows = cells.length, cols = cells[0].length;
  const bias = (params && typeof params.paletteBias === 'number') ? params.paletteBias : 0.5;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = cells[r][c];
      if (cell.layer === 'data') {
        cell.color = '#E61919';
      } else if (cell.layer === 'struct') {
        cell.color = '#8A9AD4';
      } else {
        const t = Math.min(1, Math.max(0, cell.intensity * 0.7 + bias * 0.3));
        const col = [
          Math.round(A[0] + (B[0] - A[0]) * t),
          Math.round(A[1] + (B[1] - A[1]) * t),
          Math.round(A[2] + (B[2] - A[2]) * t),
        ];
        cell.color = `rgb(${col[0]}, ${col[1]}, ${col[2]})`;
      }
    }
  }
  return { cols, rows, cells };
}

function buildGrid(text, entropy, opts) {
  opts = opts || {};
  const cols = opts.cols || COLS, rows = opts.rows || ROWS;
  const dotW = cols * 2, dotH = rows * 4;
  const textHash = hashString(text);
  const seed = (textHash ^ (entropy >>> 0)) >>> 0;
  const familyRng = mulberry32(textHash);
  const variantRng = mulberry32(seed);
  const params = deriveParams(familyRng, variantRng);
  const particles = generateParticles(params, variantRng, dotW, dotH);
  const field = rasterizeToDotField(particles, dotW, dotH);
  let cells = dotFieldToBraille(field, cols, rows);
  const meta = { seed, rev: '2.6', unit: 'UNIT/D-01' };
  cells = overlayStructural(cells, params);
  const grid = colorize(cells, params);
  grid.seed = seed;
  grid.meta = meta;
  return grid;
}

module.exports = {
  COLS, ROWS, DOT_W, DOT_H,
  hashString, mulberry32, slugify,
  gaussianRandom, deriveParams,
  overlayStructural, formatSeedLine,
  generateParticles, rasterizeToDotField,
  dotFieldToBraille, colorize, buildGrid,
};
```

- [ ] **Step 5: Lancer les tests, vérifier le succès**

Run: `cd cli && node --test test/core.test.js`
Expected: PASS — tous les tests verts, 0 échec.

- [ ] **Step 6: Commit**

```bash
git add cli/package.json cli/lib/core.js cli/test/core.test.js
git commit -m "feat(cli): porte le coeur pur buildGrid en module Node"
```

---

### Task 2: Sérialiseurs (`cli/lib/serialize.js`)

**Files:**
- Create: `cli/lib/serialize.js`
- Test: `cli/test/serialize.test.js`

**Interfaces:**
- Consumes: `formatSeedLine` de `cli/lib/core.js` (Task 1).
- Produces (`module.exports` de `cli/lib/serialize.js`) :
  - `parseColor(color: string): [number, number, number]`
  - `serializeText(grid): string`
  - `serializeAnsi(grid): string`
  - `escapeXml(s: string): string`
  - `serializeSvg(grid, opts?: { cellW?: number, cellH?: number, fontSize?: number }): string`

- [ ] **Step 1: Écrire le test qui va échouer — `cli/test/serialize.test.js`**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const assertLoose = require('node:assert');
const { serializeText, serializeAnsi, parseColor, escapeXml, serializeSvg } = require('../lib/serialize');

const FIXTURE_GRID = { cols: 3, rows: 2, cells: [
  [{ char: 'A', color: '#E61919', layer: 'data' },
   { char: 'B', color: '#8A9AD4', layer: 'struct' },
   { char: 'C', color: 'rgb(107, 126, 196)', layer: 'braille' }],
  [{ char: '⠁', color: 'rgb(120, 130, 200)', layer: 'braille' },
   { char: '⠀', color: 'rgb(107, 126, 196)', layer: 'braille' },
   { char: 'D', color: '#8A9AD4', layer: 'struct' }],
], seed: 42, meta: { seed: 42, rev: '2.6', unit: 'U' } };

test('serializeText: lignes jointes, glyphes bruts + ligne seed', () => {
  assert.equal(serializeText(FIXTURE_GRID), 'ABC\n⠁⠀D\n\nSEED 0x0000002A  REV 2.6  U');
});

test('parseColor: hex et rgb()', () => {
  assertLoose.deepEqual(parseColor('#E61919'), [230, 25, 25]);
  assertLoose.deepEqual(parseColor('rgb(107, 126, 196)'), [107, 126, 196]);
});

test('serializeAnsi: contient un escape truecolor, un reset, et la ligne seed', () => {
  const out = serializeAnsi(FIXTURE_GRID);
  assert.ok(out.includes('\x1b[38;2;230;25;25m'));
  assert.ok(out.includes('\x1b[0m'));
  const stripped = out.replace(/\x1b\[[0-9;]*m/g, '');
  assert.equal(stripped, 'ABC\n⠁⠀D\n\nSEED 0x0000002A  REV 2.6  U');
});

test('escapeXml: échappe &, <, >', () => {
  assert.equal(escapeXml('a<b>&c'), 'a&lt;b&gt;&amp;c');
});

test('serializeSvg: enveloppe SVG + fond + dimensions (rows+1 pour la ligne seed)', () => {
  const svg = serializeSvg(FIXTURE_GRID, { cellW: 10, cellH: 20, fontSize: 18 });
  assert.ok(svg.startsWith('<svg'));
  assert.ok(svg.includes('width="30"'));
  assert.ok(svg.includes('height="60"'));
  assert.ok(svg.includes('fill="#0A0A0A"'));
  assert.ok(svg.trim().endsWith('</svg>'));
});

test('serializeSvg: dessine les glyphes non-blancs, saute le blank braille, ajoute la ligne seed', () => {
  const svg = serializeSvg(FIXTURE_GRID);
  assert.ok(svg.includes('>A</text>'));
  assert.ok(svg.includes('fill="#E61919"'));
  assert.ok(svg.includes('SEED 0x0000002A'));
  const textCount = (svg.match(/<text /g) || []).length;
  assert.equal(textCount, 6);
});
```

- [ ] **Step 2: Lancer les tests, vérifier l'échec**

Run: `cd cli && node --test test/serialize.test.js`
Expected: FAIL — `Cannot find module '../lib/serialize'`

- [ ] **Step 3: Écrire `cli/lib/serialize.js`**

```js
'use strict';

const { formatSeedLine } = require('./core');

function parseColor(color) {
  if (color[0] === '#') {
    return [parseInt(color.slice(1, 3), 16), parseInt(color.slice(3, 5), 16), parseInt(color.slice(5, 7), 16)];
  }
  const m = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  return m ? [+m[1], +m[2], +m[3]] : [255, 255, 255];
}

function serializeText(grid) {
  const art = grid.cells.map(row => row.map(c => c.char).join('')).join('\n');
  return `${art}\n\n${formatSeedLine(grid.meta)}`;
}

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

function escapeXml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

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

module.exports = { parseColor, serializeText, serializeAnsi, escapeXml, serializeSvg };
```

- [ ] **Step 4: Lancer les tests, vérifier le succès**

Run: `cd cli && node --test test/serialize.test.js`
Expected: PASS — tous les tests verts.

- [ ] **Step 5: Commit**

```bash
git add cli/lib/serialize.js cli/test/serialize.test.js
git commit -m "feat(cli): porte les serialiseurs texte/ansi/svg en module Node"
```

---

### Task 3: Export PNG (`cli/lib/png.js`)

**Files:**
- Create: `cli/lib/png.js`
- Test: `cli/test/png.test.js`
- Modify: `cli/package.json` (ajout dépendance `sharp`)

**Interfaces:**
- Consumes: `buildGrid` de `cli/lib/core.js`, `serializeSvg` de `cli/lib/serialize.js` (tests seulement).
- Produces: `serializeSvgToPngBuffer(svgString: string): Promise<Buffer>`

- [ ] **Step 1: Écrire le test qui va échouer — `cli/test/png.test.js`**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildGrid } = require('../lib/core');
const { serializeSvg } = require('../lib/serialize');
const { serializeSvgToPngBuffer } = require('../lib/png');

test('serializeSvgToPngBuffer: produit un buffer PNG valide', async () => {
  const grid = buildGrid('sthol', 1);
  const svg = serializeSvg(grid);
  const buffer = await serializeSvgToPngBuffer(svg);
  const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.ok(buffer.subarray(0, 8).equals(PNG_MAGIC));
});
```

- [ ] **Step 2: Lancer les tests, vérifier l'échec**

Run: `cd cli && node --test test/png.test.js`
Expected: FAIL — `Cannot find module '../lib/png'`

- [ ] **Step 3: Installer la dépendance `sharp`**

Run: `cd cli && npm install sharp`
Expected: `sharp` ajouté à `cli/package.json` (`dependencies`) et `cli/package-lock.json` créé/mis à jour.

- [ ] **Step 4: Écrire `cli/lib/png.js`**

```js
'use strict';

const sharp = require('sharp');

async function serializeSvgToPngBuffer(svgString) {
  return sharp(Buffer.from(svgString)).png().toBuffer();
}

module.exports = { serializeSvgToPngBuffer };
```

- [ ] **Step 5: Lancer les tests, vérifier le succès**

Run: `cd cli && node --test test/png.test.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add cli/package.json cli/package-lock.json cli/lib/png.js cli/test/png.test.js
git commit -m "feat(cli): ajoute l'export png via rasterisation svg (sharp)"
```

---

### Task 4: REPL (`cli/bin/heraldic.js`)

**Files:**
- Create: `cli/bin/heraldic.js`

**Interfaces:**
- Consumes: `buildGrid`, `slugify` de `cli/lib/core.js` ; `serializeText`, `serializeAnsi`, `serializeSvg` de `cli/lib/serialize.js` ; `serializeSvgToPngBuffer` de `cli/lib/png.js`.
- Produces: exécutable CLI, pas de module exporté (pas de `module.exports`).

Aucun test automatisé (I/O interactif, boucle `readline`) — même statut que `#blason-ui` dans le projet HTML. Vérification manuelle au vrai terminal en Step 4.

- [ ] **Step 1: Écrire `cli/bin/heraldic.js`**

```js
#!/usr/bin/env node
'use strict';

const fs = require('fs');
const readline = require('readline');
const crypto = require('crypto');

const { buildGrid, slugify } = require('../lib/core');
const { serializeText, serializeAnsi, serializeSvg } = require('../lib/serialize');
const { serializeSvgToPngBuffer } = require('../lib/png');

const BANNER = `▗▖ ▗▖▗▄▄▄▖▗▄▄▖  ▗▄▖ ▗▖   ▗▄▄▄ ▗▄▄▄▖ ▗▄▄▖
▐▌ ▐▌▐▌   ▐▌ ▐▌▐▌ ▐▌▐▌   ▐▌  █  █  ▐▌
▐▛▀▜▌▐▛▀▀▘▐▛▀▚▖▐▛▀▜▌▐▌   ▐▌  █  █  ▐▌
▐▌ ▐▌▐▙▄▄▖▐▌ ▐▌▐▌ ▐▌▐▙▄▄▖▐▙▄▄▀▗▄█▄▖▝▚▄▄▖
CLI v0.1.0 — tape /help`;

const EXPORT_FORMATS = ['png', 'txt', 'ans', 'svg'];

function makeEntropy() {
  return crypto.randomBytes(4).readUInt32BE(0) >>> 0;
}

let currentText = '';
let currentGrid = null;

function generate(text, entropy) {
  currentText = text;
  currentGrid = buildGrid(text, entropy);
  console.log(serializeAnsi(currentGrid));
}

function requireGrid() {
  if (!currentGrid) {
    console.log('aucun blason généré — tape un mot d’abord');
    return false;
  }
  return true;
}

async function runExport(fmt) {
  const filename = `${slugify(currentText)}.${fmt}`;
  if (fmt === 'txt') {
    fs.writeFileSync(filename, serializeText(currentGrid));
  } else if (fmt === 'ans') {
    fs.writeFileSync(filename, serializeAnsi(currentGrid));
  } else if (fmt === 'svg') {
    fs.writeFileSync(filename, serializeSvg(currentGrid));
  } else if (fmt === 'png') {
    const buffer = await serializeSvgToPngBuffer(serializeSvg(currentGrid));
    fs.writeFileSync(filename, buffer);
  }
  console.log(`écrit: ${filename}`);
}

function handleExport(arg) {
  if (!arg || !EXPORT_FORMATS.includes(arg)) {
    console.log(`format invalide — formats valides: ${EXPORT_FORMATS.join(', ')}`);
    return;
  }
  if (!requireGrid()) return;
  runExport(arg).catch((err) => {
    console.log(`échec écriture fichier: ${err.message}`);
  });
}

const COMMANDS = {
  help() {
    console.log([
      'commandes disponibles :',
      '  <texte>              génère un blason à partir du texte',
      '  /reroll               nouveau tirage du même texte',
      '  /export <fmt>         exporte le dernier blason (fmt: png, txt, ans, svg)',
      '  /clear                 vide l’écran',
      '  /quit                  quitte le programme',
      '  /help                  affiche cette liste',
    ].join('\n'));
  },
  reroll() {
    if (!requireGrid()) return;
    generate(currentText, makeEntropy());
  },
  clear() {
    console.clear();
  },
  quit() {
    rl.close();
  },
};

function handleLine(raw) {
  const text = raw.trim();
  if (text.length === 0) return;
  if (text[0] === '/') {
    const [name, ...rest] = text.slice(1).split(/\s+/);
    const key = name.toLowerCase();
    if (key === 'export') { handleExport(rest[0] ? rest[0].toLowerCase() : undefined); return; }
    if (Object.hasOwn(COMMANDS, key)) { COMMANDS[key](); return; }
    console.log(`commande inconnue: /${name} — tape /help`);
    return;
  }
  generate(text, makeEntropy());
}

console.log(BANNER);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: 'heraldic:~$ ',
});

rl.prompt();
rl.on('line', (line) => {
  handleLine(line);
  rl.prompt();
});
rl.on('close', () => {
  process.exit(0);
});
```

- [ ] **Step 2: Rendre le fichier exécutable**

Run: `chmod +x cli/bin/heraldic.js`

- [ ] **Step 3: Vérifier la syntaxe**

Run: `node --check cli/bin/heraldic.js`
Expected: aucune sortie (pas d'erreur de syntaxe).

- [ ] **Step 4: Vérification manuelle au vrai terminal**

Run: `cd cli && node bin/heraldic.js`

Taper successivement et vérifier le comportement attendu :
1. `chateau` → une grille braille colorée s'affiche (couleurs vraies dans le terminal).
2. `/help` → liste des commandes s'affiche.
3. `/reroll` → nouvelle grille pour le même mot, différente de la précédente.
4. `/export txt` → `écrit: chateau.txt` ; vérifier que le fichier existe (`ls chateau.txt`) et contient les glyphes + ligne SEED.
5. `/export svg` → `écrit: chateau.svg` ; ouvrir dans un navigateur pour confirmer le rendu.
6. `/export png` → `écrit: chateau.png` ; ouvrir pour confirmer une image valide.
7. `/export xyz` → `format invalide — formats valides: png, txt, ans, svg`.
8. `/xyz` → `commande inconnue: /xyz — tape /help`.
9. `/clear` → écran vidé.
10. `/quit` → le process se termine proprement (code de sortie 0, vérifier avec `echo $?`).

Nettoyer les fichiers générés après vérification : `rm -f cli/chateau.*`

- [ ] **Step 5: Commit**

```bash
git add cli/bin/heraldic.js
git commit -m "feat(cli): ajoute la boucle REPL et la grammaire de commande"
```

---

### Task 5: Finalisation packaging

**Files:**
- Create: `cli/README.md`
- Modify: `cli/package.json` (champ `description` déjà posé en Task 1, vérifié ici)

**Interfaces:**
- Consumes: rien de nouveau — vérifie l'assemblage complet des tâches précédentes.
- Produces: package prêt pour `npm link`/`npm publish` (publish non exécuté dans ce plan).

- [ ] **Step 1: Écrire `cli/README.md`**

```markdown
# heraldic

Générateur procédural de blasons ASCII/braille en CLI. Même texte, même blason, toujours — déterministe par construction (`mulberry32` seedé par hash du texte).

## Installation locale

\`\`\`bash
cd cli
npm install
npm link
\`\`\`

Puis lancer `heraldic` depuis n'importe quel répertoire.

## Usage

\`\`\`
heraldic:~$ chateau
[grille braille colorée]

heraldic:~$ /export png
écrit: chateau.png

heraldic:~$ /help
commandes disponibles :
  <texte>              génère un blason à partir du texte
  /reroll               nouveau tirage du même texte
  /export <fmt>         exporte le dernier blason (fmt: png, txt, ans, svg)
  /clear                 vide l'écran
  /quit                  quitte le programme
  /help                  affiche cette liste
\`\`\`

## Tests

\`\`\`bash
npm test
\`\`\`
```

- [ ] **Step 2: Vérifier le contenu du package publiable**

Run: `cd cli && npm pack --dry-run`
Expected: la liste inclut `bin/heraldic.js`, `lib/core.js`, `lib/serialize.js`, `lib/png.js`, `package.json`, `README.md` — rien d'autre (pas de `test/`, pas de fichiers générés par la vérification manuelle).

- [ ] **Step 3: Lancer la suite complète une dernière fois**

Run: `cd cli && npm test`
Expected: tous les tests des trois fichiers (`core.test.js`, `serialize.test.js`, `png.test.js`) passent.

- [ ] **Step 4: Commit**

```bash
git add cli/README.md
git commit -m "docs(cli): ajoute le README d'usage du package heraldic"
```

- [ ] **Step 5: Point d'arrêt — publication npm**

Ne pas exécuter `npm publish`. Une fois ce plan terminé, redemander confirmation explicite à l'utilisateur avant de publier (`npm login` si nécessaire, puis `npm publish` depuis `cli/`) — action publique irréversible, hors du périmètre automatique de ce plan.
