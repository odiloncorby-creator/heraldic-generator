# Export story (PNG 9:16) et vidéo (MP4/WebM) — terminal/index.html — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter deux nouveaux formats à `/export` dans `terminal/index.html` : `png-story` (image 9:16, 1080×1920) et `mp4`/`mp4-story` (vidéo de l'animation decode existante, ratio feed ou story).

**Architecture:** Extraction de la logique pure de `renderDecode` (`#blason-script`, testable) en `computeDecodeFrame`, réutilisée à la fois par le rendu DOM existant et par une nouvelle boucle de capture vidéo canvas → `MediaRecorder` (`#blason-ui`, non testé). Le canvas caché `#blason-canvas` est redimensionné à la volée selon le format demandé.

**Tech Stack:** JavaScript vanilla (aucune dépendance), `HTMLCanvasElement.captureStream`, `MediaRecorder` (API navigateur native).

## Global Constraints

- Fichier unique autonome : tout dans `terminal/index.html`. Zéro dépendance externe, zéro build.
- Jamais `Math.random()` — tout tirage passe par `mulberry32(seed)`.
- Séparation stricte `#blason-script` (logique pure, testable via `terminal/test/`) / `#blason-ui` (DOM, non testé).
- Palette odilon.wav : fond `#0A0A0A`, pas de nouveau contour/cadre.
- `EXPORT_FORMATS` final attendu : `['png', 'png-story', 'mp4', 'mp4-story', 'txt', 'copy', 'ans', 'svg']`.
- MP4 réel uniquement si le navigateur le supporte nativement (Safari) ; fallback WebM ailleurs (Chrome/Firefox) — jamais de faux renommage d'extension.

---

### Task 1: Extraire `computeDecodeFrame` (pur, testé) et refactorer `renderDecode`

**Files:**
- Modify: `terminal/index.html:406-409` (ajout d'un nouveau bloc dans `#blason-script`)
- Modify: `terminal/index.html:451-493` (`renderDecode`, dans `#blason-ui`)
- Test: `terminal/test/core.test.js` (ajout en fin de fichier)

**Interfaces:**
- Produces: `computeDecodeFrame(grid, t, rng)` → `{ done: boolean, cells: Array<Array<{char: string, color: string}>> }`, exporté depuis `#blason-script` avec `SCRAMBLE_CHARS`, `DECODE_DURATION_MS` (500), `DECODE_STAGGER_MS` (500). Consommé par `renderDecode` (Task 1) et par `recordVideo` (Task 3).

- [ ] **Step 1: Écrire les tests qui échouent**

Ajouter à la fin de `terminal/test/core.test.js` :

```js
function makeCellGrid(rows, cols) {
  const cells = [];
  for (let r = 0; r < rows; r++) {
    const row = [];
    for (let c = 0; c < cols; c++) row.push({ char: 'X', color: '#8A9AD4' });
    cells.push(row);
  }
  return { rows, cols, cells, seed: 1 };
}

test('computeDecodeFrame : la cellule la plus excentrée reste blanche avant son cellStart', () => {
  const { computeDecodeFrame, mulberry32 } = loadBlasonCore();
  const grid = makeCellGrid(3, 3);
  const frame = computeDecodeFrame(grid, 0, mulberry32(1));
  assert.equal(frame.cells[0][0].char, ' ');
  assert.equal(frame.done, false);
});

test('computeDecodeFrame : la cellule centrale (d=0) atteint son caractère final dès t >= DECODE_DURATION_MS', () => {
  const { computeDecodeFrame, mulberry32, DECODE_DURATION_MS } = loadBlasonCore();
  const grid = makeCellGrid(4, 4);
  const frame = computeDecodeFrame(grid, DECODE_DURATION_MS, mulberry32(1));
  assert.equal(frame.cells[2][2].char, 'X');
});

test('computeDecodeFrame : les caractères en cours de révélation viennent de SCRAMBLE_CHARS', () => {
  const { computeDecodeFrame, mulberry32, SCRAMBLE_CHARS } = loadBlasonCore();
  const grid = makeCellGrid(5, 5);
  const frame = computeDecodeFrame(grid, 150, mulberry32(7));
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
  const { computeDecodeFrame, mulberry32, DECODE_STAGGER_MS, DECODE_DURATION_MS } = loadBlasonCore();
  const grid = makeCellGrid(4, 4);
  const early = computeDecodeFrame(grid, DECODE_STAGGER_MS + DECODE_DURATION_MS - 1, mulberry32(1));
  assert.equal(early.done, false);
  const late = computeDecodeFrame(grid, DECODE_STAGGER_MS + DECODE_DURATION_MS, mulberry32(1));
  assert.equal(late.done, true);
});

test('computeDecodeFrame : déterministe pour un même (grid, t, rng frais de même seed)', () => {
  const { computeDecodeFrame, mulberry32 } = loadBlasonCore();
  const grid = makeCellGrid(4, 4);
  const a = computeDecodeFrame(grid, 200, mulberry32(99));
  const b = computeDecodeFrame(grid, 200, mulberry32(99));
  assert.deepEqual(a, b);
});
```

- [ ] **Step 2: Lancer les tests, vérifier l'échec**

Run: `node --test terminal/test/core.test.js`
Expected: FAIL — `computeDecodeFrame is not a function` (ou `undefined`) sur les 5 nouveaux tests, le reste de la suite (déjà existante) passe toujours.

- [ ] **Step 3: Implémenter `computeDecodeFrame` dans `#blason-script`**

Dans `terminal/index.html`, juste après le bloc existant (lignes 406-408) :

```js
    if (typeof module !== 'undefined' && module.exports) {
      Object.assign(module.exports, { colorize, buildGrid });
    }
```

insérer, avant `</script>` (ligne 409) :

```js

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

    if (typeof module !== 'undefined' && module.exports) {
      Object.assign(module.exports, { SCRAMBLE_CHARS, DECODE_DURATION_MS, DECODE_STAGGER_MS, computeDecodeFrame });
    }
```

- [ ] **Step 4: Lancer les tests, vérifier le succès**

Run: `node --test terminal/test/core.test.js`
Expected: PASS — tous les tests, y compris les 5 nouveaux.

- [ ] **Step 5: Refactorer `renderDecode` pour consommer `computeDecodeFrame`**

Remplacer dans `terminal/index.html` (lignes 453-493), la fonction `renderDecode` actuelle :

```js
    function renderDecode(grid, pre) {
      const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduce) { decodeGeneration++; renderToDom(grid, pre); return; }

      const myGeneration = ++decodeGeneration;
      const SCRAMBLE = '⠿⣿⢿⡿⣻⠷█▓▒░/\\|+°';
      const rng = mulberry32(grid.seed >>> 0);
      const cx = grid.cols / 2, cy = grid.rows / 2;
      const maxD = Math.hypot(cx, cy);
      const DUR = 500, STAGGER = 500;
      const start = performance.now();

      function frame(now) {
        if (myGeneration !== decodeGeneration) return; // une génération plus récente a pris le relais
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

par :

```js
    function renderDecode(grid, pre) {
      const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduce) { decodeGeneration++; renderToDom(grid, pre); return; }

      const myGeneration = ++decodeGeneration;
      const rng = mulberry32(grid.seed >>> 0);
      const start = performance.now();

      function frame(now) {
        if (myGeneration !== decodeGeneration) return; // une génération plus récente a pris le relais
        const t = now - start;
        const result = computeDecodeFrame(grid, t, rng);
        let html = '';
        for (let r = 0; r < result.cells.length; r++) {
          for (let c = 0; c < result.cells[r].length; c++) {
            html += cellSpan(result.cells[r][c].char, result.cells[r][c].color);
          }
          if (r < result.cells.length - 1) html += '\n';
        }
        pre.innerHTML = html;
        if (!result.done) requestAnimationFrame(frame);
        else renderToDom(grid, pre);
      }
      requestAnimationFrame(frame);
    }
```

- [ ] **Step 6: Vérification manuelle au navigateur (non automatisable — `#blason-ui`)**

Ouvrir `terminal/index.html` dans un navigateur, taper un mot. Vérifier que l'animation de révélation (scramble → caractères finaux, vagues depuis le centre) est visuellement identique à avant le refactor — aucune régression attendue, le calcul est byte-for-byte le même, juste déplacé.

- [ ] **Step 7: Commit**

```bash
git add terminal/index.html terminal/test/core.test.js
git commit -m "refactor(terminal): extraire computeDecodeFrame en logique pure testable"
```

---

### Task 2: Export `png-story` (1080×1920)

**Files:**
- Modify: `terminal/index.html` (`#blason-ui` : constantes, `EXPORT_FORMATS`, `runExport`, aide `/help`)
- Modify: `terminal/README.md`

**Interfaces:**
- Consumes: `renderToCanvas(ctx, grid, w, h)` (déjà existant, inchangé), `slugify`, `downloadBlob` (déjà existants).
- Produces: constantes `FEED_WIDTH=1080, FEED_HEIGHT=1350, STORY_WIDTH=1080, STORY_HEIGHT=1920` réutilisées par Task 3.

- [ ] **Step 1: Ajouter les constantes de dimensions**

Dans `terminal/index.html`, juste après l'ouverture de `<script id="blason-ui">` (avant `function renderToCanvas`), ajouter :

```js
    const FEED_WIDTH = 1080, FEED_HEIGHT = 1350;
    const STORY_WIDTH = 1080, STORY_HEIGHT = 1920;
```

- [ ] **Step 2: Étendre `EXPORT_FORMATS` et `runExport`**

Remplacer la ligne (actuelle ligne 528) :

```js
    const EXPORT_FORMATS = ['png', 'txt', 'copy', 'ans', 'svg'];
```

par :

```js
    const EXPORT_FORMATS = ['png', 'png-story', 'txt', 'copy', 'ans', 'svg'];
```

Remplacer la branche `png` de `runExport` (actuelles lignes 530-534) :

```js
    function runExport(fmt) {
      if (fmt === 'png') {
        const cv = document.getElementById('blason-canvas');
        renderToCanvas(cv.getContext('2d'), currentGrid, cv.width, cv.height);
        cv.toBlob((blob) => downloadBlob(blob, `${slugify(currentText)}.png`), 'image/png');
      } else if (fmt === 'copy') {
```

par :

```js
    function runExport(fmt) {
      if (fmt === 'png' || fmt === 'png-story') {
        const story = fmt === 'png-story';
        const cv = document.getElementById('blason-canvas');
        cv.width = story ? STORY_WIDTH : FEED_WIDTH;
        cv.height = story ? STORY_HEIGHT : FEED_HEIGHT;
        renderToCanvas(cv.getContext('2d'), currentGrid, cv.width, cv.height);
        cv.toBlob((blob) => downloadBlob(blob, `${slugify(currentText)}${story ? '-story' : ''}.png`), 'image/png');
      } else if (fmt === 'copy') {
```

- [ ] **Step 3: Mettre à jour l'aide `/help`**

Dans le bloc `COMMANDS.help()`, remplacer :

```js
          '  /export <fmt>        exporte le dernier blason (fmt: png, txt, copy, ans, svg)',
```

par :

```js
          '  /export <fmt>        exporte le dernier blason (fmt: png, png-story, txt, copy, ans, svg)',
```

- [ ] **Step 4: Mettre à jour `terminal/README.md`**

Ligne 21, remplacer la liste de formats pour inclure `png-story` ; ligne 39, ajouter `/export png-story` à la liste des exemples. Vérifier le contenu exact avec `grep -n "fmt\|png-story" terminal/README.md` avant d'éditer.

- [ ] **Step 5: Vérification manuelle au navigateur**

Ouvrir `terminal/index.html`, taper un mot, exécuter `/export png-story`. Vérifier :
- le fichier téléchargé s'appelle `<slug>-story.png`
- ses dimensions sont 1080×1920 (macOS : `sips -g pixelWidth -g pixelHeight ~/Downloads/<slug>-story.png`)
- `/export png` (sans `-story`) produit toujours un fichier 1080×1350 identique à avant.

- [ ] **Step 6: Commit**

```bash
git add terminal/index.html terminal/README.md
git commit -m "feat(terminal): export png-story (1080x1920)"
```

---

### Task 3: Export vidéo `mp4` / `mp4-story`

**Files:**
- Modify: `terminal/index.html` (`#blason-ui` : état `recording`, `pickVideoMimeType`, `recordVideo`, `EXPORT_FORMATS`, `runExport`, aide `/help`)
- Modify: `terminal/README.md`

**Interfaces:**
- Consumes: `computeDecodeFrame` (Task 1), `renderToCanvas` (existant), `FEED_WIDTH/HEIGHT`, `STORY_WIDTH/HEIGHT` (Task 2), `mulberry32`, `slugify`, `downloadBlob`, `logLine`.
- Produces: rien de consommé par une tâche ultérieure — dernière tâche du plan.

- [ ] **Step 1: Ajouter l'état et les fonctions de capture vidéo**

Dans `terminal/index.html`, après les constantes ajoutées en Task 2 (`STORY_WIDTH`/`STORY_HEIGHT`), ajouter :

```js
    let recording = false;

    function pickVideoMimeType() {
      if (!window.MediaRecorder) return undefined;
      const candidates = [
        'video/mp4;codecs=avc1',
        'video/mp4',
        'video/webm;codecs=vp9',
        'video/webm',
      ];
      return candidates.find((m) => MediaRecorder.isTypeSupported(m));
    }

    function recordVideo(grid, w, h) {
      const cv = document.getElementById('blason-canvas');
      if (!cv.captureStream || !window.MediaRecorder) return Promise.reject(new Error('unsupported'));
      const mimeType = pickVideoMimeType();
      if (!mimeType) return Promise.reject(new Error('unsupported'));

      cv.width = w; cv.height = h;
      const ctx = cv.getContext('2d');
      const stream = cv.captureStream(30);
      const chunks = [];
      const recorder = new MediaRecorder(stream, { mimeType });
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
      const stopped = new Promise((resolve) => {
        recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
      });
      recorder.start();

      const rng = mulberry32(grid.seed >>> 0);
      const start = performance.now();
      return new Promise((resolve) => {
        function tick(now) {
          const t = now - start;
          const result = computeDecodeFrame(grid, t, rng);
          renderToCanvas(ctx, { cells: result.cells, rows: grid.rows, cols: grid.cols, meta: grid.meta }, w, h);
          if (!result.done) { requestAnimationFrame(tick); return; }
          setTimeout(() => {
            recorder.stop();
            stopped.then((blob) => resolve({ blob, mimeType }));
          }, 1200);
        }
        requestAnimationFrame(tick);
      });
    }
```

- [ ] **Step 2: Étendre `EXPORT_FORMATS` et `runExport`**

Remplacer la ligne (issue de Task 2) :

```js
    const EXPORT_FORMATS = ['png', 'png-story', 'txt', 'copy', 'ans', 'svg'];
```

par :

```js
    const EXPORT_FORMATS = ['png', 'png-story', 'mp4', 'mp4-story', 'txt', 'copy', 'ans', 'svg'];
```

Rendre `runExport` asynchrone et ajouter la branche vidéo. Remplacer la signature :

```js
    function runExport(fmt) {
```

par :

```js
    async function runExport(fmt) {
```

Et ajouter, juste avant la fermeture de la fonction (après la branche `svg` existante, avant le `}` final de `runExport`) :

```js
      } else if (fmt === 'mp4' || fmt === 'mp4-story') {
        const story = fmt === 'mp4-story';
        if (recording) { logLine('export vidéo en cours…', { error: true }); return; }
        recording = true;
        logLine('enregistrement vidéo…');
        try {
          const w = story ? STORY_WIDTH : FEED_WIDTH, h = story ? STORY_HEIGHT : FEED_HEIGHT;
          const { blob, mimeType } = await recordVideo(currentGrid, w, h);
          const ext = mimeType.startsWith('video/mp4') ? 'mp4' : 'webm';
          downloadBlob(blob, `${slugify(currentText)}${story ? '-story' : ''}.${ext}`);
        } catch (e) {
          logLine('vidéo non supportée sur ce navigateur', { error: true });
        } finally {
          recording = false;
        }
      }
    }
```

(la branche `svg` existante se termine par `}` avant le nouveau `else if` — vérifier l'indentation exacte en éditant, `runExport` complet doit rester un seul bloc if/else if cohérent).

- [ ] **Step 3: Mettre à jour l'aide `/help`**

Remplacer :

```js
          '  /export <fmt>        exporte le dernier blason (fmt: png, png-story, txt, copy, ans, svg)',
```

par :

```js
          '  /export <fmt>        exporte le dernier blason (fmt: png, png-story, mp4, mp4-story, txt, copy, ans, svg)',
```

- [ ] **Step 4: Mettre à jour `terminal/README.md`**

Ajouter `mp4`, `mp4-story` à la liste de formats (ligne 21) et aux exemples (lignes 39-40). Ajouter une note sur le fallback WebM (MP4 réel seulement sur Safari).

- [ ] **Step 5: Vérification manuelle au navigateur**

Dans Chrome ou Firefox :
- Ouvrir `terminal/index.html`, taper un mot, `/export mp4`. Vérifier le log `enregistrement vidéo…`, attendre ~2.2s, vérifier le téléchargement d'un fichier `<slug>.webm` non vide (`file ~/Downloads/<slug>.webm` doit indiquer `WebM`).
- `/export mp4-story` : même vérification, + dimensions vidéo 1080×1920 (si `ffprobe` disponible : `ffprobe -v error -select_streams v:0 -show_entries stream=width,height ~/Downloads/<slug>-story.webm`).
- Lancer deux `/export mp4` coup sur coup : le second doit afficher `export vidéo en cours…` en rouge (log-error) sans lancer un second enregistrement concurrent.

Si Safari est disponible : refaire `/export mp4`, vérifier que le fichier téléchargé est un vrai `.mp4` (`file` doit indiquer `ISO Media, MP4`).

- [ ] **Step 6: Commit**

```bash
git add terminal/index.html terminal/README.md
git commit -m "feat(terminal): export vidéo mp4/mp4-story (MediaRecorder, fallback WebM)"
```
