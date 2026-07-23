# Spec — Export story (PNG 9:16) et vidéo (MP4) dans le CLI `heraldic`

**Date :** 2026-07-23
**Statut :** validé (brainstorming)
**Emplacement cible :** `cli/bin/heraldic.js`, `cli/lib/serialize.js` (tests), `cli/lib/png.js`, `cli/test/`.
**Dépend de :** [2026-07-23-terminal-story-mp4-export-design.md](2026-07-23-terminal-story-mp4-export-design.md) — même paire de formats (`png-story`, `mp4`, `mp4-story`), même sémantique (même grille étirée pour story, même animation decode rejouée pour la vidéo). `cli/lib/animate.js` (`computeDecodeFrame`) existe déjà et est réutilisé tel quel, sans refactor.

## 1. Contexte et intention

`cli/` (package npm `heraldic`) exporte déjà `png, txt, ans, svg` via `/export <fmt>` (`cli/bin/heraldic.js:19`). Suite au spec terminal (story + mp4 dans `terminal/index.html`), l'utilisateur veut la parité complète côté CLI : mêmes formats `png-story`, `mp4`, `mp4-story`.

Point de départ de la discussion : `automation-social-heraldic/weekly-post.js` (dépôt git séparé, imbriqué dans ce repo) importe `buildGrid`, `slugify` (`cli/lib/core.js`) et `serializeSvg` (`cli/lib/serialize.js`) pour générer ses posts hebdo Instagram. Cette spec ne touche à aucune de ces fonctions de façon non additive — l'automation n'est pas impactée (voir §6, hors scope).

## 2. Décisions actées

| Sujet | Décision | Pourquoi |
|---|---|---|
| `png-story` | Nouvel appel `serializeSvg(grid, { cellW: 13.5, cellH: 1920 / (grid.rows + 1) })` → `serializeSvgToPngBuffer`. Aucun changement de `serializeSvg` elle-même (signature et défauts inchangés : `cellW=13.5, cellH=27, fontSize=24`) | `serializeSvg` calcule déjà `w = cols*cellW`, `h = (rows+1)*cellH` (`cli/lib/serialize.js:45`) — un `cellH` différent suffit à obtenir une hauteur cible de 1920px sans toucher à la génération. Signature 100% rétrocompatible : `weekly-post.js` continue de fonctionner à l'identique. |
| Contenu vidéo | Même principe que le spec terminal : rejoue `computeDecodeFrame` (déjà extrait dans `cli/lib/animate.js`, déjà testé) à 30fps pendant 1000ms (`DECODE_STAGGER_MS + DECODE_DURATION_MS`), puis tient la frame finale 1200ms — 66 frames au total | Cohérence cross-surface (même timing partout : terminal DOM, terminal vidéo, CLI ANSI, CLI vidéo). Zéro nouvelle logique d'animation à écrire ou tester : `computeDecodeFrame` sert une 4e fois sans modification. |
| Encodage vidéo | `child_process` shell out vers le binaire `ffmpeg` système : chaque frame rendue en PNG (`serializeSvg` + `serializeSvgToPngBuffer`, déjà existants) écrite dans un dossier temporaire (`fs.mkdtempSync`), puis `ffmpeg -y -framerate 30 -i frame-%04d.png -pix_fmt yuv420p <fichier>.mp4` | Node n'a pas d'équivalent `MediaRecorder`/`captureStream`. Écrire un muxer MP4 pur JS ou ajouter un encodeur H.264 en dépendance npm est disproportionné. `ffmpeg` est préinstallé sur les runners GitHub Actions `ubuntu-latest` (donc compatible avec une future automation), et l'échec est explicite en local si absent — pas de faux positif silencieux. |
| Ratios vidéo | `mp4` (feed, `cellH=27` par défaut) et `mp4-story` (`cellH = 1920/(rows+1)`) — même logique de dimensionnement que `png`/`png-story` | Symétrie stricte avec l'image, cohérent avec le spec terminal. |
| Concurrence | Pas de nouveau flag : `runExport` capture `currentGrid`/`currentText` dans des variables locales au tout début de l'appel, avant tout `await` | C'est déjà le comportement implicite de l'export `png` actuel (`serializeSvg(currentGrid)` est évalué synchrone avant l'`await` sharp) — un `/reroll` pendant un encodage vidéo en cours ne touche pas l'objet déjà capturé. Pas besoin du flag `recording` utilisé côté terminal (qui bloquait activement) : ici capturer par valeur suffit et reste plus simple. |
| Nettoyage | Dossier temporaire supprimé (`fs.rmSync(dir, { recursive: true, force: true })`) dans un `finally`, que l'encodage réussisse ou échoue | Évite l'accumulation de fichiers PNG temporaires en cas d'erreur ffmpeg répétée. |
| Erreur ffmpeg absent/échec | Message explicite : `ffmpeg introuvable — installe-le (brew install ffmpeg / apt install ffmpeg) pour exporter en vidéo` sur `ENOENT` ; sortie non-zéro de ffmpeg → message avec le code de sortie et le `stderr` capturé | Cohérent avec le style d'erreur existant de `handleExport`/`runExport` (`échec écriture fichier: ${err.message}`) — pas de stack trace brute affichée à l'utilisateur. |
| Syntaxe de commande | Formats composés dans la liste plate existante : `png, png-story, mp4, mp4-story, txt, ans, svg` | Identique au choix fait pour `terminal/index.html` — cohérence cross-surface, pas de nouvelle signature pour `handleExport`. |

## 3. Structure

```
cli/
├── bin/heraldic.js (MODIFIÉ)
│   ├── EXPORT_FORMATS            # MODIFIÉ — ajout de 'png-story', 'mp4', 'mp4-story'
│   ├── STORY_HEIGHT = 1920        # NOUVEAU — constante
│   ├── FEED_CELL_H = 27, STORY_CELL_H(grid) = 1920 / (grid.rows + 1)   # NOUVEAU
│   ├── renderFramePng(grid, cells, cellW, cellH)   # NOUVEAU — wrapper serializeSvg+serializeSvgToPngBuffer pour une frame
│   ├── encodeVideo(grid, cellW, cellH, outPath)    # NOUVEAU — boucle de frames + spawn ffmpeg + cleanup
│   └── runExport(fmt)             # MODIFIÉ — dispatch étendu à png-story, mp4, mp4-story
├── lib/serialize.js (INCHANGÉ — signature déjà suffisante)
├── lib/png.js (INCHANGÉ — serializeSvgToPngBuffer déjà générique)
├── lib/animate.js (INCHANGÉ — computeDecodeFrame déjà générique)
└── test/serialize.test.js (MODIFIÉ — cas cellH custom / ratio story)
```

Nouvelle dépendance : **aucune dépendance npm**. Dépendance externe non-npm : binaire `ffmpeg` système, requis uniquement pour `mp4`/`mp4-story` (les autres formats n'en ont pas besoin).

## 4. Pipeline `encodeVideo`

```js
async function encodeVideo(grid, cellW, cellH, outPath) {
  const FPS = 30, DECODE_MS = 1000, HOLD_MS = 1200;
  const totalFrames = Math.ceil((DECODE_MS + HOLD_MS) / (1000 / FPS));
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'heraldic-'));
  const rng = mulberry32(grid.seed >>> 0);
  try {
    for (let i = 0; i < totalFrames; i++) {
      const t = i * (1000 / FPS);
      const frame = computeDecodeFrame(grid, t, rng);
      const svg = serializeSvg({ cols: grid.cols, rows: grid.rows, cells: frame.cells, meta: grid.meta }, { cellW, cellH });
      const png = await serializeSvgToPngBuffer(svg);
      fs.writeFileSync(path.join(tmpDir, `frame-${String(i).padStart(4, '0')}.png`), png);
    }
    await runFfmpeg(['-y', '-framerate', String(FPS), '-i', path.join(tmpDir, 'frame-%04d.png'), '-pix_fmt', 'yuv420p', outPath]);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', args);
    let stderr = '';
    proc.stderr.on('data', (d) => { stderr += d; });
    proc.on('error', (err) => {
      if (err.code === 'ENOENT') reject(new Error('ffmpeg introuvable — installe-le (brew install ffmpeg / apt install ffmpeg) pour exporter en vidéo'));
      else reject(err);
    });
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg a échoué (code ${code}): ${stderr.slice(-500)}`));
    });
  });
}
```

`t` continue de croître au-delà de 1000ms pendant le hold (jusqu'à `DECODE_MS + HOLD_MS`) : `computeDecodeFrame` ne consomme plus `rng()` une fois toutes les cellules résolues (branche scramble jamais atteinte pour `t >= cellStart + DECODE_DURATION_MS`), donc les frames de hold sont naturellement stables sans logique séparée.

## 5. Intégration `runExport`

```js
const STORY_HEIGHT = 1920;

async function runExport(fmt) {
  const grid = currentGrid, text = currentText;   // capture par valeur — voir §2 "Concurrence"
  const story = fmt.endsWith('-story');
  const cellW = 13.5, cellH = story ? STORY_HEIGHT / (grid.rows + 1) : 27;
  const suffix = story ? '-story' : '';

  if (fmt === 'txt') { fs.writeFileSync(`${slugify(text)}.txt`, serializeText(grid)); }
  else if (fmt === 'ans') { fs.writeFileSync(`${slugify(text)}.ans`, serializeAnsi(grid)); }
  else if (fmt === 'svg') { fs.writeFileSync(`${slugify(text)}.svg`, serializeSvg(grid)); }
  else if (fmt === 'png' || fmt === 'png-story') {
    const buffer = await serializeSvgToPngBuffer(serializeSvg(grid, { cellW, cellH }));
    fs.writeFileSync(`${slugify(text)}${suffix}.png`, buffer);
  } else if (fmt === 'mp4' || fmt === 'mp4-story') {
    const filename = `${slugify(text)}${suffix}.mp4`;
    await encodeVideo(grid, cellW, cellH, filename);
    console.log(`écrit: ${filename}`);
    return;
  }
  console.log(`écrit: ${slugify(text)}${suffix}.${fmt.replace('-story', '')}`);
}
```

(`svg`/`txt`/`ans` restent volontairement au format feed uniquement — pas de `svg-story`/`txt-story` demandés, cohérent avec §6 hors scope.)

## 6. Tests, aide, hors scope

**Tests** (`cli/test/serialize.test.js`) : un cas `serializeSvg(grid, { cellW: 13.5, cellH: 1920/(grid.rows+1) })` vérifie que `width`/`height` du SVG produit correspondent à la cible story (1080×1920 arrondi). Aucun autre test nouveau : `computeDecodeFrame` déjà couvert par `cli/test/animate.test.js`, `serializeSvgToPngBuffer` déjà couvert par `cli/test/png.test.js`.

`encodeVideo`/`runFfmpeg` (spawn, fichiers temporaires, binaire externe) : non testés automatiquement — vérification manuelle (`ffmpeg` présent et absent, les deux cas).

**Aide** (`/help`) :
```
/export <fmt>         exporte le dernier blason (fmt: png, png-story, mp4, mp4-story, txt, ans, svg)
```

**Hors scope :**
- `automation-social-heraldic/weekly-post.js` : aucune modification. Continue de publier en PNG feed via `serializeSvg`/`sharp`, comme aujourd'hui. Un spec dédié sera nécessaire si l'automation doit un jour publier des stories/vidéos.
- `svg-story`, `txt-story`, `ans-story` : non demandés, pas ajoutés.
- Choix de fps/durée/résolution exposé en argument CLI : valeurs fixes, comme côté terminal.
