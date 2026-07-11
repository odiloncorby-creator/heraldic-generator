# Blason Générateur Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Single-file HTML generator that turns any text (word or phrase) into a deterministic, symmetric, pointillist emblem on a black canvas, exportable as a 1080×1350 PNG.

**Architecture:** One `index.html` file. A `<script id="blason-script">` holds pure, dependency-free generation logic (hash → seeded PRNG → params → particles → render). A separate `<script id="blason-ui">` wires that logic to the DOM (input, canvas, export button). Pure logic is unit-tested from Node via `node:vm`, extracting and executing the `blason-script` tag's source directly out of `index.html` — no build step, no test framework dependency, no separate source-of-truth file to keep in sync.

**Tech Stack:** Vanilla JS, Canvas 2D API, Node built-in test runner (`node:test`, `node:assert`, `node:vm`) for logic tests. No npm packages, no bundler.

## Global Constraints

- Aucune dépendance externe, aucune API, aucun backend.
- Fichier unique autonome (`index.html`) — c'est le seul livrable applicatif.
- Génération procédurale pure : hash du texte → paramètres visuels, jamais `Math.random()` dans le chemin de génération.
- Composition doit lire comme un emblème symétrique (axial ou radial), pas comme du bruit.
- Fond noir, palette #6B7EC4 / #8A9AD4, aucun contour net, aucun cadre/vignette/cercle de contention.
- Export PNG, ratio 4:5, ≥ 1080×1350, rendu natif sans upscale.
- Aucun texte/label sur le visuel exporté.

---

## File Structure

- `index.html` — le livrable. Markup (input, canvas, bouton export) + deux `<script>` inline :
  - `#blason-script` : logique pure (hash, PRNG, dérivation de paramètres, génération de particules, rendu, slug). Zéro accès DOM. C'est ce bloc que les tests Node exécutent via `vm`.
  - `#blason-ui` : câblage DOM (écoute l'input, dessine sur le canvas, gère l'export). Jamais exécuté par les tests — vérifié manuellement au navigateur.
- `test/support/extract-core.js` — utilitaire de test : lit `index.html`, extrait le contenu de `#blason-script`, l'exécute dans un contexte `vm` isolé, retourne les exports.
- `test/core.test.js` — tests Node (`node:test`) sur la logique pure.

---

### Task 1: Scaffold + hash déterministe & PRNG seedé

**Files:**
- Create: `index.html`
- Create: `test/support/extract-core.js`
- Create: `test/core.test.js`

**Interfaces:**
- Produces: `hashString(text: string): number` (entier non signé 32 bits), `mulberry32(seed: number): () => number` (générateur retournant un float `[0, 1)` à chaque appel), `loadBlasonCore(): object` (utilitaire de test).

- [ ] **Step 1: Créer `index.html` avec le squelette (markup + script vide)**

```html
<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>Blason générateur — vvd.world</title>
<style>
  html, body {
    margin: 0;
    background: #000;
    color: #8A9AD4;
    font-family: monospace;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 24px;
    box-sizing: border-box;
  }
  #blason-canvas {
    max-width: 100%;
    height: auto;
    background: #000;
  }
  input, button {
    background: #111;
    color: #8A9AD4;
    border: 1px solid #6B7EC4;
    padding: 8px 12px;
    font-family: monospace;
    font-size: 14px;
  }
  input {
    width: 320px;
  }
</style>
</head>
<body>
  <input id="blason-input" type="text" placeholder="mot-clé ou phrase" autocomplete="off">
  <canvas id="blason-canvas" width="1080" height="1350"></canvas>
  <button id="blason-export">Exporter PNG</button>

  <script id="blason-script">
    if (typeof module !== 'undefined' && module.exports) {
      module.exports = {};
    }
  </script>

  <script id="blason-ui">
  </script>
</body>
</html>
```

- [ ] **Step 2: Créer l'utilitaire de test `test/support/extract-core.js`**

```js
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadBlasonCore() {
  const htmlPath = path.join(__dirname, '..', '..', 'index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');
  const match = html.match(/<script id="blason-script">([\s\S]*?)<\/script>/);
  if (!match) {
    throw new Error('blason-script tag not found in index.html');
  }
  const sandbox = { module: { exports: {} }, console };
  vm.createContext(sandbox);
  vm.runInContext(match[1], sandbox, { filename: 'index.html#blason-script' });
  return sandbox.module.exports;
}

module.exports = { loadBlasonCore };
```

- [ ] **Step 3: Écrire les tests (doivent échouer, `hashString`/`mulberry32` n'existent pas encore)**

Create `test/core.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadBlasonCore } = require('./support/extract-core');

test('hashString est déterministe pour un même texte', () => {
  const { hashString } = loadBlasonCore();
  assert.equal(hashString('sthol'), hashString('sthol'));
});

test('hashString diffère pour des textes différents', () => {
  const { hashString } = loadBlasonCore();
  assert.notEqual(hashString('sthol'), hashString('kaldrek'));
});

test('hashString accepte les phrases et retourne un entier non signé 32 bits', () => {
  const { hashString } = loadBlasonCore();
  const h = hashString('une phrase assez longue avec espaces et Majuscules');
  assert.ok(Number.isInteger(h));
  assert.ok(h >= 0 && h <= 0xFFFFFFFF);
});

test('mulberry32 produit des séquences identiques pour des seeds identiques', () => {
  const { mulberry32 } = loadBlasonCore();
  const rngA = mulberry32(12345);
  const rngB = mulberry32(12345);
  const drawsA = Array.from({ length: 5 }, () => rngA());
  const drawsB = Array.from({ length: 5 }, () => rngB());
  assert.deepEqual(drawsA, drawsB);
});

test('mulberry32 reste dans [0, 1)', () => {
  const { mulberry32 } = loadBlasonCore();
  const rng = mulberry32(7);
  for (let i = 0; i < 200; i++) {
    const v = rng();
    assert.ok(v >= 0 && v < 1, `valeur hors bornes: ${v}`);
  }
});

test('mulberry32 produit des séquences différentes pour des seeds différents', () => {
  const { mulberry32 } = loadBlasonCore();
  const rngA = mulberry32(1);
  const rngB = mulberry32(2);
  assert.notEqual(rngA(), rngB());
});
```

- [ ] **Step 4: Lancer les tests, vérifier qu'ils échouent**

Run: `node --test test/core.test.js`
Expected: FAIL — `hashString is not a function` (ou équivalent), 6 tests en échec.

- [ ] **Step 5: Implémenter `hashString` et `mulberry32` dans `index.html`**

Remplacer le contenu de `#blason-script` :

```html
  <script id="blason-script">
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

    if (typeof module !== 'undefined' && module.exports) {
      module.exports = { hashString, mulberry32 };
    }
  </script>
```

- [ ] **Step 6: Relancer les tests, vérifier qu'ils passent**

Run: `node --test test/core.test.js`
Expected: PASS — 6/6 tests réussis.

- [ ] **Step 7: Commit**

```bash
git add index.html test/support/extract-core.js test/core.test.js
git commit -m "feat: scaffold index.html + hash déterministe et PRNG seedé"
```

---

### Task 2: Dérivation des paramètres depuis le PRNG

**Files:**
- Modify: `index.html` (`#blason-script`)
- Modify: `test/core.test.js`

**Interfaces:**
- Consumes: `mulberry32(seed): () => number` (Task 1).
- Produces: `deriveParams(rng: () => number): { symmetry: {type: 'axial'|'radial', k: number}, sectorAngle: number, clusters: Array<{angle: number, distance: number, radius: number, particleCount: number}>, jitter: number }`.

- [ ] **Step 1: Écrire les tests (doivent échouer)**

Append to `test/core.test.js`:

```js
test('deriveParams est déterministe pour un même rng', () => {
  const { mulberry32, deriveParams } = loadBlasonCore();
  const paramsA = deriveParams(mulberry32(999));
  const paramsB = deriveParams(mulberry32(999));
  assert.deepEqual(paramsA, paramsB);
});

test('deriveParams choisit une symétrie valide', () => {
  const { mulberry32, deriveParams } = loadBlasonCore();
  const { symmetry } = deriveParams(mulberry32(1));
  assert.ok(symmetry.type === 'axial' || symmetry.type === 'radial');
  if (symmetry.type === 'radial') {
    assert.ok([3, 4, 6, 8].includes(symmetry.k));
  }
});

test('deriveParams génère entre 3 et 7 clusters', () => {
  const { mulberry32, deriveParams } = loadBlasonCore();
  for (let seed = 0; seed < 20; seed++) {
    const { clusters } = deriveParams(mulberry32(seed));
    assert.ok(clusters.length >= 3 && clusters.length <= 7, `seed ${seed}: ${clusters.length} clusters`);
  }
});

test('deriveParams contraint chaque cluster dans le secteur de base', () => {
  const { mulberry32, deriveParams } = loadBlasonCore();
  for (let seed = 0; seed < 20; seed++) {
    const { clusters, sectorAngle } = deriveParams(mulberry32(seed));
    for (const cluster of clusters) {
      assert.ok(cluster.angle >= 0 && cluster.angle < sectorAngle);
      assert.ok(cluster.distance > 0 && cluster.distance <= 1);
    }
  }
});
```

- [ ] **Step 2: Lancer les tests, vérifier qu'ils échouent**

Run: `node --test test/core.test.js`
Expected: FAIL — `deriveParams is not a function`.

- [ ] **Step 3: Implémenter `deriveParams`**

Insert into `#blason-script`, before the `module.exports` line:

```js
    function deriveParams(rng) {
      const symmetryOptions = [
        { type: 'axial', k: 2 },
        { type: 'radial', k: 3 },
        { type: 'radial', k: 4 },
        { type: 'radial', k: 6 },
        { type: 'radial', k: 8 },
      ];
      const symmetry = symmetryOptions[Math.floor(rng() * symmetryOptions.length)];
      const sectorAngle = symmetry.type === 'axial' ? Math.PI : (2 * Math.PI / symmetry.k);

      const clusterCount = 3 + Math.floor(rng() * 5);
      const clusters = [];
      for (let i = 0; i < clusterCount; i++) {
        clusters.push({
          angle: rng() * sectorAngle,
          distance: 0.15 + rng() * 0.75,
          radius: 0.08 + rng() * 0.12,
          particleCount: 200 + Math.floor(rng() * 400),
        });
      }

      const jitter = 0.3 + rng() * 0.5;

      return { symmetry, sectorAngle, clusters, jitter };
    }
```

Update the exports line:

```js
    if (typeof module !== 'undefined' && module.exports) {
      module.exports = { hashString, mulberry32, deriveParams };
    }
```

- [ ] **Step 4: Relancer les tests, vérifier qu'ils passent**

Run: `node --test test/core.test.js`
Expected: PASS — tous les tests réussis.

- [ ] **Step 5: Commit**

```bash
git add index.html test/core.test.js
git commit -m "feat: dérivation des paramètres visuels depuis le PRNG"
```

---

### Task 3: Génération des particules (champ de particules pur)

**Files:**
- Modify: `index.html` (`#blason-script`)
- Modify: `test/core.test.js`

**Interfaces:**
- Consumes: `deriveParams(rng)` shape from Task 2 (`symmetry`, `sectorAngle`, `clusters`, `jitter`).
- Produces: `gaussianRandom(rng: () => number): number` (Box-Muller, peut être négatif), `generateParticles(params, rng: () => number, width: number, height: number): Array<{x: number, y: number, size: number, alpha: number, colorT: number}>`.

- [ ] **Step 1: Écrire les tests (doivent échouer)**

Append to `test/core.test.js`:

```js
test('generateParticles est déterministe pour un même texte', () => {
  const { hashString, mulberry32, deriveParams, generateParticles } = loadBlasonCore();
  const run = () => {
    const rng = mulberry32(hashString('kaldrek'));
    const params = deriveParams(rng);
    return generateParticles(params, rng, 1080, 1350);
  };
  assert.deepEqual(run(), run());
});

test('generateParticles reste dans les bornes du canvas (avec marge de jitter)', () => {
  const { hashString, mulberry32, deriveParams, generateParticles } = loadBlasonCore();
  const width = 1080, height = 1350;
  const rng = mulberry32(hashString('un test de bornes'));
  const params = deriveParams(rng);
  const particles = generateParticles(params, rng, width, height);
  assert.ok(particles.length > 0);
  const margin = 400;
  for (const particle of particles) {
    assert.ok(particle.x >= -margin && particle.x <= width + margin);
    assert.ok(particle.y >= -margin && particle.y <= height + margin);
  }
});

test('generateParticles duplique les clusters selon la symétrie (comptage exact)', () => {
  const { mulberry32, generateParticles } = loadBlasonCore();
  const axialParams = {
    symmetry: { type: 'axial', k: 2 },
    sectorAngle: Math.PI,
    jitter: 0.5,
    clusters: [{ angle: 0.4, distance: 0.5, radius: 0.1, particleCount: 100 }],
  };
  const rng = mulberry32(42);
  const particles = generateParticles(axialParams, rng, 1080, 1350);
  assert.equal(particles.length, 200); // 1 cluster * 2 (mirroir) * 100 particules

  const radialParams = {
    symmetry: { type: 'radial', k: 4 },
    sectorAngle: Math.PI / 2,
    jitter: 0.5,
    clusters: [{ angle: 0.2, distance: 0.5, radius: 0.1, particleCount: 50 }],
  };
  const rng2 = mulberry32(42);
  const radialParticles = generateParticles(radialParams, rng2, 1080, 1350);
  assert.equal(radialParticles.length, 200); // 1 cluster * 4 branches * 50 particules
});
```

- [ ] **Step 2: Lancer les tests, vérifier qu'ils échouent**

Run: `node --test test/core.test.js`
Expected: FAIL — `generateParticles is not a function`.

- [ ] **Step 3: Implémenter `gaussianRandom` et `generateParticles`**

Insert into `#blason-script`, before the `module.exports` line:

```js
    function gaussianRandom(rng) {
      let u = 0, v = 0;
      while (u === 0) u = rng();
      while (v === 0) v = rng();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    }

    function generateParticles(params, rng, width, height) {
      const cx = width / 2;
      const cy = height / 2;
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
            const rotAngle = baseAngle + k * params.sectorAngle;
            centers.push([
              cx + Math.cos(rotAngle) * cluster.distance * maxRadius,
              cy + Math.sin(rotAngle) * cluster.distance * maxRadius,
            ]);
          }
        }

        for (const [centerX, centerY] of centers) {
          for (let p = 0; p < cluster.particleCount; p++) {
            const r = Math.abs(gaussianRandom(rng)) * cluster.radius * maxRadius * params.jitter;
            const theta = rng() * Math.PI * 2;
            particles.push({
              x: centerX + Math.cos(theta) * r,
              y: centerY + Math.sin(theta) * r,
              size: 1 + rng() * 2,
              alpha: 0.3 + rng() * 0.7,
              colorT: rng(),
            });
          }
        }
      }

      return particles;
    }
```

Update the exports line:

```js
    if (typeof module !== 'undefined' && module.exports) {
      module.exports = { hashString, mulberry32, deriveParams, gaussianRandom, generateParticles };
    }
```

- [ ] **Step 4: Relancer les tests, vérifier qu'ils passent**

Run: `node --test test/core.test.js`
Expected: PASS — tous les tests réussis.

- [ ] **Step 5: Commit**

```bash
git add index.html test/core.test.js
git commit -m "feat: génération du champ de particules avec symétrie axiale/radiale"
```

---

### Task 4: Couleur et rendu canvas

**Files:**
- Modify: `index.html` (`#blason-script`)
- Modify: `test/core.test.js`

**Interfaces:**
- Consumes: `particle.colorT: number` (0..1, from Task 3).
- Produces: `lerpColor(a: [number,number,number], b: [number,number,number], t: number): [number,number,number]`, `renderToCanvas(ctx: CanvasRenderingContext2D, particles: Array, width: number, height: number): void`.

- [ ] **Step 1: Écrire les tests pour `lerpColor` (doivent échouer)**

Append to `test/core.test.js`:

```js
test('lerpColor interpole entre les deux couleurs de la palette', () => {
  const { lerpColor } = loadBlasonCore();
  const a = [0x6B, 0x7E, 0xC4];
  const b = [0x8A, 0x9A, 0xD4];
  assert.deepEqual(lerpColor(a, b, 0), a);
  assert.deepEqual(lerpColor(a, b, 1), b);
  const mid = lerpColor(a, b, 0.5);
  assert.deepEqual(mid, [
    Math.round((a[0] + b[0]) / 2),
    Math.round((a[1] + b[1]) / 2),
    Math.round((a[2] + b[2]) / 2),
  ]);
});
```

Note : `renderToCanvas` a besoin d'un vrai `CanvasRenderingContext2D`, indisponible sous Node sans dépendance externe (ex. package `canvas`), ce qui violerait la contrainte "aucune dépendance". Il est donc vérifié manuellement au navigateur dans ce même task (Step 5), pas par un test automatisé.

- [ ] **Step 2: Lancer les tests, vérifier qu'ils échouent**

Run: `node --test test/core.test.js`
Expected: FAIL — `lerpColor is not a function`.

- [ ] **Step 3: Implémenter `lerpColor` et `renderToCanvas`**

Insert into `#blason-script`, before the `module.exports` line:

```js
    function lerpColor(a, b, t) {
      return [
        Math.round(a[0] + (b[0] - a[0]) * t),
        Math.round(a[1] + (b[1] - a[1]) * t),
        Math.round(a[2] + (b[2] - a[2]) * t),
      ];
    }

    function renderToCanvas(ctx, particles, width, height) {
      const PALETTE_A = [0x6B, 0x7E, 0xC4];
      const PALETTE_B = [0x8A, 0x9A, 0xD4];

      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, width, height);

      for (const particle of particles) {
        const [r, g, b] = lerpColor(PALETTE_A, PALETTE_B, particle.colorT);
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${particle.alpha})`;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }
```

Update the exports line:

```js
    if (typeof module !== 'undefined' && module.exports) {
      module.exports = { hashString, mulberry32, deriveParams, gaussianRandom, generateParticles, lerpColor, renderToCanvas };
    }
```

- [ ] **Step 4: Relancer les tests, vérifier qu'ils passent**

Run: `node --test test/core.test.js`
Expected: PASS — tous les tests réussis.

- [ ] **Step 5: Vérification manuelle au navigateur**

Temporairement, ajouter dans `#blason-ui` (sera remplacé au Task 6) :

```js
const ctx = document.getElementById('blason-canvas').getContext('2d');
const rng = mulberry32(hashString('test manuel'));
const params = deriveParams(rng);
const particles = generateParticles(params, rng, 1080, 1350);
renderToCanvas(ctx, particles, 1080, 1350);
```

Ouvrir `index.html` directement dans un navigateur (double-clic ou `open index.html`). Vérifier : fond noir plein, nuage de points bleu-gris visible, symétrique (miroir ou rotation selon le hash de "test manuel"), densité qui diminue vers la périphérie, aucun contour dur, aucun cadre.

- [ ] **Step 6: Commit**

```bash
git add index.html test/core.test.js
git commit -m "feat: interpolation de couleur et rendu canvas du champ de particules"
```

---

### Task 5: Orchestration bout-en-bout (`generateBlason`)

**Files:**
- Modify: `index.html` (`#blason-script`)
- Modify: `test/core.test.js`

**Interfaces:**
- Consumes: `hashString`, `mulberry32`, `deriveParams`, `generateParticles` (Tasks 1–3).
- Produces: `generateBlason(text: string, width: number, height: number): { seed: number, params: object, particles: Array }`.

- [ ] **Step 1: Écrire les tests (doivent échouer)**

Append to `test/core.test.js`:

```js
test('generateBlason : même texte → résultat identique (déterminisme bout-en-bout)', () => {
  const { generateBlason } = loadBlasonCore();
  const a = generateBlason('sthol', 1080, 1350);
  const b = generateBlason('sthol', 1080, 1350);
  assert.deepEqual(a, b);
});

test('generateBlason : textes différents → résultats visuellement distincts', () => {
  const { generateBlason } = loadBlasonCore();
  const examples = [
    'sthol',
    'kaldrek le renégat',
    'la lanterne qui ne s\'éteint jamais',
    'vhast',
  ];
  const results = examples.map((text) => generateBlason(text, 1080, 1350));
  const seeds = results.map((r) => r.seed);
  assert.equal(new Set(seeds).size, seeds.length, 'seeds doivent tous différer');
  const particleCounts = results.map((r) => r.particles.length);
  assert.equal(new Set(particleCounts.map((c) => JSON.stringify(c))).size > 0, true);
});

test('generateBlason : phrase longue traitée sans erreur', () => {
  const { generateBlason } = loadBlasonCore();
  const long = 'une phrase assez longue pour vérifier que le hash et la génération tiennent la route sans erreur ni troncature silencieuse';
  const result = generateBlason(long, 1080, 1350);
  assert.ok(result.particles.length > 0);
});
```

- [ ] **Step 2: Lancer les tests, vérifier qu'ils échouent**

Run: `node --test test/core.test.js`
Expected: FAIL — `generateBlason is not a function`.

- [ ] **Step 3: Implémenter `generateBlason`**

Insert into `#blason-script`, before the `module.exports` line:

```js
    function generateBlason(text, width, height) {
      const seed = hashString(text);
      const rng = mulberry32(seed);
      const params = deriveParams(rng);
      const particles = generateParticles(params, rng, width, height);
      return { seed, params, particles };
    }
```

Update the exports line:

```js
    if (typeof module !== 'undefined' && module.exports) {
      module.exports = {
        hashString, mulberry32, deriveParams, gaussianRandom,
        generateParticles, lerpColor, renderToCanvas, generateBlason,
      };
    }
```

- [ ] **Step 4: Relancer les tests, vérifier qu'ils passent**

Run: `node --test test/core.test.js`
Expected: PASS — tous les tests réussis.

- [ ] **Step 5: Commit**

```bash
git add index.html test/core.test.js
git commit -m "feat: orchestration bout-en-bout generateBlason(text, width, height)"
```

---

### Task 6: Câblage UI — saisie libre et affichage live

**Files:**
- Modify: `index.html` (`#blason-ui`)

**Interfaces:**
- Consumes: `generateBlason(text, width, height)` (Task 5), `renderToCanvas(ctx, particles, width, height)` (Task 4).

- [ ] **Step 1: Remplacer le contenu de `#blason-ui`**

```html
  <script id="blason-ui">
    const canvas = document.getElementById('blason-canvas');
    const ctx = canvas.getContext('2d');
    const input = document.getElementById('blason-input');
    const WIDTH = canvas.width;
    const HEIGHT = canvas.height;

    let debounceHandle = null;

    function renderFromText(text) {
      if (text.trim().length === 0) {
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, WIDTH, HEIGHT);
        return;
      }
      const { particles } = generateBlason(text, WIDTH, HEIGHT);
      renderToCanvas(ctx, particles, WIDTH, HEIGHT);
    }

    input.addEventListener('input', () => {
      clearTimeout(debounceHandle);
      debounceHandle = setTimeout(() => renderFromText(input.value), 150);
    });

    renderFromText(input.value);
  </script>
```

- [ ] **Step 2: Vérification manuelle au navigateur**

Ouvrir `index.html`. Taper un mot court (ex. `sthol`) : le canvas se met à jour après une brève pause. Effacer le champ : le canvas redevient noir uni. Taper une phrase longue : pas d'erreur console, rendu cohérent. Retaper exactement le même mot que précédemment : le rendu redevient visuellement identique (déterminisme).

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: câblage UI — génération live depuis un champ texte libre"
```

---

### Task 7: Export PNG 4:5

**Files:**
- Modify: `index.html` (`#blason-script`, `#blason-ui`)
- Modify: `test/core.test.js`

**Interfaces:**
- Produces: `slugify(text: string): string` (nom de fichier sûr, non vide).
- Consumes: `slugify` dans le câblage UI du bouton d'export.

- [ ] **Step 1: Écrire les tests pour `slugify` (doivent échouer)**

Append to `test/core.test.js`:

```js
test('slugify produit un nom de fichier sûr et non vide', () => {
  const { slugify } = loadBlasonCore();
  assert.equal(slugify('Sthol'), 'sthol');
  assert.equal(slugify('Kaldrek le Renégat'), 'kaldrek-le-renegat');
  assert.equal(slugify('   '), 'blason');
  assert.ok(slugify('a'.repeat(200)).length <= 40);
});
```

- [ ] **Step 2: Lancer les tests, vérifier qu'ils échouent**

Run: `node --test test/core.test.js`
Expected: FAIL — `slugify is not a function`.

- [ ] **Step 3: Implémenter `slugify`**

Insert into `#blason-script`, before the `module.exports` line:

```js
    function slugify(text) {
      const slug = text
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40);
      return slug.length > 0 ? slug : 'blason';
    }
```

Update the exports line:

```js
    if (typeof module !== 'undefined' && module.exports) {
      module.exports = {
        hashString, mulberry32, deriveParams, gaussianRandom, generateParticles,
        lerpColor, renderToCanvas, generateBlason, slugify,
      };
    }
```

- [ ] **Step 4: Relancer les tests, vérifier qu'ils passent**

Run: `node --test test/core.test.js`
Expected: PASS — tous les tests réussis.

- [ ] **Step 5: Câbler le bouton d'export dans `#blason-ui`**

Append inside `#blason-ui`, after the existing content from Task 6:

```js
    document.getElementById('blason-export').addEventListener('click', () => {
      const text = input.value;
      canvas.toBlob((blob) => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${slugify(text)}.png`;
        link.click();
        URL.revokeObjectURL(url);
      }, 'image/png');
    });
```

- [ ] **Step 6: Vérification manuelle au navigateur**

Ouvrir `index.html`, taper un mot, cliquer "Exporter PNG". Vérifier : un fichier `.png` est téléchargé, nommé d'après le mot saisi (slugifié), dimensions 1080×1350 (vérifier via l'inspecteur d'image du système ou en ouvrant le fichier), fond noir + particules visibles, aucun texte incrusté dans l'image.

- [ ] **Step 7: Commit**

```bash
git add index.html test/core.test.js
git commit -m "feat: export PNG 1080x1350 avec nom de fichier slugifié"
```

---

### Task 8: Recette finale — 4 exemples (mot court, mot long, phrase courte, phrase longue)

**Files:**
- None créé/modifié — vérification manuelle uniquement.

- [ ] **Step 1: Lancer la suite complète des tests automatisés**

Run: `node --test test/core.test.js`
Expected: PASS — tous les tests réussis (déterminisme du hash, du PRNG, des paramètres, des particules, du bout-en-bout, et du slug, tous couverts).

- [ ] **Step 2: Recette visuelle au navigateur avec 4 textes**

Ouvrir `index.html`. Saisir successivement :
- Mot court : `vhast`
- Mot long : `kaldrenoscithe`
- Phrase courte : `la lanterne froide`
- Phrase longue : `celui qui a marché sous la lune morte et n'est jamais revenu`

Pour chacun, vérifier : rendu symétrique lisible comme emblème (pas de bruit informe), fond noir plein, palette bleu-gris respectée, aucun contour dur ni cadre.

- [ ] **Step 3: Vérifier le déterminisme visuel**

Pour `vhast` : exporter le PNG, vider le champ, retaper exactement `vhast`, exporter de nouveau. Comparer les deux fichiers :

Run: `cmp vhast.png vhast\ \(1\).png` (ou noms réels des fichiers téléchargés)
Expected: aucune différence (fichiers identiques octet pour octet), confirmant que même texte → même image.

- [ ] **Step 4: Vérifier la diversité**

Comparer visuellement les 4 exports : symétries différentes (certains axiaux, d'autres radiaux selon le hash), dispositions de clusters différentes, teintes légèrement différentes. Confirmer qu'aucun des 4 ne ressemble à un simple nuage de bruit — chacun doit se lire immédiatement comme un emblème.

- [ ] **Step 5: Commit final de recette (si des ajustements ont été faits)**

```bash
git add -A
git commit -m "test: recette finale sur 4 exemples (déterminisme + diversité)"
```

Si aucun fichier n'a changé pendant la recette, ce commit est sauté (rien à committer).
