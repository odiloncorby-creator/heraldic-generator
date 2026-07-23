# Export story (PNG 9:16) et vidéo (MP4 via ffmpeg) — CLI heraldic — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter `png-story` et `mp4`/`mp4-story` à `/export` dans le CLI npm `heraldic` (`cli/bin/heraldic.js`), en parité avec `terminal/index.html`.

**Architecture:** `png-story` réutilise `serializeSvg` (déjà générique via `opts.cellW`/`opts.cellH`) avec un `cellH` recalculé pour une hauteur cible de 1920px. La vidéo génère une séquence de frames PNG (`computeDecodeFrame`, déjà extrait et testé dans `cli/lib/animate.js` — zéro refactor requis) puis les mux via le binaire `ffmpeg` système en `child_process`.

**Tech Stack:** Node.js (`fs`, `path`, `os`, `child_process`), `sharp` (déjà une dépendance, via `cli/lib/png.js`), binaire `ffmpeg` système (non-npm, requis uniquement pour `mp4`/`mp4-story`).

## Global Constraints

- Aucune nouvelle dépendance npm.
- `automation-social-heraldic/weekly-post.js` ne doit voir aucun changement de comportement : `buildGrid`, `slugify` (`cli/lib/core.js`) et `serializeSvg(grid, opts)` (`cli/lib/serialize.js`) gardent leur signature et leurs valeurs par défaut actuelles (`cellW=13.5, cellH=27, fontSize=24`).
- `EXPORT_FORMATS` final attendu : `['png', 'png-story', 'mp4', 'mp4-story', 'txt', 'ans', 'svg']`.
- `svg`, `txt`, `ans` restent feed uniquement (pas de variante `-story`) — non demandé.
- `ffmpeg` absent → message d'erreur clair, pas de crash silencieux ni de faux fichier vide.

---

### Task 1: Export `png-story` (1080×1920)

**Files:**
- Modify: `cli/bin/heraldic.js:19` (`EXPORT_FORMATS`), `cli/bin/heraldic.js:81-94` (`runExport`), `cli/bin/heraldic.js:107-118` (aide)
- Test: `cli/test/serialize.test.js` (ajout)
- Modify: `cli/README.md`

**Interfaces:**
- Consumes: `serializeSvg(grid, opts)` (`cli/lib/serialize.js`, inchangé), `serializeSvgToPngBuffer` (`cli/lib/png.js`, inchangé).
- Produces: `STORY_HEIGHT = 1920` et `svgOptsFor(grid, story)` dans `cli/bin/heraldic.js`, réutilisés par Task 2.

- [ ] **Step 1: Écrire le test qui échoue (verrouille la formule de dimensionnement story)**

Ajouter à la fin de `cli/test/serialize.test.js` :

```js
test('serializeSvg: cellH calculé pour ratio story (1080x1920) sur une grille 80x50', () => {
  const grid = {
    cols: 80, rows: 50,
    cells: Array.from({ length: 50 }, () => Array.from({ length: 80 }, () => ({ char: ' ', color: '#8A9AD4' }))),
    meta: { seed: 1, rev: '2.6', unit: 'U' },
  };
  const cellW = 13.5, cellH = 1920 / (grid.rows + 1);
  const svg = serializeSvg(grid, { cellW, cellH });
  const width = Number(svg.match(/width="([\d.]+)"/)[1]);
  const height = Number(svg.match(/height="([\d.]+)"/)[1]);
  assert.equal(width, 1080);
  assert.ok(Math.abs(height - 1920) < 0.01);
});
```

- [ ] **Step 2: Lancer le test, vérifier le résultat**

Run: `node --test cli/test/serialize.test.js`
Expected: PASS immédiatement — `serializeSvg` est déjà générique, ce test verrouille juste la formule qu'utilisera `cli/bin/heraldic.js`. (Ce n'est pas un cycle TDD rouge/vert classique puisqu'aucune production code de `serialize.js` ne change ; le test sert de garde-fou pour Step 3.)

- [ ] **Step 3: Ajouter `STORY_HEIGHT` et `svgOptsFor` dans `cli/bin/heraldic.js`**

Après la ligne existante :

```js
const EXPORT_FORMATS = ['png', 'txt', 'ans', 'svg'];
```

remplacer par :

```js
const EXPORT_FORMATS = ['png', 'png-story', 'txt', 'ans', 'svg'];
const STORY_HEIGHT = 1920;

function svgOptsFor(grid, story) {
  return story ? { cellW: 13.5, cellH: STORY_HEIGHT / (grid.rows + 1) } : undefined;
}
```

- [ ] **Step 4: Modifier `runExport` pour gérer `png-story`**

Remplacer la fonction actuelle (lignes 81-94) :

```js
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
```

par :

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
  }
  console.log(`écrit: ${filename}`);
}
```

- [ ] **Step 5: Mettre à jour l'aide**

Remplacer :

```js
      '  /export <fmt>         exporte le dernier blason (fmt: png, txt, ans, svg)',
```

par :

```js
      '  /export <fmt>         exporte le dernier blason (fmt: png, png-story, txt, ans, svg)',
```

- [ ] **Step 6: Vérification manuelle (bin/ non couvert par les tests unitaires)**

```bash
cd cli
printf 'sthol\n/export png\n/export png-story\n/quit\n' | node bin/heraldic.js
```

Expected: deux lignes `écrit: sthol.png` puis `écrit: sthol-story.png`. Vérifier les dimensions :

```bash
sips -g pixelWidth -g pixelHeight sthol.png sthol-story.png
```

Expected: `sthol.png` ≈ 1080×1377 (comportement actuel inchangé), `sthol-story.png` = 1080×1920.

```bash
rm sthol.png sthol-story.png
```

- [ ] **Step 7: Mettre à jour `cli/README.md`**

Ligne 56, remplacer la liste de formats pour inclure `png-story`. Vérifier le contenu exact avec `grep -n "fmt:" cli/README.md` avant d'éditer.

- [ ] **Step 8: Lancer la suite complète et commit**

```bash
node --test cli/
git add cli/bin/heraldic.js cli/test/serialize.test.js cli/README.md
git commit -m "feat(cli): export png-story (1080x1920)"
```

---

### Task 2: Export vidéo `mp4` / `mp4-story` via ffmpeg

**Files:**
- Modify: `cli/bin/heraldic.js` (requires, constantes, `renderFramePng`, `runFfmpeg`, `encodeVideo`, `EXPORT_FORMATS`, `runExport`, aide)
- Modify: `cli/README.md`

**Interfaces:**
- Consumes: `computeDecodeFrame`, `DECODE_DURATION_MS`, `DECODE_STAGGER_MS` (`cli/lib/animate.js`, déjà exportés, inchangés), `serializeSvg`, `serializeSvgToPngBuffer`, `svgOptsFor`/`STORY_HEIGHT` (Task 1), `mulberry32` (`cli/lib/core.js`, déjà importé).
- Produces: rien de consommé par une tâche ultérieure — dernière tâche du plan.

- [ ] **Step 1: Étendre les imports**

Remplacer :

```js
const fs = require('fs');
const readline = require('readline');
const crypto = require('crypto');

const { buildGrid, slugify, mulberry32, formatSeedLine } = require('../lib/core');
const { serializeText, serializeAnsi, serializeSvg, cellsToAnsi } = require('../lib/serialize');
const { serializeSvgToPngBuffer } = require('../lib/png');
const { computeDecodeFrame } = require('../lib/animate');
```

par :

```js
const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');
const crypto = require('crypto');
const { spawn } = require('child_process');

const { buildGrid, slugify, mulberry32, formatSeedLine } = require('../lib/core');
const { serializeText, serializeAnsi, serializeSvg, cellsToAnsi } = require('../lib/serialize');
const { serializeSvgToPngBuffer } = require('../lib/png');
const { computeDecodeFrame, DECODE_DURATION_MS, DECODE_STAGGER_MS } = require('../lib/animate');
```

- [ ] **Step 2: Ajouter les fonctions d'encodage vidéo**

Après la déclaration de `svgOptsFor` (Task 1), ajouter :

```js
const VIDEO_FPS = 30;
const VIDEO_HOLD_MS = 1200;

async function renderFramePng(grid, cells, cellW, cellH) {
  const svg = serializeSvg({ cols: grid.cols, rows: grid.rows, cells, meta: grid.meta }, { cellW, cellH });
  return serializeSvgToPngBuffer(svg);
}

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', args);
    let stderr = '';
    proc.stderr.on('data', (d) => { stderr += d; });
    proc.on('error', (err) => {
      if (err.code === 'ENOENT') {
        reject(new Error('ffmpeg introuvable — installe-le (brew install ffmpeg / apt install ffmpeg) pour exporter en vidéo'));
      } else {
        reject(err);
      }
    });
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg a échoué (code ${code}): ${stderr.slice(-500)}`));
    });
  });
}

async function encodeVideo(grid, cellW, cellH, outPath) {
  const totalDurationMs = DECODE_STAGGER_MS + DECODE_DURATION_MS + VIDEO_HOLD_MS;
  const totalFrames = Math.ceil(totalDurationMs / (1000 / VIDEO_FPS));
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'heraldic-'));
  const rng = mulberry32(grid.seed >>> 0);
  try {
    for (let i = 0; i < totalFrames; i++) {
      const t = i * (1000 / VIDEO_FPS);
      const frame = computeDecodeFrame(grid, t, rng);
      const png = await renderFramePng(grid, frame.cells, cellW, cellH);
      fs.writeFileSync(path.join(tmpDir, `frame-${String(i).padStart(4, '0')}.png`), png);
    }
    await runFfmpeg(['-y', '-framerate', String(VIDEO_FPS), '-i', path.join(tmpDir, 'frame-%04d.png'), '-pix_fmt', 'yuv420p', outPath]);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}
```

- [ ] **Step 3: Étendre `EXPORT_FORMATS` et `runExport`**

Remplacer (issue de Task 1) :

```js
const EXPORT_FORMATS = ['png', 'png-story', 'txt', 'ans', 'svg'];
```

par :

```js
const EXPORT_FORMATS = ['png', 'png-story', 'mp4', 'mp4-story', 'txt', 'ans', 'svg'];
```

Dans `runExport`, ajouter une branche `mp4`/`mp4-story` avant le `console.log` final :

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
    const cellW = 13.5, cellH = story ? STORY_HEIGHT / (currentGrid.rows + 1) : 27;
    await encodeVideo(currentGrid, cellW, cellH, filename);
  }
  console.log(`écrit: ${filename}`);
}
```

(les erreurs `encodeVideo` — ffmpeg absent ou en échec — remontent naturellement au `.catch` déjà présent dans `handleExport`, préfixées `échec écriture fichier:` — comportement uniforme avec les autres formats, aucune plomberie d'erreur supplémentaire nécessaire.)

- [ ] **Step 4: Mettre à jour l'aide**

Remplacer :

```js
      '  /export <fmt>         exporte le dernier blason (fmt: png, png-story, txt, ans, svg)',
```

par :

```js
      '  /export <fmt>         exporte le dernier blason (fmt: png, png-story, mp4, mp4-story, txt, ans, svg)',
```

- [ ] **Step 5: Vérifier que `ffmpeg` est disponible pour le test manuel**

```bash
which ffmpeg
```

Expected: un chemin (ex. `/opt/homebrew/bin/ffmpeg` ou `/usr/bin/ffmpeg`). Si absent : `brew install ffmpeg` (macOS) avant de continuer — sinon passer directement au test du cas d'erreur (Step 7).

- [ ] **Step 6: Vérification manuelle — cas nominal**

```bash
cd cli
printf 'sthol\n/export mp4\n/export mp4-story\n/quit\n' | node bin/heraldic.js
```

Expected: `écrit: sthol.mp4` puis `écrit: sthol-story.mp4`, chaque commande prend ~2-5s (66 frames rendues + encodage).

```bash
file sthol.mp4 sthol-story.mp4
```

Expected: les deux indiquent `ISO Media, MP4 ...` (ou équivalent selon la version de `file`).

Si `ffprobe` est disponible :

```bash
ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 sthol.mp4
ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 sthol-story.mp4
```

Expected: `1080,1377` (feed, cohérent avec le `png` existant) puis `1080,1920` (story).

```bash
rm sthol.mp4 sthol-story.mp4
```

- [ ] **Step 7: Vérification manuelle — cas ffmpeg absent**

Simuler l'absence de `ffmpeg` en vidant le `PATH` du seul process Node (le binaire `node` lui-même reste résolu normalement par le shell avant l'exec) :

```bash
cd cli
printf 'sthol\n/export mp4\n/quit\n' | env PATH=/nonexistent node bin/heraldic.js
```

Expected: `échec écriture fichier: ffmpeg introuvable — installe-le (brew install ffmpeg / apt install ffmpeg) pour exporter en vidéo`, pas de crash, pas de fichier `sthol.mp4` créé, le process reste utilisable ensuite (le prompt `heraldic:~$` réapparaît).

- [ ] **Step 8: Mettre à jour `cli/README.md`**

Ajouter `mp4`, `mp4-story` à la liste de formats, avec une note sur la dépendance à `ffmpeg` (binaire système, pas une dépendance npm).

- [ ] **Step 9: Lancer la suite complète et commit**

```bash
node --test cli/
git add cli/bin/heraldic.js cli/README.md
git commit -m "feat(cli): export vidéo mp4/mp4-story via ffmpeg système"
```
