# Spec — Blason Terminal (variante ASCII/braille)

**Date :** 2026-07-12
**Statut :** validé (brainstorming)
**Emplacement cible :** sous-dossier `terminal/` (nouveau, isolé du `index.html` racine)
**Branche :** `claude/industrial-brutalist-ui-0d87fe` (worktree dédié, `main` intact)

## 1. Contexte et intention

Variante « terminal / code / ASCII art » du générateur de blasons existant
([index.html](../../../index.html) racine). Le générateur actuel produit un
nuage de particules déterministe rendu sur canvas. Cette variante réinterprète
le même univers (vvd.world × odilon.wav) en **art ASCII + braille animé façon
terminal tactique**, avec du **vrai hasard** par tirage.

Elle applique l'esthétique du skill `industrial-brutalist-ui` (archétype
*Tactical Telemetry & CRT Terminal*) : fond CRT sombre, typographie monospace,
cadrage ASCII, accent rouge hazard, grille rigide 90°.

### Ce qui change par rapport au `main` (déviations assumées)

| Règle `main` | Variante terminal | Justification |
|---|---|---|
| Déterminisme strict (même texte → même image) | **Levé** : vrai hasard par tirage | Demande explicite utilisateur. Le texte reste porteur de « famille ». |
| Jamais `Math.random()` / entropie | **Entropie via `crypto.getRandomValues`** | Vrai aléatoire requis. `crypto`, pas `Math.random`. |
| Rendu canvas (particules) | Rendu **grille de caractères** (source de vérité), déclinée canvas/DOM/SVG/txt | Sortie « code » native (copiable, sélectionnable). |
| Fond `#000` pur | Fond `#0A0A0A` (CRT éteint) | Directive skill industrial-brutalist. |

Toutes les autres contraintes du projet restent **non négociables** :
fichier unique autonome, zéro dépendance/build/backend/API, séparation stricte
`#blason-script` (pur, testé) vs `#blason-ui` (DOM, non testé), palette
odilon.wav pour les glyphes, aucun texte/label parasite sur le visuel exporté
(hors chrome terminal volontaire type SEED/REV qui fait partie du design).

## 2. Modèle de génération

Deux flux PRNG `mulberry32` (porté du `main`) séparés :

- **`familyRng = mulberry32(hashString(texte))`** — dérive les paramètres
  **macro stables** (famille de symétrie, biais de palette, bande de densité,
  style de cadre). Même mot → même famille visuelle.
- **`variantRng = mulberry32((hashString(texte) ^ entropy) >>> 0)`** — dérive
  les paramètres **micro variables** (positions de clusters, jitter, seed
  d'ordre de décodage). Change à chaque tirage.

`entropy` = `Uint32` tiré via `crypto.getRandomValues(new Uint32Array(1))[0]`
à chaque génération. `hashString` réutilisé tel quel du `main` (djb2).

**Effet :** même mot = blasons « cousins » (même famille), chaque tirage unique.
Le `seed` complet (`hashString ^ entropy`) est affiché dans le chrome terminal
(`SEED 0x…`) et sert de nom logique du tirage.

## 3. Source de vérité : la grille de caractères (`Grid`)

Tout le rendu dérive d'une **grille 2D** unique. Cela garantit la cohérence
entre les 4 exports et l'affichage.

- Dimensions : `COLS × ROWS` ≈ **80 × 50** (ratio ~4:5 aligné sur le format
  export 1080×1350, en tenant compte du ratio d'aspect d'une cellule monospace
  ≈ 0.5). Valeurs exactes figées en T0.
- Sous-résolution braille : chaque cellule braille encode 2×4 points →
  champ de points `160 × 200`.
- Chaque cellule : `{ char: string, intensity: number, layer: 'braille' | 'struct' }`
  où `intensity ∈ [0,1]` (pilote la couleur), `layer` distingue le corps braille
  organique de la couche structurelle ASCII (crosshairs, cadre, data).

## 4. Pipeline de rendu (hybride « C »)

Fonctions **pures** (zéro DOM), enchaînées :

1. `deriveParams(familyRng, variantRng)` → `Params` (symétrie, clusters, cadre,
   palette). Porté/adapté du `deriveParams` actuel, mais alimenté par les deux
   flux (macro depuis familyRng, micro depuis variantRng).
2. `generateParticles(params, variantRng, dotW, dotH)` → liste de particules
   dans le champ de points `160×200`. Porté du `main` (clusters, symétrie
   axiale/radiale, `gaussianRandom`).
3. `rasterizeToDotField(particles, dotW, dotH)` → `Float array/2D` densité
   `160×200`.
4. `dotFieldToBraille(dotField, cols, rows)` → grille braille `80×50` :
   chaque cellule = 1 des 256 glyphes braille (`0x2800 + bits`) selon les 8
   sous-points, + `intensity` = densité moyenne normalisée de la cellule.
5. `overlayStructural(grid, params)` → applique la couche ASCII **par-dessus** :
   axe de symétrie, crosshairs `+` aux intersections de grille, brackets/cadre
   (`┌ ┐ └ ┘ │ ─` ou `[ ]`), ligne de données hazard (`SEED 0x…  REV 2.6
   UNIT/D-01`). Marque ces cellules `layer:'struct'`.
6. `colorize(grid, params)` → assigne la couleur finale : glyphes braille en
   dégradé bleu `#6B7EC4 → #8A9AD4` selon `intensity` ; cellules `struct` de
   données vitales en rouge hazard `#E61919` (accent unique, parcimonieux).

Sortie = `Grid` finale, consommée par les renderers.

## 5. Renderers (consommateurs de `Grid`)

**Purs (testables, dans `#blason-script`) :**
- `serializeText(grid)` → string ASCII/braille brut (join lignes). Base copier
  + `.txt`.
- `serializeAnsi(grid)` → string avec codes couleur ANSI. Base `.ans`.
- `serializeSvg(grid, opts)` → string SVG (`<text>` par ligne/cellule,
  sélectionnable).

**DOM/canvas (non testés, dans `#blason-ui`, vérif manuelle) :**
- `renderToDom(grid, container)` — affichage `<pre>` avec spans colorés.
- `renderDecode(grid, container, opts)` — animation de décodage (voir §6).
- `renderToCanvas(ctx, grid, w, h)` — `fillText` monospace pour PNG 1080×1350.

## 6. Interaction terminal

- Input stylé prompt : `heraldic@vvd:~$ ` + zone de saisie + curseur clignotant
  (`▊`). Texte libre.
- **Entrée** → nouvelle génération (nouvelle `entropy`) → animation décodage.
- **Animation décodage :** chaque cellule affiche d'abord des glyphes aléatoires
  qui « scramblent », puis se fige sur le caractère final. Durée ~800ms,
  staggered (ordre radial depuis le centre ou balayage scanline, piloté par un
  seed dérivé de `variantRng` pour varier). Une fois fixé → statique.
- **Reroll :** bouton `[ RE-ROLL ]` **et** raccourci clavier (`R`) → nouveau
  tirage, **même texte donc même famille**, nouvelle entropy.
- **`prefers-reduced-motion: reduce`** → pas de scramble, rendu final instantané.

## 7. Exports (4 formats)

Tous basés sur la même `Grid`, nom de fichier via `slugify(texte)` (porté du
`main`, avec la regex diacritiques en **forme échappée** `̀-ͯ` —
piège connu du projet, cf CLAUDE.md).

1. **PNG** 1080×1350 — `renderToCanvas` → `canvas.toBlob` → download. Fond
   `#0A0A0A`.
2. **Copier texte brut** — `serializeText` → `navigator.clipboard.writeText`.
3. **Fichier `.txt` / `.ans`** — `serializeText` / `serializeAnsi` → Blob
   download.
4. **SVG** — `serializeSvg` → Blob download.

## 8. Palette & style

- Fond : `#0A0A0A`.
- Glyphes braille : dégradé `#6B7EC4 → #8A9AD4` par intensité.
- Accent hazard : `#E61919`, réservé aux données vitales / crosshairs, usage
  parcimonieux (seul accent).
- Géométrie : zéro `border-radius`, coins 90°, monospace exclusif.
- Optionnel léger : scanlines CRT (`repeating-linear-gradient`) en fond,
  désactivées sous `prefers-reduced-motion`.

## 9. Structure de fichiers

```
terminal/
  index.html                    # fichier unique autonome (CSS + JS inline)
  README.md                     # usage + architecture
  test/
    core.test.js                # node --test, couvre #blason-script (pur)
    support/extract-core.js     # extraction vm du <script id="blason-script">
```

- `terminal/index.html` respecte la contrainte **fichier unique autonome**.
- `test/support/extract-core.js` réutilise le pattern regex + `node:vm` du
  projet (cf `test/support/extract-core.js` racine) pour tester le code shippé
  sans build.
- **Séparation stricte** maintenue : toute la logique pure (modèle, pipeline,
  serializers texte/ANSI/SVG) dans `<script id="blason-script">` (zéro DOM,
  testée) ; tout le câblage (input, événements, décodage, canvas, exports) dans
  `<script id="blason-ui">` (DOM, vérif manuelle navigateur).

## 10. Contrats d'interface (figés en T0, source anti-collision)

Signatures gelées avant tout développement parallèle. Les agents codent contre
ces signatures (+ stubs) sans se coordonner.

```
// --- constantes ---
COLS, ROWS, DOT_W (=COLS*2), DOT_H (=ROWS*4)   // valeurs exactes fixées en T0

// --- modèle ---
hashString(text) -> uint32                      // porté du main
mulberry32(seed) -> () => number                // porté du main
makeEntropy() -> uint32                          // crypto.getRandomValues
deriveParams(familyRng, variantRng) -> Params

// --- pipeline (pur) ---
generateParticles(params, rng, dotW, dotH) -> Particle[]
rasterizeToDotField(particles, dotW, dotH) -> Float[] (dotW*dotH)
dotFieldToBraille(dotField, cols, rows) -> Cell[][]      // {char,intensity,layer:'braille'}
overlayStructural(grid, params) -> Cell[][]              // mute/retourne grid
colorize(grid, params) -> Grid                          // couleur finale
buildGrid(text, entropy) -> Grid                        // orchestrateur pur complet

// --- serializers (purs) ---
serializeText(grid) -> string
serializeAnsi(grid) -> string
serializeSvg(grid, opts) -> string

// --- utilitaires ---
slugify(text) -> string                          // porté du main (regex échappée)

// --- types ---
Params = { symmetry:{type,k}, sectorAngle, clusters:[...], frame, paletteBias, ... }
Cell   = { char:string, intensity:number, layer:'braille'|'struct', color?:string }
Grid   = { cols, rows, cells:Cell[][], seed:uint32, meta:{rev,unit,...} }
```

Les shapes exactes (champs de `Params`, `frame`, `meta`) sont détaillées et
figées dans le plan (T0). Toute évolution de contrat après T0 = re-synchro
explicite, pas de dérive silencieuse.

## 11. Tests

- `node --test terminal/test/core.test.js` — couvre **toute** la logique pure :
  déterminisme du couple (texte, entropy) → même Grid ; variété (2 entropies
  différentes → Grids différentes, même famille) ; correction braille
  (mapping bits → glyphe) ; serializers (texte/ANSI/SVG bien formés) ;
  slugify (piège diacritiques). Zéro dépendance npm.
- `#blason-ui` : non testé par design → checklist de vérif manuelle navigateur
  dans le README (décodage, reroll, 4 exports, reduced-motion).

## 12. Critères d'acceptation

1. Charger `terminal/index.html` (file://) : prompt terminal visible, curseur
   clignotant.
2. Taper un mot + Entrée : animation décodage → blason ASCII/braille bleu sur
   fond CRT, avec crosshairs + ligne data hazard rouge.
3. Reroll (bouton ou `R`) : nouveau blason **de la même famille**, différent.
4. Même mot re-tapé : famille reconnaissable, tirage différent (vrai hasard
   vérifié : 2 générations consécutives ≠).
5. Les 4 exports fonctionnent : PNG téléchargé, texte copié, `.txt`/`.ans`
   téléchargés, SVG téléchargé — tous nommés `slugify(texte).*`.
6. `prefers-reduced-motion` : pas de scramble, rendu instantané.
7. `node --test terminal/test/core.test.js` : 100% vert.
8. `terminal/index.html` : un seul fichier, zéro dépendance externe, zéro
   `Math.random()` (entropie via `crypto` uniquement).

## 13. Hors scope (explicite)

Galerie, sauvegarde, PWA, partage réseau, son. Pas de modification de
`index.html` racine ni du `main`.
