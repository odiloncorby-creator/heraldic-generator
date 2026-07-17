# Blason générateur odilon.wav

Générateur procédural de blasons/emblèmes. Texte en entrée (mot ou phrase, longueur libre) → emblème unique et déterministe : même texte → même image, toujours.

Charte odilon.wav : fond noir, pointillisme, palette bleu-gris désaturé (`#6B7EC4` / `#8A9AD4`), formes organiques érodées, aucun contour net, aucun cadre.

## Trois surfaces, un même pipeline

- **CLI Node.js**, publié sur npm sous le nom [`heraldic`](https://www.npmjs.com/package/heraldic) — même pipeline dans un vrai terminal, texte fixe la famille, chaque tirage varie :
  ```bash
  npm install -g heraldic
  ```
  Voir [`cli/README.md`](cli/README.md).
- **`terminal/index.html`** — variante terminal-only dans le navigateur, avec entropie aléatoire à chaque tirage (le texte fixe la famille, `/reroll` change la variante). Voir [`terminal/README.md`](terminal/README.md).
- **`index.html`** (racine, ce fichier) — version web canonique, un seul tirage déterministe par texte (aucune entropie mêlée : même texte → même image, toujours).

## Usage

Ouvrir `index.html` directement dans un navigateur — aucun build, aucune dépendance, aucun serveur.

1. Taper un mot ou une phrase dans le champ texte.
2. Le canvas se met à jour en direct (debounce 150ms).
3. "Exporter PNG" télécharge l'image en 1080×1350 (ratio 4:5), nommée d'après le texte saisi (slugifié).

## Comment ça marche

1. **Hash → seed** : le texte est hashé (djb2-like) en entier 32 bits.
2. **PRNG seedé** (`mulberry32`) : toute la génération consomme ce seul flux aléatoire, dans un ordre fixe. Jamais `Math.random()`.
3. **Paramètres dérivés** : type de symétrie (axiale ou radiale k∈{3,4,6,8}), nombre de clusters, position/rayon/densité de chacun, jitter.
4. **Champ de particules** : les clusters du secteur de base sont dupliqués/reflétés selon la symétrie, puis chacun disperse ses particules (bruit gaussien, densité décroissante depuis le centre). Pas de silhouette ni contour fixe — la forme émerge du nuage.
5. **Rendu** : fond noir, chaque particule interpolée entre les deux couleurs de la palette.

## Tests

```bash
node --test test/core.test.js
```

18 tests, zéro dépendance npm. La logique pure (`index.html#blason-script`) est extraite via `node:vm` par `test/support/extract-core.js` — pas de build, pas de bundler.

## Structure

- `cli/` — CLI Node.js publié sur npm sous `heraldic` (voir `cli/README.md`).
- `terminal/` — variante web terminal-only (voir `terminal/README.md`).
- `index.html` — fichier unique autonome. Deux `<script>` :
  - `#blason-script` : logique pure (hash, PRNG, génération, rendu, slugify). Testable en Node, zéro accès DOM.
  - `#blason-ui` : câblage DOM (input, canvas, bouton export). Non testé (nécessite un navigateur).
- `test/core.test.js` — suite de tests Node natif (`node:test`).
- `test/support/extract-core.js` — harnais qui extrait `#blason-script` d'`index.html` via `node:vm` pour le tester.
- `docs/superpowers/specs/2026-07-11-blason-generateur-design.md` — spec de design validée.
- `docs/superpowers/plans/2026-07-11-blason-generateur.md` — plan d'implémentation (8 tâches TDD).

## Hors scope (session actuelle)

PWA, app en ligne, déploiement, galerie, sauvegarde.
