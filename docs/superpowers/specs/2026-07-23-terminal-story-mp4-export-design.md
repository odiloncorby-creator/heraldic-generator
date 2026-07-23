# Spec — Export story (PNG 9:16) et vidéo (MP4/WebM) dans le terminal

**Date :** 2026-07-23
**Statut :** validé (brainstorming)
**Emplacement cible :** `terminal/index.html`, `test/core.test.js`.
**Dépend de :** [2026-07-16-cli-decode-animation-design.md](2026-07-16-cli-decode-animation-design.md) — réutilise l'algorithme `computeDecodeFrame` déjà porté et testé dans `cli/lib/animate.js`.

## 1. Contexte et intention

`terminal/index.html` exporte aujourd'hui 5 formats via `/export <fmt>` (`png, txt, copy, ans, svg`), tous au ratio 4:5 (1080×1350, canvas caché `#blason-canvas`). L'utilisateur veut deux nouvelles sorties visuelles, pensées pour Instagram Stories :

1. **`png-story`** — même blason, ratio 9:16 (1080×1920).
2. **`mp4` / `mp4-story`** — vidéo de l'animation de révélation (`renderDecode`) déjà utilisée à l'écran, dans les deux ratios.

Ni `index.html` (racine) ni le CLI ne sont concernés — uniquement `terminal/index.html`.

## 2. Décisions actées

| Sujet | Décision | Pourquoi |
|---|---|---|
| Grille story | Même grille 80×50 que le format feed, canvas de sortie 1080×1920 (au lieu de 1080×1350) | `renderToCanvas` calcule déjà `cw = w/cols`, `ch = h/(rows+1)` — s'adapte sans changement de logique. Pas de second seed/rendu à maintenir. |
| Contenu vidéo | Rejoue l'animation `renderDecode` existante (scramble → caractère final, vagues depuis le centre, ~1s), capturée frame par frame sur le canvas caché, puis tient l'image finale 1200ms avant d'arrêter l'enregistrement | Réutilise une UX déjà validée plutôt que d'inventer une nouvelle animation. Le hold final évite une vidéo qui coupe brutalement sur la dernière frame animée. |
| Format conteneur vidéo | Détection du meilleur `mimeType` supporté par le navigateur via `MediaRecorder.isTypeSupported`, ordre de préférence : `video/mp4;codecs=avc1` → `video/mp4` → `video/webm;codecs=vp9` → `video/webm`. Extension du fichier dérivée du mimeType réellement choisi | Le projet interdit toute dépendance externe (donc pas de ffmpeg.wasm pour muxer du vrai MP4 partout). `MediaRecorder` ne produit du MP4 nativement que sur Safari ; sur Chrome/Firefox il produit du WebM. Mentir sur l'extension serait pire qu'un fallback honnête. |
| Ratios vidéo | Deux formats distincts, `mp4` (1080×1350) et `mp4-story` (1080×1920) — même logique que `png`/`png-story` | Symétrie avec l'export image, cohérent avec la demande initiale (story pour les deux types d'export). |
| Syntaxe de commande | Formats composés dans la liste plate existante : `png, png-story, mp4, mp4-story, txt, copy, ans, svg` | Cohérent avec `EXPORT_FORMATS` actuel (un seul argument, une seule liste). Pas de changement de signature de `handleExport`. |
| Refactor `renderDecode` | Extraction de la logique pure (calcul par cellule : scramble/blanc/caractère final selon `t`, `d`, `rng`) en `computeDecodeFrame(grid, t, rng)` dans `#blason-script`, port fidèle de `cli/lib/animate.js` (mêmes constantes `SCRAMBLE_CHARS`, `DECODE_DURATION_MS`, `DECODE_STAGGER_MS`) | `renderDecode` (DOM) mélangeait actuellement calcul pur et écriture DOM. La capture vidéo a besoin du même calcul par frame sans toucher au DOM. Évite de dupliquer l'algorithme une troisième fois (HTML DOM + HTML canvas + CLI ANSI le font déjà chacun à sa façon ailleurs dans le projet) et respecte la séparation `#blason-script`/`#blason-ui` du projet. |
| Réutilisation du rendu canvas | Chaque frame vidéo appelle `renderToCanvas(ctx, {cells, rows: grid.rows, cols: grid.cols, meta: grid.meta}, w, h)` — la fonction existante, inchangée | `renderToCanvas` ne dépend que de la forme `{cells, rows, cols, meta}` (déjà le cas pour `grid`), donc un objet de frame intermédiaire suffit sans nouvelle fonction de rendu. |
| Concurrence | Flag `recording` (booléen) : bloque toute nouvelle génération ou tout nouvel `/export` tant qu'un enregistrement vidéo est en cours, avec `logLine('export vidéo en cours…', { error: true })` | Un `/reroll` ou un nouveau texte pendant l'enregistrement changerait `currentGrid` sous les pieds de la boucle d'enregistrement — état incohérent, vidéo corrompue. Plus simple qu'un jeton de génération ici puisqu'on veut bloquer plutôt qu'annuler silencieusement. |
| Fallback navigateur | Si `canvas.captureStream` ou `window.MediaRecorder` sont absents → `logLine` erreur `vidéo non supportée sur ce navigateur`, aucun crash | Détection au moment de l'export, pas au chargement — cohérent avec le style existant (`requireGrid()`). |

## 3. Structure

```
terminal/index.html
├── #blason-script (MODIFIÉ)
│   └── computeDecodeFrame(grid, t, rng)   # NOUVEAU — extrait de renderDecode, pur, testable
│       SCRAMBLE_CHARS, DECODE_DURATION_MS, DECODE_STAGGER_MS  # NOUVEAU — exportés
├── #blason-ui (MODIFIÉ)
│   ├── renderDecode(grid, pre)             # MODIFIÉ — consomme computeDecodeFrame au lieu de dupliquer le calcul
│   ├── STORY_WIDTH, STORY_HEIGHT, FEED_WIDTH, FEED_HEIGHT   # NOUVEAU — constantes 1080×1920 / 1080×1350
│   ├── recordVideo(grid, w, h)              # NOUVEAU — pipeline captureStream/MediaRecorder, retourne une Promise<Blob>
│   ├── pickVideoMimeType()                  # NOUVEAU — détection MediaRecorder.isTypeSupported, ordre de préférence
│   ├── runExport(fmt)                       # MODIFIÉ — dispatch étendu à png-story, mp4, mp4-story
│   └── EXPORT_FORMATS                       # MODIFIÉ — ajout de 'png-story', 'mp4', 'mp4-story'
test/core.test.js (MODIFIÉ)
└── tests computeDecodeFrame                # NOUVEAU — portés depuis cli/test/animate.test.js
```

Zéro nouvelle dépendance npm, zéro asset externe.

## 4. Algorithme `computeDecodeFrame` (extraction, pas de changement de comportement)

Identique à `cli/lib/animate.js` (déjà validé et testé) :

- Entrées : `grid` (`.rows`, `.cols`, `.cells`, chaque cellule `{char, color}`), `t` (ms écoulées), `rng` (`mulberry32(grid.seed >>> 0)`).
- `cx = grid.cols / 2`, `cy = grid.rows / 2`, `maxD = Math.hypot(cx, cy)`.
- `DECODE_DURATION_MS = 500`, `DECODE_STAGGER_MS = 500`.
- Par cellule `(r, c)` : `d = Math.hypot(c - cx, r - cy) / maxD`, `cellStart = d * DECODE_STAGGER_MS`.
  - `t >= cellStart + DECODE_DURATION_MS` → `{char: cell.char, color: cell.color}` (final).
  - `t < cellStart` → `{char: cell.char === '⠀' ? '⠀' : ' ', color: cell.color}` (blanc).
  - sinon → `{char: SCRAMBLE_CHARS[rng-index], color: cell.color}` (scramble).
- Retour : `{ done, cells }`, `done = true` quand toutes les cellules ont atteint leur caractère final (dernière à `t = 1000ms`).
- `SCRAMBLE_CHARS = '⠿⣿⢿⡿⣻⠷█▓▒░/\\|+°'`.

`renderDecode` (DOM) est réécrit pour appeler `computeDecodeFrame(grid, t, rng)` à chaque frame puis convertir `cells` en HTML via `cellSpan`, au lieu de recalculer inline — comportement visuel identique, zéro régression attendue.

## 5. Pipeline d'enregistrement vidéo (`recordVideo`, I/O, non testé)

```
async function recordVideo(grid, w, h) {
  if (!canvas.captureStream || !window.MediaRecorder) throw new Error('unsupported');
  const mimeType = pickVideoMimeType();      // undefined si rien de trouvé → throw aussi
  canvas.width = w; canvas.height = h;
  const stream = canvas.getContext('2d') && canvas.captureStream(30);
  const chunks = [];
  const recorder = new MediaRecorder(stream, { mimeType });
  recorder.ondataavailable = (e) => chunks.push(e.data);
  const done = new Promise((resolve) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
  });
  recorder.start();

  const rng = mulberry32(grid.seed >>> 0);
  const start = performance.now();
  await new Promise((resolve) => {
    function tick(now) {
      const t = now - start;
      const frame = computeDecodeFrame(grid, t, rng);
      renderToCanvas(ctx, { cells: frame.cells, rows: grid.rows, cols: grid.cols, meta: grid.meta }, w, h);
      if (!frame.done) { requestAnimationFrame(tick); return; }
      setTimeout(resolve, 1200);   // tient l'image finale 1200ms
    }
    requestAnimationFrame(tick);
  });

  recorder.stop();
  return { blob: await done, mimeType };
}
```

`pickVideoMimeType()` :

```
function pickVideoMimeType() {
  const candidates = [
    'video/mp4;codecs=avc1',
    'video/mp4',
    'video/webm;codecs=vp9',
    'video/webm',
  ];
  return candidates.find((m) => MediaRecorder.isTypeSupported(m));
}
```

Extension du fichier téléchargé : `.mp4` si le mimeType choisi commence par `video/mp4`, sinon `.webm`.

## 6. Intégration `runExport` / `EXPORT_FORMATS`

```
const EXPORT_FORMATS = ['png', 'png-story', 'mp4', 'mp4-story', 'txt', 'copy', 'ans', 'svg'];

async function runExport(fmt) {
  if (fmt === 'png' || fmt === 'png-story') {
    const story = fmt === 'png-story';
    const w = story ? STORY_WIDTH : FEED_WIDTH, h = story ? STORY_HEIGHT : FEED_HEIGHT;
    canvas.width = w; canvas.height = h;
    renderToCanvas(canvas.getContext('2d'), currentGrid, w, h);
    canvas.toBlob((blob) => downloadBlob(blob, `${slugify(currentText)}${story ? '-story' : ''}.png`), 'image/png');
    return;
  }
  if (fmt === 'mp4' || fmt === 'mp4-story') {
    const story = fmt === 'mp4-story';
    const w = story ? STORY_WIDTH : FEED_WIDTH, h = story ? STORY_HEIGHT : FEED_HEIGHT;
    if (recording) { logLine('export vidéo en cours…', { error: true }); return; }
    recording = true;
    logLine('enregistrement vidéo…');
    try {
      const { blob, mimeType } = await recordVideo(currentGrid, w, h);
      const ext = mimeType.startsWith('video/mp4') ? 'mp4' : 'webm';
      downloadBlob(blob, `${slugify(currentText)}${story ? '-story' : ''}.${ext}`);
    } catch (e) {
      logLine('vidéo non supportée sur ce navigateur', { error: true });
    } finally {
      recording = false;
    }
    return;
  }
  // ... branches existantes txt/copy/ans/svg inchangées
}
```

`handleExport` et `handleLine` restent synchrones dans leur signature ; `runExport` devient `async` mais l'appelant n'attend pas la promesse (comportement fire-and-forget déjà implicite pour les téléchargements existants).

## 7. Tests

Ajoutés dans `test/core.test.js` (extraits via `test/support/extract-core.js`, comme le reste) :

- `computeDecodeFrame` retourne les caractères finaux quand `t` dépasse la durée totale pour toutes les cellules (`done === true`).
- `computeDecodeFrame` retourne des espaces (ou `⠀` préservé) pour les cellules dont `cellStart > t`.
- `computeDecodeFrame` retourne un caractère de `SCRAMBLE_CHARS` pour les cellules en cours de transition, `done === false`.
- Déterminisme : même `(grid, t, rng)` → même résultat (deux appels avec deux instances `mulberry32(seed)` fraîches donnent une séquence de scramble identique).

Portage direct des cas déjà couverts par `cli/test/animate.test.js`, adaptés à l'extraction via `#blason-script`.

`recordVideo`, `pickVideoMimeType`, et le dispatch `runExport` restent dans `#blason-ui` — non testés automatiquement, vérification manuelle au navigateur requise (Chrome/Firefox → WebM, Safari → MP4, navigateur sans `MediaRecorder` → message d'erreur).

## 8. Aide utilisateur

`/help` mis à jour :

```
/export <fmt>        exporte le dernier blason (fmt: png, png-story, mp4, mp4-story, txt, copy, ans, svg)
```

## 9. Hors scope

- `index.html` (racine) et le CLI (`cli/`) ne sont pas modifiés par cette spec.
- Aucune nouvelle animation : la vidéo rejoue exactement `renderDecode`, rien de plus.
- Pas de choix de durée/fps/résolution exposé à l'utilisateur — valeurs fixes (30fps, hold 1200ms).
