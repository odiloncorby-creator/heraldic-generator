# Spec — Export "clean" (motif pur, sans cadre ni ligne SEED) dans le CLI `heraldic`

**Date :** 2026-07-23
**Statut :** validé (brainstorming)
**Emplacement cible :** `cli/lib/core.js`, `cli/lib/serialize.js`, `cli/bin/heraldic.js`, `cli/test/`.
**Dépend de :** [2026-07-23-cli-story-mp4-export-design.md](2026-07-23-cli-story-mp4-export-design.md) — réutilise `svgOptsFor`/`renderFramePng`/`encodeVideo` déjà en place pour `png-story`/`mp4-story` (mécanisme letterbox `canvasH`, cf. commit `5d905f7` qui a remplacé l'ancien étirement `cellH` par un centrage sans déformation).

## 1. Contexte et intention

Le CLI `heraldic` exporte aujourd'hui `png, png-story, mp4, mp4-story, txt, ans, svg`. Chaque rendu visuel (`png`/`mp4`, feed ou story) inclut systématiquement :
- un cadre décoratif en glyphes braille (`overlayStructural`, `cli/lib/core.js:73-84`) sur les 4 bords de la grille ;
- une ligne de métadonnées `SEED 0x... REV ... UNIT/...` sous le motif (`formatSeedLine`, injectée par `serializeSvg`, `cli/lib/serialize.js:58-59`).

L'utilisateur veut une option d'export supplémentaire qui ne garde **que le motif généré** — silhouette braille pure, sans cadre ni texte — utilisable en asset (superposition, montage) sans élément décoratif superflu. Demandée explicitement pour le fixe (PNG) et l'animé (MP4, avec l'animation de révélation existante).

Scope confirmé avec l'utilisateur : **CLI uniquement** (`index.html` racine n'a déjà ni cadre ni texte sur son export PNG ; `terminal/index.html` a la même architecture cadre+seed mais n'a pas d'export vidéo — hors scope, non touché ici).

## 2. Décisions actées

| Sujet | Décision | Pourquoi |
|---|---|---|
| Comment retirer le cadre | Nouveau `buildGrid(text, entropy, opts)` avec `opts.clean` (bool, défaut `false`). Quand `true`, l'appel à `overlayStructural(cells, params)` est sauté — tout le reste du pipeline (particules → braille → colorize) est identique | Le motif "clean" est régénéré déterministiquement (même `text`+`entropy` ⇒ mêmes particules), donc les cellules de bord montrent la vraie densité de points générée à cet endroit — pas un trou vide. Approche C (filtrer `layer==='struct'` sur une grille déjà construite) a été écartée : elle remplacerait les bords par du blanc, perdant l'information réelle. |
| Comment retirer la ligne SEED | Nouveau `serializeSvg(grid, opts)` avec `opts.seedLine` (bool, défaut `true`). Quand `false` : hauteur de contenu = `grid.rows * ch` (au lieu de `(grid.rows + 1) * ch`), et le `<text>` de la ligne seed n'est pas émis | Signature rétrocompatible : tous les appels existants (`png`, `svg`, `txt`, `ans`, `automation-social-heraldic/weekly-post.js`) gardent le comportement actuel par défaut. |
| Mémoriser l'entropy | `heraldic.js` stocke `currentEntropy` (nouvelle variable module, à côté de `currentText`/`currentGrid`), assignée dans `generate()` en même temps que les autres | Nécessaire pour rejouer `buildGrid(currentText, currentEntropy, { clean: true })` à l'export avec exactement la même graine que le blason affiché à l'écran — sinon le "clean" ne correspondrait pas au blason courant. |
| Formats exposés | 4 nouveaux formats dans `EXPORT_FORMATS` : `png-clean`, `png-clean-story`, `mp4-clean`, `mp4-clean-story` | Cohérent avec le nommage existant par suffixes composables (`-story`) déjà en place. `clean` et `story` sont indépendants et combinables. |
| Parsing du format | `runExport(fmt)` : `const clean = fmt.includes('-clean')`, `const story = fmt.includes('-story')` (indépendants, pas de `endsWith` exclusif) | Permet `mp4-clean-story` sans complexifier la liste de formats en combinatoire explicite ailleurs que dans `EXPORT_FORMATS`. |
| Nommage fichier | Suffixe cumulé : `${slugify(text)}${clean ? '-clean' : ''}${story ? '-story' : ''}.${ext}` | Lisible, cohérent avec le suffixe `-story` déjà en place. |
| Grille utilisée à l'export | `const grid = clean ? buildGrid(currentText, currentEntropy, { clean: true }) : currentGrid;` | Réutilise le pipeline existant sans dupliquer de logique de génération. |
| Letterbox story + clean | `mp4-clean-story`/`png-clean-story` réutilisent `canvasH: STORY_HEIGHT` tel quel (mécanisme déjà en place, commit `5d905f7`) ; seul le contenu centré change de taille (`rows*ch` au lieu de `(rows+1)*ch` puisque pas de ligne seed) | Pas de nouveau mécanisme de centrage à écrire — `serializeSvg` centre déjà n'importe quel contenu dans `canvasW`/`canvasH` via `offsetX`/`offsetY`. |
| Dimensions résultantes | `png-clean`/`mp4-clean` : 1080×1350 (`50 rows × 27`, pas de ligne seed en plus, donc plus court que le `png`/`mp4` normal à 1377/1376). `png-clean-story`/`mp4-clean-story` : 1080×1920 (canvas story inchangé) | Conséquence directe de la suppression de la ligne réservée pour le seed — assumé, pas de padding artificiel ajouté pour compenser. |
| Arrondi H.264 | `mp4-clean` : 1080×1350 déjà pair — pas besoin de l'arrondi `-vf scale=trunc(iw/2)*2:trunc(ih/2)*2` (qui reste appliqué mais devient un no-op), contrairement à `mp4` normal (1377→1376) | Pas de changement à l'appel ffmpeg existant — l'arrondi générique couvre déjà ce cas sans branche spéciale. |

## 3. Structure

```
cli/
├── lib/core.js (MODIFIÉ)
│   └── buildGrid(text, entropy, opts)   # MODIFIÉ — opts.clean saute overlayStructural
├── lib/serialize.js (MODIFIÉ)
│   └── serializeSvg(grid, opts)         # MODIFIÉ — opts.seedLine contrôle hauteur+texte SEED
├── bin/heraldic.js (MODIFIÉ)
│   ├── EXPORT_FORMATS                   # MODIFIÉ — + png-clean, png-clean-story, mp4-clean, mp4-clean-story
│   ├── currentEntropy                   # NOUVEAU — variable module, stockée dans generate()
│   ├── svgOptsFor(grid, story, clean)   # MODIFIÉ — + seedLine: !clean
│   ├── renderFramePng(..., seedLine)    # MODIFIÉ — plombe seedLine vers serializeSvg
│   ├── encodeVideo(..., seedLine)       # MODIFIÉ — plombe seedLine vers renderFramePng
│   └── runExport(fmt)                   # MODIFIÉ — parse clean indépendamment de story, régénère la grille clean si besoin
├── test/core.test.js (MODIFIÉ)          # + test buildGrid({clean:true}) sans layer 'struct'
├── test/serialize.test.js (MODIFIÉ)     # + test serializeSvg({seedLine:false})
└── README.md (MODIFIÉ)                  # doc des 4 nouveaux formats
```

Aucune nouvelle dépendance (npm ou système).

## 4. Détail des signatures modifiées

```js
// cli/lib/core.js
function buildGrid(text, entropy, opts) {
  opts = opts || {};
  // ... pipeline inchangé jusqu'à dotFieldToBraille ...
  let cells = dotFieldToBraille(field, cols, rows);
  const meta = { seed, rev: '2.6', unit: 'UNIT/D-01' };
  if (!opts.clean) cells = overlayStructural(cells, params);
  const grid = colorize(cells, params);
  // ... inchangé ...
}
```

```js
// cli/lib/serialize.js
function serializeSvg(grid, opts) {
  opts = opts || {};
  const cw = opts.cellW || 13.5, ch = opts.cellH || 27, fs = opts.fontSize || 24;
  const seedLine = opts.seedLine !== false;
  const rowsForContent = seedLine ? grid.rows + 1 : grid.rows;
  const contentW = grid.cols * cw, contentH = rowsForContent * ch;
  const canvasW = opts.canvasW || contentW, canvasH = opts.canvasH || contentH;
  // ... offsetX/offsetY/svg/rect/g translate inchangés ...
  // boucle cellules inchangée ...
  if (seedLine) {
    const seedY = ((grid.rows + 0.8) * ch).toFixed(1);
    out += `<text x="0" y="${seedY}" fill="#8A9AD4">${escapeXml(formatSeedLine(grid.meta))}</text>`;
  }
  out += `</g></g></svg>`;
  return out;
}
```

```js
// cli/bin/heraldic.js
let currentEntropy = null;

async function generate(text, entropy) {
  currentText = text;
  currentEntropy = entropy;
  currentGrid = buildGrid(text, entropy);
  // ... inchangé ...
}

function svgOptsFor(grid, story, clean) {
  const opts = { seedLine: !clean };
  if (story) opts.canvasH = STORY_HEIGHT;
  return opts;
}

async function runExport(fmt) {
  const clean = fmt.includes('-clean');
  const story = fmt.includes('-story');
  const suffix = (clean ? '-clean' : '') + (story ? '-story' : '');
  const ext = fmt.replace('-clean', '').replace('-story', '');
  const filename = `${slugify(currentText)}${suffix}.${ext}`;
  const grid = clean ? buildGrid(currentText, currentEntropy, { clean: true }) : currentGrid;

  if (fmt === 'txt') { fs.writeFileSync(filename, serializeText(grid)); }
  else if (fmt === 'ans') { fs.writeFileSync(filename, serializeAnsi(grid)); }
  else if (fmt === 'svg') { fs.writeFileSync(filename, serializeSvg(grid)); }
  else if (ext === 'png') {
    const buffer = await serializeSvgToPngBuffer(serializeSvg(grid, svgOptsFor(grid, story, clean)));
    fs.writeFileSync(filename, buffer);
  } else if (ext === 'mp4') {
    const canvasH = story ? STORY_HEIGHT : undefined;
    await encodeVideo(grid, 13.5, 27, filename, canvasH, !clean);
  }
  console.log(`écrit: ${filename}`);
}
```

(`renderFramePng`/`encodeVideo` gagnent un dernier paramètre `seedLine`, transmis tel quel jusqu'à `serializeSvg`.)

## 5. Tests, aide, hors scope

**Tests nouveaux :**
- `cli/test/core.test.js` : `buildGrid(text, entropy, { clean: true })` → aucune cellule de la grille n'a `layer === 'struct'` (vérifier les 4 bords).
- `cli/test/serialize.test.js` : `serializeSvg(grid, { seedLine: false })` sur une grille 80×50 → `height` du SVG égale `rows*ch` (pas `(rows+1)*ch`), et le SVG ne contient pas la sous-chaîne `SEED 0x`.
- Test existant `serializeSvg: enveloppe SVG + fond + dimensions (rows+1 pour la ligne seed)` reste inchangé (comportement par défaut `seedLine` non précisé ⇒ `true`).

**Aide (`/help`) :**
```
/export <fmt>         exporte le dernier blason (fmt: png, png-story, png-clean, png-clean-story, mp4, mp4-story, mp4-clean, mp4-clean-story, txt, ans, svg)
```

**README (`cli/README.md`)** : ajouter les 4 formats à la table, avec leurs dimensions (1080×1350 clean feed, 1080×1920 clean story) et la précision "motif seul, sans cadre ni ligne SEED".

**Hors scope :**
- `index.html` (racine) et `terminal/index.html` : non touchés (scope confirmé CLI uniquement).
- `txt-clean`/`ans-clean`/`svg-clean` : non demandés (scope confirmé `png`+`mp4` uniquement) — `serializeText`/`serializeAnsi` ne sont pas modifiés pour supporter un mode sans cadre/seed.
- `automation-social-heraldic/weekly-post.js` : aucun impact, appelle `buildGrid`/`serializeSvg` sans les nouvelles options, défauts inchangés.
