# Blason terminal (ASCII/braille)

Variante « pleine commande texte » du générateur de blasons — aucun bouton,
tout passe par le prompt.

## Usage

Ouvrir `terminal/index.html` dans un navigateur (aucun serveur requis).

- Taper un mot ou une phrase puis **Entrée** : le blason se décode caractère
  par caractère, la ligne `SEED 0x...` s'affiche sous l'illustration.
- Toute ligne commençant par `/` est une commande (voir ci-dessous). Le reste
  du texte tapé génère un blason.

## Commandes

| Commande | Effet |
|---|---|
| `<texte>` | Génère un blason à partir du texte |
| `/reroll` | Nouveau tirage du texte courant (même famille, nouvelle variante) |
| `/export <fmt>` | Exporte le dernier blason (`fmt` : `png`, `txt`, `copy`, `ans`, `svg`) |
| `/clear` | Vide l'historique affiché (le blason et le seed restent affichés) |
| `/help` | Affiche la liste des commandes |

Chaque ligne tapée (commande ou texte) s'ajoute à l'historique affiché
au-dessus du prompt, avec la réponse associée le cas échéant (erreur, aide).

## Différences avec la version racine (`../index.html`)

- **Vrai hasard** : chaque tirage est unique (entropie via `crypto.getRandomValues`).
  Le mot fixe la « famille » (symétrie, palette, cadre) ; le tirage varie le reste.
- **Rendu grille de caractères** braille + ASCII (source de vérité unique).
- **Animation de décodage** à la génération (respecte `prefers-reduced-motion`).
- **Interaction 100% commande texte**, zéro bouton, zéro `alert()`.
- Fond CRT `#0A0A0A`, accent rouge hazard `#E61919`.

## Exports

`/export png` · `/export copy` (presse-papier) · `/export txt` · `/export ans`
(ANSI couleur) · `/export svg`. Chaque export inclut la ligne `SEED 0x...` en
plus de l'illustration.

## Architecture

- `<script id="blason-script">` — logique pure (modèle, pipeline, serializers),
  zéro accès DOM, testée. Pipeline : `buildGrid(text, entropy)` →
  `deriveParams` → `generateParticles` → `rasterizeToDotField` →
  `dotFieldToBraille` → `overlayStructural` → `colorize`. Le seed n'est pas
  écrit dans la grille : `formatSeedLine(meta)` produit la ligne de statut,
  réutilisée par l'UI et par les 3 serializers texte/ANSI/SVG.
- `<script id="blason-ui">` — câblage DOM (prompt, routeur de commande,
  log scrollback, décodage, canvas, exports), non testé (vérif manuelle).

## Tests

```bash
node --test terminal/test/core.test.js
```

Zéro dépendance npm. `test/support/extract-core.js` extrait le contenu de
`<script id="blason-script">` via regex + `node:vm` et l'exécute dans un
sandbox exposant `{module: {exports: {}}}` — c'est ce qui permet de tester du
code shippé tel quel dans le navigateur sans aucun build.

`#blason-ui` (DOM) n'a pas de couverture automatisée par design — vérification
manuelle au navigateur requise pour tout changement dedans.

## Checklist de vérif manuelle (`#blason-ui`, non testé)

- [ ] Décodage joue à la génération, rendu instantané sous reduced-motion
- [ ] `/reroll` produit une variante de la même famille
- [ ] `/help` liste les 5 commandes
- [ ] `/clear` vide le log, garde l'art et le seed affichés
- [ ] `/export <fmt>` fonctionne pour les 5 formats, nommés `slugify(texte).*`,
      chacun contenant la ligne seed
- [ ] `/export` sans argument, ou avec un format invalide, affiche une erreur
      dans le log (pas de crash)
- [ ] `/reroll` ou `/export` sans blason généré affiche une erreur dans le log
- [ ] `/xyz` (commande inconnue) affiche `commande inconnue: /xyz — tape /help`
- [ ] Aucun `alert()`/`confirm()`/`prompt()` ne se déclenche dans aucun scénario
- [ ] Aucune erreur dans la console navigateur
