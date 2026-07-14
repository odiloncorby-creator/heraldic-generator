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
