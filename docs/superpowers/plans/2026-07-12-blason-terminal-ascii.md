# Blason Terminal (ASCII/braille) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construire une variante « terminal / code / ASCII art » du générateur de blasons, dans `terminal/index.html`, avec vrai hasard par tirage, rendu grille braille+ASCII, animation de décodage et 4 exports.

**Architecture:** Une `Grid` de caractères est l'unique source de vérité. Un pipeline pur (texte+entropy → params → particules → champ de points → braille → overlay ASCII → couleur) produit la Grid ; des renderers (texte/ANSI/SVG purs ; DOM/canvas côté UI) la consomment. Logique pure dans `<script id="blason-script">` (testée `node --test`), câblage DOM dans `<script id="blason-ui">` (vérif manuelle).

**Tech Stack:** HTML/CSS/JS vanilla, fichier unique autonome, zéro dépendance/build. Tests `node:test` + `node:vm` (aucun npm). Entropie via `crypto.getRandomValues`.

## Global Constraints

- **Fichier unique autonome** : tout dans `terminal/index.html`. Zéro dépendance externe, zéro build, zéro backend, zéro API.
- **Séparation stricte** `#blason-script` (pur, zéro DOM, testé) vs `#blason-ui` (DOM, non testé). Aucun code DOM ne fuit dans `#blason-script`.
- **Jamais `Math.random()`** — y compris pour l'animation. Tout aléa cosmétique passe par un `mulberry32` seedé. Le SEUL vrai aléa autorisé = `crypto.getRandomValues` dans `makeEntropy` (côté UI uniquement).
- **Palette** : fond `#0A0A0A`, glyphes bleu odilon.wav `#6B7EC4`→`#8A9AD4`, accent hazard `#E61919` (unique, parcimonieux). Zéro `border-radius`, coins 90°, monospace exclusif.
- **Regex diacritiques** dans `slugify` : forme échappée `[̀-ͯ]` (JAMAIS caractères combinants littéraux — piège récurrent du projet). Vérifier `grep -n '0300' terminal/index.html` trouve la forme échappée.
- **Comparaisons de tableaux dans les tests** : les tableaux construits dans `node:vm` ont un `Array.prototype` différent du realm hôte → `assert/strict` `deepEqual` échoue à tort. Utiliser `require('node:assert')` (non strict, importé comme `assertLoose`) pour ces comparaisons précises.
- **Constantes figées** : `COLS = 80`, `ROWS = 50`, donc `DOT_W = 160`, `DOT_H = 200`. Export PNG `1080 × 1350`.
- **Cell** = `{ char:string, intensity:number, layer:'braille'|'struct'|'data', color?:string }`.
- **Grid** = `{ cols:number, rows:number, cells:Cell[][], seed:uint32, meta:{ rev:string, unit:string } }`.

---

## Ordre d'exécution & parallélisme (pour lancer des agents en parallèle)

```
T0  (SOLO, bloquant) ──┬─> T1 ┐
                       ├─> T2 ┤
                       ├─> T3 ┼─> T5 (buildGrid) ──┬─> T8  ┐
                       ├─> T4 ┤                     ├─> T9  ┤
                       ├─> T6 ┘                     ├─> T10 ┼─> T12 (intégration)
                       └─> T7 ─────────────────────┴─> T11 ┘
```

- **T0 d'abord, seul.** Il pose le squelette, les constantes, les utilitaires partagés (hashString/mulberry32/slugify) et le harness de test. Sans lui, rien ne compile.
- **Vague A — parallélisable (6 agents)** : **T1, T2, T3, T4, T6, T7**. Chacune est pure, TDD, isolée, et code contre les contrats du §Global Constraints + les fixtures fournies dans la tâche. Aucune ne dépend d'une autre de la vague A.
- **T5** attend T1–T4 (assemble le pipeline). T6/T7 (serializers) consomment une Grid mais via **fixture** fournie → n'attendent pas T5.
- **Vague B — parallélisable après T5 (4 agents)** : **T8, T9, T10, T11** (tout côté `#blason-ui`, vérif manuelle). T11 consomme aussi T6/T7.
- **T12** en dernier : intégration, tests d'acceptation, README.

Chaque tâche est **auto-portante** : elle contient le code complet, les tests, les commandes, et les signatures des voisins dont elle dépend. Un agent n'a pas besoin de lire les autres tâches.

---

## Task 0: Scaffold + constantes + utilitaires + harness de test

**Files:**
- Create: `terminal/index.html`
- Create: `terminal/test/support/extract-core.js`
- Create: `terminal/test/core.test.js`

**Interfaces:**
- Produces: `COLS`, `ROWS`, `DOT_W`, `DOT_H` (constantes) ; `hashString(text)->uint32` ; `mulberry32(seed)->()=>number` ; `slugify(text)->string`. Tous exportés via `module.exports` depuis `#blason-script`.

- [ ] **Step 1: Créer le squelette `terminal/index.html`**

```html
<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Blason terminal — vvd.world</title>
<style>
  :root {
    --color-bg: #0A0A0A;
    --color-a: #6B7EC4;
    --color-b: #8A9AD4;
    --color-hazard: #E61919;
  }
  html, body {
    margin: 0; min-height: 100dvh;
    background: var(--color-bg); color: var(--color-b);
    font-family: monospace;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 16px; padding: 24px; box-sizing: border-box;
  }
  /* UI détaillée en T10 */
</style>
</head>
<body>
  <!-- DOM détaillé en T10 -->

  <script id="blason-script">
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
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40);
      return slug.length > 0 ? slug : 'blason';
    }

    if (typeof module !== 'undefined' && module.exports) {
      module.exports = { COLS, ROWS, DOT_W, DOT_H, hashString, mulberry32, slugify };
    }
  </script>

  <script id="blason-ui">
    // Câblage DOM ajouté en T8–T11.
  </script>
</body>
</html>
```

- [ ] **Step 2: Créer le harness `terminal/test/support/extract-core.js`**

```js
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadBlasonCore() {
  const htmlPath = path.join(__dirname, '..', '..', 'index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');
  const match = html.match(/<script id="blason-script">([\s\S]*?)<\/script>/);
  if (!match) {
    throw new Error('blason-script tag not found in terminal/index.html');
  }
  const sandbox = { module: { exports: {} }, console };
  vm.createContext(sandbox);
  vm.runInContext(match[1], sandbox, { filename: 'terminal/index.html#blason-script' });
  return sandbox.module.exports;
}

module.exports = { loadBlasonCore };
```

- [ ] **Step 3: Écrire le test smoke `terminal/test/core.test.js`**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const assertLoose = require('node:assert');
const { loadBlasonCore } = require('./support/extract-core');

test('constantes de grille figées', () => {
  const { COLS, ROWS, DOT_W, DOT_H } = loadBlasonCore();
  assert.equal(COLS, 80);
  assert.equal(ROWS, 50);
  assert.equal(DOT_W, 160);
  assert.equal(DOT_H, 200);
});

test('hashString déterministe', () => {
  const { hashString } = loadBlasonCore();
  assert.equal(hashString('sthol'), hashString('sthol'));
  assert.notEqual(hashString('sthol'), hashString('kaldrek'));
});

test('mulberry32 reproductible', () => {
  const { mulberry32 } = loadBlasonCore();
  const a = mulberry32(123), b = mulberry32(123);
  assertLoose.deepEqual([a(), a(), a()], [b(), b(), b()]);
});

test('slugify utilise la forme échappée des diacritiques', () => {
  const { slugify } = loadBlasonCore();
  assert.equal(slugify('Épée Ardente'), 'epee-ardente');
  assert.equal(slugify(''), 'blason');
});
```

- [ ] **Step 4: Lancer les tests, vérifier vert**

Run: `node --test terminal/test/core.test.js`
Expected: 4 tests PASS.

- [ ] **Step 5: Vérifier la forme échappée**

Run: `grep -n '0300' terminal/index.html`
Expected: 1 ligne trouvée (la regex de `slugify`). Si rien : la forme littérale s'est glissée → corriger via script Node de remplacement d'octets (cf CLAUDE.md).

- [ ] **Step 6: Commit**

```bash
git add terminal/index.html terminal/test/
git commit -m "feat(terminal): scaffold + constantes + utilitaires + harness de test"
```

---

## Task 1: Modèle — entropy + deriveParams (double flux RNG)

**Files:**
- Modify: `terminal/index.html` (`#blason-script`, ajouter fonctions + export)
- Modify: `terminal/test/core.test.js` (ajouter tests)

**Interfaces:**
- Consumes: `mulberry32` (T0).
- Produces:
  - `makeEntropy() -> uint32` (utilise `crypto.getRandomValues`, **non testé**, appelé côté UI).
  - `gaussianRandom(rng) -> number`.
  - `deriveParams(familyRng, variantRng) -> Params` où
    `Params = { symmetry:{type:'axial'|'radial', k:number}, sectorAngle:number, clusters:Array<{angle,distance,radius,particleCount}>, jitter:number, paletteBias:number, densityBand:number, frame:'brackets'|'box'|'ticks' }`.

- [ ] **Step 1: Écrire les tests (échec attendu)**

Ajouter à `terminal/test/core.test.js` :

```js
test('deriveParams: même famille pour même familyRng, micro variable', () => {
  const { mulberry32, deriveParams } = loadBlasonCore();
  const p1 = deriveParams(mulberry32(42), mulberry32(1));
  const p2 = deriveParams(mulberry32(42), mulberry32(2));
  // macro stable (dépend de familyRng seul)
  assert.deepEqual(p1.symmetry, p2.symmetry);
  assert.equal(p1.frame, p2.frame);
  // micro variable (dépend de variantRng)
  assert.notDeepEqual(p1.clusters, p2.clusters);
});

test('deriveParams: bornes des paramètres', () => {
  const { mulberry32, deriveParams } = loadBlasonCore();
  const p = deriveParams(mulberry32(7), mulberry32(9));
  assert.ok(['axial', 'radial'].includes(p.symmetry.type));
  assert.ok(p.clusters.length >= 3 && p.clusters.length <= 7);
  assert.ok(p.jitter >= 0.3 && p.jitter <= 0.8);
  assert.ok(['brackets', 'box', 'ticks'].includes(p.frame));
  for (const c of p.clusters) {
    assert.ok(c.distance >= 0.15 && c.distance <= 0.9);
    assert.ok(c.particleCount > 0);
  }
});

test('gaussianRandom: renvoie un nombre fini', () => {
  const { mulberry32, gaussianRandom } = loadBlasonCore();
  const rng = mulberry32(3);
  for (let i = 0; i < 20; i++) assert.ok(Number.isFinite(gaussianRandom(rng)));
});
```

- [ ] **Step 2: Lancer, vérifier échec**

Run: `node --test terminal/test/core.test.js`
Expected: FAIL — `deriveParams is not a function`.

- [ ] **Step 3: Implémenter dans `#blason-script`** (avant le bloc `module.exports`)

```js
    function makeEntropy() {
      // Vrai aléa — SEUL usage de crypto, côté runtime. Non couvert par les tests
      // (buildGrid reçoit une entropy explicite pour rester déterministe en test).
      return crypto.getRandomValues(new Uint32Array(1))[0] >>> 0;
    }

    function gaussianRandom(rng) {
      let u = 0, v = 0;
      while (u === 0) u = rng();
      while (v === 0) v = rng();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    }

    function deriveParams(familyRng, variantRng) {
      // MACRO (stable par texte) — piloté par familyRng
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
      const densityBand = 0.6 + familyRng() * 0.8;
      const frames = ['brackets', 'box', 'ticks'];
      const frame = frames[Math.floor(familyRng() * frames.length)];

      // MICRO (variable par tirage) — piloté par variantRng
      const clusterCount = 3 + Math.floor(variantRng() * 5); // 3..7
      const clusters = [];
      for (let i = 0; i < clusterCount; i++) {
        clusters.push({
          angle: variantRng() * sectorAngle,
          distance: 0.15 + variantRng() * 0.75,
          radius: 0.08 + variantRng() * 0.12,
          particleCount: Math.floor((120 + variantRng() * 260) * densityBand),
        });
      }
      const jitter = 0.3 + variantRng() * 0.5;

      return { symmetry, sectorAngle, clusters, jitter, paletteBias, densityBand, frame };
    }
```

Puis étendre l'export :

```js
      module.exports = { COLS, ROWS, DOT_W, DOT_H, hashString, mulberry32, slugify,
        makeEntropy, gaussianRandom, deriveParams };
```

- [ ] **Step 4: Lancer, vérifier vert**

Run: `node --test terminal/test/core.test.js`
Expected: tous PASS.

- [ ] **Step 5: Commit**

```bash
git add terminal/index.html terminal/test/core.test.js
git commit -m "feat(terminal): modèle deriveParams double flux RNG + gaussianRandom + makeEntropy"
```

---

## Task 2: Particules → champ de points

**Files:**
- Modify: `terminal/index.html` (`#blason-script`)
- Modify: `terminal/test/core.test.js`

**Interfaces:**
- Consumes: `gaussianRandom` (T1), `mulberry32` (T0). Type `Params` (T1).
- Produces:
  - `generateParticles(params, rng, width, height) -> Array<{x:number, y:number}>`.
  - `rasterizeToDotField(particles, dotW, dotH) -> Float64Array` de longueur `dotW*dotH`, valeurs normalisées `[0,1]`.

**Fixture params (n'attends pas T1 réel) :**
```js
const FIXTURE_PARAMS = {
  symmetry: { type: 'radial', k: 4 }, sectorAngle: Math.PI / 2,
  clusters: [{ angle: 0.3, distance: 0.5, radius: 0.1, particleCount: 100 }],
  jitter: 0.5, paletteBias: 0.5, densityBand: 1, frame: 'box',
};
```

- [ ] **Step 1: Écrire les tests (échec attendu)**

```js
test('generateParticles: respecte la symétrie radiale (k centres)', () => {
  const { mulberry32, generateParticles } = loadBlasonCore();
  const params = { symmetry: { type: 'radial', k: 4 }, sectorAngle: Math.PI / 2,
    clusters: [{ angle: 0.3, distance: 0.5, radius: 0.1, particleCount: 10 }],
    jitter: 0.5, paletteBias: 0.5, densityBand: 1, frame: 'box' };
  const pts = generateParticles(params, mulberry32(1), 160, 200);
  assert.equal(pts.length, 4 * 10); // k centres × particleCount
  for (const p of pts) { assert.ok(Number.isFinite(p.x)); assert.ok(Number.isFinite(p.y)); }
});

test('generateParticles: axial = 2 centres miroir', () => {
  const { mulberry32, generateParticles } = loadBlasonCore();
  const params = { symmetry: { type: 'axial', k: 2 }, sectorAngle: Math.PI,
    clusters: [{ angle: 0.3, distance: 0.5, radius: 0.1, particleCount: 5 }],
    jitter: 0.5, paletteBias: 0.5, densityBand: 1, frame: 'box' };
  const pts = generateParticles(params, mulberry32(1), 160, 200);
  assert.equal(pts.length, 2 * 5);
});

test('rasterizeToDotField: longueur et normalisation', () => {
  const { rasterizeToDotField } = loadBlasonCore();
  const field = rasterizeToDotField([{ x: 5, y: 5 }, { x: 5, y: 5 }, { x: 10, y: 10 }], 160, 200);
  assert.equal(field.length, 160 * 200);
  let max = 0; for (const v of field) if (v > max) max = v;
  assert.equal(max, 1); // pic normalisé à 1
  assert.equal(field[5 * 160 + 5], 1); // cellule à 2 hits = max
  assert.equal(field[10 * 160 + 10], 0.5); // cellule à 1 hit = moitié
});

test('rasterizeToDotField: ignore les points hors champ', () => {
  const { rasterizeToDotField } = loadBlasonCore();
  const field = rasterizeToDotField([{ x: -1, y: 5 }, { x: 999, y: 5 }], 160, 200);
  let sum = 0; for (const v of field) sum += v;
  assert.equal(sum, 0);
});
```

- [ ] **Step 2: Lancer, vérifier échec**

Run: `node --test terminal/test/core.test.js`
Expected: FAIL — `generateParticles is not a function`.

- [ ] **Step 3: Implémenter dans `#blason-script`**

```js
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
```

Étendre l'export : ajouter `generateParticles, rasterizeToDotField`.

- [ ] **Step 4: Lancer, vérifier vert**

Run: `node --test terminal/test/core.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add terminal/index.html terminal/test/core.test.js
git commit -m "feat(terminal): generateParticles + rasterizeToDotField"
```

---

## Task 3: Champ de points → grille braille

**Files:**
- Modify: `terminal/index.html` (`#blason-script`)
- Modify: `terminal/test/core.test.js`

**Interfaces:**
- Consumes: un champ `Float64Array` de longueur `dotW*dotH` (T2), `COLS`/`ROWS` (T0).
- Produces:
  - `BRAILLE_BITS` (constante interne, non exportée).
  - `dotFieldToBraille(dotField, cols, rows, threshold=0.12) -> Cell[][]` où chaque `Cell = { char, intensity, layer:'braille' }`. `char` = glyphe braille Unicode (`0x2800 + bits`).

- [ ] **Step 1: Écrire les tests (échec attendu)**

```js
test('dotFieldToBraille: dimensions de la grille', () => {
  const { dotFieldToBraille } = loadBlasonCore();
  const field = new Float64Array(160 * 200);
  const cells = dotFieldToBraille(field, 80, 50);
  assert.equal(cells.length, 50);
  assert.equal(cells[0].length, 80);
});

test('dotFieldToBraille: champ vide = blank braille U+2800', () => {
  const { dotFieldToBraille } = loadBlasonCore();
  const cells = dotFieldToBraille(new Float64Array(160 * 200), 80, 50);
  assert.equal(cells[0][0].char, '⠀');
  assert.equal(cells[0][0].intensity, 0);
  assert.equal(cells[0][0].layer, 'braille');
});

test('dotFieldToBraille: point haut-gauche allume dot1 (0x2801)', () => {
  const { dotFieldToBraille } = loadBlasonCore();
  const field = new Float64Array(160 * 200);
  field[0] = 1; // sous-point (0,0) de la cellule (0,0)
  const cells = dotFieldToBraille(field, 80, 50);
  assert.equal(cells[0][0].char, '⠁'); // dot1
});

test('dotFieldToBraille: cellule pleine = 0x28FF', () => {
  const { dotFieldToBraille } = loadBlasonCore();
  const field = new Float64Array(160 * 200);
  for (let dy = 0; dy < 4; dy++) for (let dx = 0; dx < 2; dx++) field[dy * 160 + dx] = 1;
  const cells = dotFieldToBraille(field, 80, 50);
  assert.equal(cells[0][0].char, '⣿');
  assert.equal(cells[0][0].intensity, 1);
});
```

- [ ] **Step 2: Lancer, vérifier échec**

Run: `node --test terminal/test/core.test.js`
Expected: FAIL — `dotFieldToBraille is not a function`.

- [ ] **Step 3: Implémenter dans `#blason-script`**

```js
    // Disposition des points braille (Unicode) par [dy][dx] :
    //   dot1 dot4      0x01 0x08
    //   dot2 dot5      0x02 0x10
    //   dot3 dot6      0x04 0x20
    //   dot7 dot8      0x40 0x80
    const BRAILLE_BITS = [
      [0x01, 0x08],
      [0x02, 0x10],
      [0x04, 0x20],
      [0x40, 0x80],
    ];

    function dotFieldToBraille(dotField, cols, rows, threshold) {
      if (threshold === undefined) threshold = 0.12;
      const dotW = cols * 2;
      const cells = [];
      for (let ry = 0; ry < rows; ry++) {
        const row = [];
        for (let cx = 0; cx < cols; cx++) {
          let bits = 0, sum = 0;
          for (let dy = 0; dy < 4; dy++) {
            for (let dx = 0; dx < 2; dx++) {
              const v = dotField[(ry * 4 + dy) * dotW + (cx * 2 + dx)];
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
```

Étendre l'export : ajouter `dotFieldToBraille`.

- [ ] **Step 4: Lancer, vérifier vert**

Run: `node --test terminal/test/core.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add terminal/index.html terminal/test/core.test.js
git commit -m "feat(terminal): dotFieldToBraille (mapping bits → glyphe braille)"
```

---

## Task 4: Overlay structurel ASCII (cadre, crosshairs, ligne data)

**Files:**
- Modify: `terminal/index.html` (`#blason-script`)
- Modify: `terminal/test/core.test.js`

**Interfaces:**
- Consumes: `Cell[][]` (grille braille, T3), `Params` (T1).
- Produces:
  - `overlayStructural(cells, params, meta) -> Cell[][]` (mute et retourne `cells`). `meta = { seed:uint32, rev:string, unit:string }`. Écrit le cadre (selon `params.frame`), des crosshairs `+`, et la ligne data (`SEED 0x… REV … UNIT/…`) en marquant ces cellules `layer:'struct'` (cadre/crosshairs) ou `layer:'data'` (ligne SEED).

- [ ] **Step 1: Écrire les tests (échec attendu)**

```js
function blankGrid(core, cols, rows) {
  return core.dotFieldToBraille(new Float64Array(cols * 2 * rows * 4), cols, rows);
}

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

test('overlayStructural frame=ticks: pas de bordure pleine', () => {
  const core = loadBlasonCore();
  const cells = blankGrid(core, 80, 50);
  core.overlayStructural(cells, { frame: 'ticks' }, { seed: 1, rev: '2.6', unit: 'U' });
  assert.equal(cells[0][0].char, '+'); // tick au coin
});
```

- [ ] **Step 2: Lancer, vérifier échec**

Run: `node --test terminal/test/core.test.js`
Expected: FAIL — `overlayStructural is not a function`.

- [ ] **Step 3: Implémenter dans `#blason-script`**

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

Étendre l'export : ajouter `overlayStructural`.

- [ ] **Step 4: Lancer, vérifier vert**

Run: `node --test terminal/test/core.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add terminal/index.html terminal/test/core.test.js
git commit -m "feat(terminal): overlayStructural (cadre + crosshairs + ligne data)"
```

---

## Task 5: colorize + buildGrid (orchestrateur du pipeline)

**Files:**
- Modify: `terminal/index.html` (`#blason-script`)
- Modify: `terminal/test/core.test.js`

**Interfaces:**
- Consumes: `deriveParams` (T1), `generateParticles`/`rasterizeToDotField` (T2), `dotFieldToBraille` (T3), `overlayStructural` (T4), `hashString`/`mulberry32`/constantes (T0).
- Produces:
  - `colorize(cells, params) -> Grid` : ajoute `color` à chaque cellule (`layer:'data'`→`#E61919` ; `layer:'struct'`→`#8A9AD4` ; `layer:'braille'`→dégradé `#6B7EC4`→`#8A9AD4` selon `intensity` et `paletteBias`). Retourne `{ cols, rows, cells }`.
  - `buildGrid(text, entropy, opts={}) -> Grid` complet, avec `grid.seed` et `grid.meta` renseignés. **C'est l'API principale consommée par l'UI.**

- [ ] **Step 1: Écrire les tests (échec attendu)**

```js
test('colorize: couleurs par layer', () => {
  const core = loadBlasonCore();
  const cells = [[
    { char: '⣿', intensity: 1, layer: 'braille' },
    { char: '│', intensity: 1, layer: 'struct' },
    { char: 'S', intensity: 1, layer: 'data' },
  ]];
  const grid = core.colorize(cells, { paletteBias: 0.5 });
  assert.equal(grid.cells[0][2].color, '#E61919');   // data = rouge
  assert.equal(grid.cells[0][1].color, '#8A9AD4');   // struct = bleu clair
  assert.ok(/^rgb\(/.test(grid.cells[0][0].color));  // braille = rgb(...)
});

test('buildGrid: grille complète bien formée', () => {
  const { buildGrid, COLS, ROWS } = loadBlasonCore();
  const grid = buildGrid('sthol', 0xABCDEF01);
  assert.equal(grid.cols, COLS);
  assert.equal(grid.rows, ROWS);
  assert.equal(grid.cells.length, ROWS);
  assert.equal(grid.cells[0].length, COLS);
  assert.equal(grid.seed, (grid.seed >>> 0));
  assert.ok(grid.cells.every(row => row.every(c => typeof c.color === 'string')));
});

test('buildGrid: déterministe pour (texte, entropy) fixés', () => {
  const { buildGrid } = loadBlasonCore();
  const a = buildGrid('sthol', 42);
  const b = buildGrid('sthol', 42);
  const flat = g => g.cells.map(r => r.map(c => c.char).join('')).join('\n');
  assert.equal(flat(a), flat(b));
});

test('buildGrid: vrai hasard — entropies différentes = grilles différentes', () => {
  const { buildGrid } = loadBlasonCore();
  const flat = g => g.cells.map(r => r.map(c => c.char).join('')).join('\n');
  assert.notEqual(flat(buildGrid('sthol', 1)), flat(buildGrid('sthol', 2)));
});

test('buildGrid: même mot = même seed de famille (symétrie stable)', () => {
  const { buildGrid, hashString, mulberry32, deriveParams } = loadBlasonCore();
  const expected = deriveParams(mulberry32(hashString('sthol')), mulberry32(1)).symmetry;
  // la symétrie ne dépend que de familyRng(hashString(texte)) → stable quel que soit entropy
  const g1 = buildGrid('sthol', 111);
  const g2 = buildGrid('sthol', 222);
  // pas d'accès direct aux params depuis grid : on vérifie via la stabilité de la famille
  // en comparant la structure de cadre (frame dépend de familyRng)
  const frameChar = g => g.cells[0][0].char;
  assert.equal(frameChar(g1), frameChar(g2));
});
```

- [ ] **Step 2: Lancer, vérifier échec**

Run: `node --test terminal/test/core.test.js`
Expected: FAIL — `colorize is not a function`.

- [ ] **Step 3: Implémenter dans `#blason-script`**

```js
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
      cells = overlayStructural(cells, params, meta);
      const grid = colorize(cells, params);
      grid.seed = seed;
      grid.meta = meta;
      return grid;
    }
```

Étendre l'export : ajouter `colorize, buildGrid`.

- [ ] **Step 4: Lancer, vérifier vert**

Run: `node --test terminal/test/core.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add terminal/index.html terminal/test/core.test.js
git commit -m "feat(terminal): colorize + buildGrid (orchestrateur pipeline complet)"
```

---

## Task 6: Serializers texte + ANSI

**Files:**
- Modify: `terminal/index.html` (`#blason-script`)
- Modify: `terminal/test/core.test.js`

**Interfaces:**
- Consumes: une `Grid` (T5). N'attends PAS T5 : utilise la fixture ci-dessous.
- Produces:
  - `serializeText(grid) -> string` (lignes jointes par `\n`, glyphes bruts).
  - `serializeAnsi(grid) -> string` (codes couleur truecolor `\x1b[38;2;R;G;Bm`, reset `\x1b[0m` par ligne).
  - `parseColor(color) -> [r,g,b]` (helper interne, gère `#RRGGBB` et `rgb(r, g, b)`).

**Fixture Grid (n'attends pas T5) :**
```js
const FIXTURE_GRID = {
  cols: 3, rows: 2,
  cells: [
    [{ char: 'A', color: '#E61919', layer: 'data' },
     { char: 'B', color: '#8A9AD4', layer: 'struct' },
     { char: 'C', color: 'rgb(107, 126, 196)', layer: 'braille' }],
    [{ char: '⠁', color: 'rgb(120, 130, 200)', layer: 'braille' },
     { char: '⠀', color: 'rgb(107, 126, 196)', layer: 'braille' },
     { char: 'D', color: '#8A9AD4', layer: 'struct' }],
  ],
  seed: 42, meta: { rev: '2.6', unit: 'U' },
};
```

- [ ] **Step 1: Écrire les tests (échec attendu)**

```js
const FIXTURE_GRID = { cols: 3, rows: 2, cells: [
  [{ char: 'A', color: '#E61919', layer: 'data' },
   { char: 'B', color: '#8A9AD4', layer: 'struct' },
   { char: 'C', color: 'rgb(107, 126, 196)', layer: 'braille' }],
  [{ char: '⠁', color: 'rgb(120, 130, 200)', layer: 'braille' },
   { char: '⠀', color: 'rgb(107, 126, 196)', layer: 'braille' },
   { char: 'D', color: '#8A9AD4', layer: 'struct' }],
], seed: 42, meta: { rev: '2.6', unit: 'U' } };

test('serializeText: lignes jointes, glyphes bruts', () => {
  const { serializeText } = loadBlasonCore();
  assert.equal(serializeText(FIXTURE_GRID), 'ABC\n⠁⠀D');
});

test('parseColor: hex et rgb()', () => {
  const { parseColor } = loadBlasonCore();
  assertLoose.deepEqual(parseColor('#E61919'), [230, 25, 25]);
  assertLoose.deepEqual(parseColor('rgb(107, 126, 196)'), [107, 126, 196]);
});

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

- [ ] **Step 2: Lancer, vérifier échec**

Run: `node --test terminal/test/core.test.js`
Expected: FAIL — `serializeText is not a function`.

- [ ] **Step 3: Implémenter dans `#blason-script`**

```js
    function parseColor(color) {
      if (color[0] === '#') {
        return [parseInt(color.slice(1, 3), 16), parseInt(color.slice(3, 5), 16), parseInt(color.slice(5, 7), 16)];
      }
      const m = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
      return m ? [+m[1], +m[2], +m[3]] : [255, 255, 255];
    }

    function serializeText(grid) {
      return grid.cells.map(row => row.map(c => c.char).join('')).join('\n');
    }

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

Étendre l'export : ajouter `parseColor, serializeText, serializeAnsi`.

- [ ] **Step 4: Lancer, vérifier vert**

Run: `node --test terminal/test/core.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add terminal/index.html terminal/test/core.test.js
git commit -m "feat(terminal): serializeText + serializeAnsi + parseColor"
```

---

## Task 7: Serializer SVG

**Files:**
- Modify: `terminal/index.html` (`#blason-script`)
- Modify: `terminal/test/core.test.js`

**Interfaces:**
- Consumes: une `Grid` (T5). Utilise la même fixture qu'en T6.
- Produces:
  - `escapeXml(s) -> string` (helper interne).
  - `serializeSvg(grid, opts={}) -> string`. `opts` : `cellW` (défaut 13.5), `cellH` (défaut 27), `fontSize` (défaut 24). Fond `#0A0A0A`, `<text>` par cellule non-blanche, `font-family:monospace`, couleur = `cell.color`. Ignore les cellules `char===' '` ou `'⠀'`.

- [ ] **Step 1: Écrire les tests (échec attendu)**

(réutilise `FIXTURE_GRID` défini en T6 ; si T7 est développée avant T6, coller la fixture ici.)

```js
test('escapeXml: échappe &, <, >', () => {
  const { escapeXml } = loadBlasonCore();
  assert.equal(escapeXml('a<b>&c'), 'a&lt;b&gt;&amp;c');
});

test('serializeSvg: enveloppe SVG + fond + dimensions', () => {
  const { serializeSvg } = loadBlasonCore();
  const svg = serializeSvg(FIXTURE_GRID, { cellW: 10, cellH: 20, fontSize: 18 });
  assert.ok(svg.startsWith('<svg'));
  assert.ok(svg.includes('width="30"'));   // 3 cols × 10
  assert.ok(svg.includes('height="40"'));  // 2 rows × 20
  assert.ok(svg.includes('fill="#0A0A0A"')); // fond
  assert.ok(svg.trim().endsWith('</svg>'));
});

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

- [ ] **Step 2: Lancer, vérifier échec**

Run: `node --test terminal/test/core.test.js`
Expected: FAIL — `serializeSvg is not a function`.

- [ ] **Step 3: Implémenter dans `#blason-script`**

```js
    function escapeXml(s) {
      return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

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

Étendre l'export : ajouter `escapeXml, serializeSvg`.

- [ ] **Step 4: Lancer, vérifier vert**

Run: `node --test terminal/test/core.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add terminal/index.html terminal/test/core.test.js
git commit -m "feat(terminal): serializeSvg + escapeXml"
```

---

## Task 8: Rendu canvas (PNG) — `#blason-ui`

**Files:**
- Modify: `terminal/index.html` (`#blason-ui` + `<canvas>` dans le DOM)

**Interfaces:**
- Consumes: une `Grid` (T5, via `buildGrid`).
- Produces: `renderToCanvas(ctx, grid, w, h)` — dessine la grille en `fillText` monospace sur fond `#0A0A0A`. Fonction côté UI (non testée). Sera appelée par l'export PNG (T11).

**Note :** pas de test automatisé (DOM/canvas). Vérification manuelle navigateur.

- [ ] **Step 1: Ajouter le canvas caché au DOM** (dans `<body>`, avant les scripts)

```html
  <canvas id="blason-canvas" width="1080" height="1350" style="display:none"></canvas>
```

- [ ] **Step 2: Implémenter `renderToCanvas` dans `#blason-ui`**

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

- [ ] **Step 3: Vérification manuelle**

Ouvrir `terminal/index.html` dans un navigateur, dans la console :
```js
const g = buildGrid('sthol', 12345);
const cv = document.getElementById('blason-canvas');
cv.style.display = 'block';
renderToCanvas(cv.getContext('2d'), g, 1080, 1350);
```
Expected: blason braille bleu + cadre + ligne SEED rouge sur fond sombre. Réafficher `cv.style.display='none'` ensuite.

- [ ] **Step 4: Commit**

```bash
git add terminal/index.html
git commit -m "feat(terminal): renderToCanvas (rendu grille → PNG)"
```

---

## Task 9: Rendu DOM + animation de décodage — `#blason-ui`

**Files:**
- Modify: `terminal/index.html` (`#blason-ui` + `<pre id="blason-out">` + CSS)

**Interfaces:**
- Consumes: une `Grid` (T5), `mulberry32` (T0).
- Produces:
  - `renderToDom(grid, pre)` — rendu statique `<pre>` avec spans colorés.
  - `renderDecode(grid, pre)` — animation de décodage (scramble → fixe, staggered radial), respecte `prefers-reduced-motion`. Aléa cosmétique via `mulberry32(grid.seed)` (JAMAIS `Math.random`).

**Note :** pas de test automatisé. Vérification manuelle.

- [ ] **Step 1: Ajouter le conteneur au DOM + CSS**

DOM (dans `<body>`) :
```html
  <pre id="blason-out" aria-live="polite"></pre>
```
CSS (dans `<style>`) :
```css
  #blason-out {
    margin: 0; line-height: 1; letter-spacing: 0;
    font-size: clamp(4px, 1.4vw, 11px);
    white-space: pre; background: var(--color-bg);
  }
  #blason-out span { display: inline; }
```

- [ ] **Step 2: Implémenter `renderToDom` + `renderDecode` dans `#blason-ui`**

```js
    function cellSpan(ch, color) {
      const safe = ch === '<' ? '&lt;' : ch === '&' ? '&amp;' : ch;
      return `<span style="color:${color}">${safe}</span>`;
    }

    function renderToDom(grid, pre) {
      let html = '';
      for (let r = 0; r < grid.rows; r++) {
        for (let c = 0; c < grid.cols; c++) {
          const cell = grid.cells[r][c];
          html += cellSpan(cell.char, cell.color);
        }
        if (r < grid.rows - 1) html += '\n';
      }
      pre.innerHTML = html;
    }

    function renderDecode(grid, pre) {
      const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduce) { renderToDom(grid, pre); return; }

      const SCRAMBLE = '⠿⣿⢿⡿⣻⠷█▓▒░/\\|+°';
      const rng = mulberry32(grid.seed >>> 0);
      const cx = grid.cols / 2, cy = grid.rows / 2;
      const maxD = Math.hypot(cx, cy);
      const DUR = 500, STAGGER = 500;
      const start = performance.now();

      function frame(now) {
        const t = now - start;
        let done = true;
        let html = '';
        for (let r = 0; r < grid.rows; r++) {
          for (let c = 0; c < grid.cols; c++) {
            const cell = grid.cells[r][c];
            const d = Math.hypot(c - cx, r - cy) / maxD;
            const cellStart = d * STAGGER;
            if (t >= cellStart + DUR) {
              html += cellSpan(cell.char, cell.color);
            } else if (t < cellStart) {
              html += cellSpan(cell.char === '⠀' ? '⠀' : ' ', cell.color);
              done = false;
            } else {
              const ch = SCRAMBLE[Math.floor(rng() * SCRAMBLE.length)];
              html += cellSpan(ch, cell.color);
              done = false;
            }
          }
          if (r < grid.rows - 1) html += '\n';
        }
        pre.innerHTML = html;
        if (!done) requestAnimationFrame(frame);
        else renderToDom(grid, pre);
      }
      requestAnimationFrame(frame);
    }
```

- [ ] **Step 3: Vérification manuelle**

Ouvrir dans navigateur, console :
```js
renderDecode(buildGrid('kaldrek', 999), document.getElementById('blason-out'));
```
Expected: décodage scramble → blason net (~1s). Tester avec `prefers-reduced-motion` activé (DevTools > Rendering) : rendu instantané, pas de scramble.

- [ ] **Step 4: Commit**

```bash
git add terminal/index.html
git commit -m "feat(terminal): renderToDom + renderDecode (animation décodage)"
```

---

## Task 10: Câblage UI terminal (input, Entrée, reroll, reduced-motion) — `#blason-ui`

**Files:**
- Modify: `terminal/index.html` (DOM prompt + CSS + `#blason-ui` wiring)

**Interfaces:**
- Consumes: `buildGrid` (T5), `makeEntropy` (T1), `renderDecode`/`renderToDom` (T9).
- Produces: état global `currentText`, `currentEntropy`, `currentGrid` (utilisés par les exports T11) ; fonction `generate(text, entropy)` qui construit + rend + mémorise `currentGrid`.

**Note :** pas de test automatisé. Vérification manuelle.

- [ ] **Step 1: Ajouter le DOM du prompt terminal** (dans `<body>`, avant `<pre id="blason-out">`)

```html
  <div id="blason-prompt">
    <label for="blason-input" class="sr-only">Mot-clé ou phrase à transformer en blason</label>
    <span aria-hidden="true">heraldic@vvd:~$</span>
    <input id="blason-input" type="text" placeholder="tape un mot puis Entrée" autocomplete="off" spellcheck="false">
  </div>
  <div id="blason-actions">
    <button id="blason-reroll" type="button">[ RE-ROLL ]</button>
  </div>
```

- [ ] **Step 2: Ajouter le CSS** (dans `<style>`)

```css
  .sr-only {
    position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
    overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0;
  }
  #blason-prompt { display: flex; align-items: center; gap: 8px; width: 100%; max-width: 520px; }
  #blason-prompt span { color: var(--color-a); white-space: nowrap; }
  #blason-input {
    flex: 1; background: var(--color-bg); color: var(--color-b);
    border: 1px solid var(--color-a); padding: 10px; font-family: monospace;
    font-size: 16px; min-height: 44px; box-sizing: border-box;
  }
  #blason-input:focus-visible { outline: 2px solid var(--color-b); outline-offset: 2px; }
  button {
    background: var(--color-bg); color: var(--color-b); border: 1px solid var(--color-a);
    padding: 10px 14px; font-family: monospace; font-size: 14px; min-height: 44px;
    cursor: pointer; text-transform: uppercase;
  }
  button:hover:not(:disabled) { border-color: var(--color-b); }
  button:disabled { opacity: 0.5; cursor: not-allowed; }
  button:focus-visible { outline: 2px solid var(--color-b); outline-offset: 2px; }
```

- [ ] **Step 3: Implémenter le wiring dans `#blason-ui`**

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
```

- [ ] **Step 4: Vérification manuelle**

Ouvrir `terminal/index.html` : taper `sthol` + Entrée → décodage + blason. Cliquer `[ RE-ROLL ]` → nouveau blason même famille. Appuyer `R` (hors champ) → reroll. Retaper `sthol` + Entrée → famille reconnaissable, tirage différent.

- [ ] **Step 5: Commit**

```bash
git add terminal/index.html
git commit -m "feat(terminal): câblage UI terminal (prompt, Entrée, reroll, raccourci R)"
```

---

## Task 11: Câblage des 4 exports — `#blason-ui`

**Files:**
- Modify: `terminal/index.html` (boutons export + `#blason-ui` wiring)

**Interfaces:**
- Consumes: `currentGrid`/`currentText` (T10), `renderToCanvas` (T8), `serializeText`/`serializeAnsi`/`serializeSvg` (T6/T7), `slugify` (T0).
- Produces: câblage des 4 exports. Aucun nouveau symbole exporté.

**Note :** pas de test automatisé. Vérification manuelle.

- [ ] **Step 1: Ajouter les boutons au DOM** (dans `#blason-actions`, après le reroll)

```html
    <button id="export-png" type="button">PNG</button>
    <button id="export-copy" type="button">COPIER TXT</button>
    <button id="export-txt" type="button">.TXT</button>
    <button id="export-ans" type="button">.ANS</button>
    <button id="export-svg" type="button">.SVG</button>
```

- [ ] **Step 2: Implémenter le wiring dans `#blason-ui`**

```js
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

- [ ] **Step 3: Vérification manuelle**

Générer un blason, tester chaque bouton :
- PNG : fichier `<slug>.png` 1080×1350 téléchargé, image conforme.
- COPIER TXT : coller dans un éditeur → art braille aligné.
- .TXT / .ANS : fichiers téléchargés (`.ans` affiche les couleurs via `cat` dans un terminal truecolor).
- .SVG : fichier téléchargé, s'ouvre net dans un navigateur, texte sélectionnable.

- [ ] **Step 4: Commit**

```bash
git add terminal/index.html
git commit -m "feat(terminal): câblage des 4 exports (PNG, copie, txt, ans, svg)"
```

---

## Task 12: Intégration, acceptation, README

**Files:**
- Create: `terminal/README.md`
- Modify: `terminal/index.html` (ajustements d'intégration si besoin)

**Interfaces:** aucune nouvelle. Vérifie l'ensemble bout-à-bout.

- [ ] **Step 1: Lancer toute la suite de tests**

Run: `node --test terminal/test/core.test.js`
Expected: TOUS verts.

- [ ] **Step 2: Vérifier l'absence de `Math.random` et la forme échappée**

Run: `grep -n 'Math.random' terminal/index.html` → Expected: **aucun résultat**.
Run: `grep -n '0300' terminal/index.html` → Expected: 1 ligne (regex slugify).

- [ ] **Step 3: Checklist d'acceptation manuelle** (navigateur, `file://`)

Vérifier les 8 critères de la spec §12 :
1. Prompt terminal + curseur visibles.
2. Mot + Entrée → décodage → blason braille bleu + crosshairs + ligne SEED rouge.
3. Reroll (bouton + `R`) → variante même famille, différente.
4. Même mot re-tapé → famille reconnaissable, 2 tirages consécutifs ≠.
5. Les 4 exports fonctionnent, nommés `slugify(texte).*`.
6. `prefers-reduced-motion` → rendu instantané.
7. Tests 100% verts.
8. Un seul fichier, zéro dépendance, zéro `Math.random`.

- [ ] **Step 4: Écrire `terminal/README.md`**

```markdown
# Blason terminal (ASCII/braille)

Variante « terminal / code / ASCII art » du générateur de blasons vvd.world × odilon.wav.

## Usage

Ouvrir `terminal/index.html` dans un navigateur (aucun serveur requis). Taper un
mot ou une phrase puis **Entrée** : le blason se décode caractère par caractère.
**[ RE-ROLL ]** (ou touche **R**) génère une nouvelle variante du même mot.

## Différences avec la version racine (`../index.html`)

- **Vrai hasard** : chaque tirage est unique (entropie via `crypto.getRandomValues`).
  Le mot fixe la « famille » (symétrie, palette, cadre) ; le tirage varie le reste.
- **Rendu grille de caractères** braille + ASCII (source de vérité unique).
- **Animation de décodage** à la génération (respecte `prefers-reduced-motion`).
- Fond CRT `#0A0A0A`, accent rouge hazard `#E61919`.

## Exports

PNG 1080×1350 · copie texte brut (presse-papier) · `.txt` · `.ans` (ANSI couleur) · `.svg`.

## Architecture

- `<script id="blason-script">` — logique pure (modèle, pipeline, serializers),
  zéro DOM, testée. Pipeline : `buildGrid(text, entropy)` →
  `deriveParams` → `generateParticles` → `rasterizeToDotField` →
  `dotFieldToBraille` → `overlayStructural` → `colorize`.
- `<script id="blason-ui">` — câblage DOM (input, décodage, canvas, exports),
  non testé (vérif manuelle).

## Tests

```bash
node --test terminal/test/core.test.js
```

Zéro dépendance npm. `test/support/extract-core.js` extrait `#blason-script`
via `node:vm` et l'exécute en sandbox — teste le code shippé sans build.

## Checklist de vérif manuelle (`#blason-ui`, non testé)

- [ ] Décodage joue à la génération, rendu instantané sous reduced-motion
- [ ] Reroll (bouton + `R`) produit une variante de la même famille
- [ ] Les 4 exports téléchargent/copient, nommés `slugify(texte).*`
```

- [ ] **Step 5: Commit**

```bash
git add terminal/README.md terminal/index.html
git commit -m "docs(terminal): README + intégration + acceptation"
```

---

## Self-Review (couverture spec)

| Spec | Tâche |
|---|---|
| §2 double flux RNG, entropy crypto | T1, T5 |
| §3 Grid source de vérité | T3, T5 (contrat T0) |
| §4 pipeline (6 étapes) | T1(1)·T2(2,3)·T3(4)·T4(5)·T5(6) |
| §5 serializers purs | T6, T7 |
| §5 renderers DOM/canvas | T8, T9 |
| §6 interaction terminal + décodage | T9, T10 |
| §7 4 exports | T11 |
| §8 palette/style | T0(CSS base), T9(CSS pre), T10(CSS prompt), colorize T5 |
| §9 structure fichiers | T0, T12 |
| §10 contrats figés | T0 (constantes) + blocs Interfaces de chaque tâche |
| §11 tests | T1–T7 (pur), T12 (checklist manuelle) |
| §12 acceptation | T12 |

Aucune section spec sans tâche. Types cohérents (`Cell`/`Grid`/`Params` identiques partout). Aucun placeholder : chaque step porte son code complet.
