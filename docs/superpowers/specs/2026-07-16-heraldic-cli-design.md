# Spec — CLI Node.js `heraldic` (port du terminal navigateur)

**Date :** 2026-07-16
**Statut :** validé (brainstorming)
**Emplacement cible :** nouveau dossier `cli/` à la racine du repo.
**Dépend de :** [2026-07-14-terminal-full-cli-ux-design.md](2026-07-14-terminal-full-cli-ux-design.md) — ce spec réalise la « direction future (hors scope) » explicitement annoncée dans ce document : un vrai CLI natif Node, avec la même grammaire de commande (`/help`, `/reroll`, `/export <fmt>`, `/clear`) transposée telle quelle.

## 1. Contexte et intention

`terminal/index.html` simule un terminal dans le navigateur. L'utilisateur est satisfait de cette version et veut maintenant un **vrai CLI Node.js**, exécutable dans un vrai terminal, publié sur npm sous le nom `heraldic`.

Le spec terminal notait déjà : « le cœur pur (`buildGrid`, serializers) est déjà portable par construction » et « seule la grammaire de commande est pensée pour se transposer telle quelle ». Ce spec réalise cette transposition.

## 2. Décisions actées

| Sujet | Décision | Pourquoi |
|---|---|---|
| Mode d'interaction | REPL interactif (comme le terminal navigateur) | Cohérence directe avec l'UX déjà validée par l'utilisateur |
| Formats d'export | `txt`, `ans`, `svg`, `png` | Parité complète avec le navigateur |
| Génération PNG | SVG → PNG via dépendance `sharp` | `serializeSvg` est déjà pur et produit exactement le même rendu que `renderToCanvas` (grille de glyphes rasterisée, même police/couleurs) — pas de réimplémentation de rendu nécessaire |
| Source du code core | Port propre, dupliqué dans `cli/lib/` | DOM et vrai TTY sont des I/O trop différents pour justifier une extraction runtime fragile du HTML (cohérent avec le YAGNI déjà acté dans le spec terminal) |
| Emplacement | `cli/` (nouveau dossier, package séparé) | Isole le projet npm publié du projet HTML zéro-dépendance |
| Rendu écran | Sortie scrollante classique (pas de TUI type `blessed`/`ink`) | Pas de dépendance supplémentaire, comportement shell standard, suffisant pour l'usage |
| Packaging | `package.json` avec champ `bin`, publication npm sous le nom `heraldic` | Demande explicite de l'utilisateur — nom vérifié disponible sur le registry (2026-07-16) |
| Publication effective (`npm publish`) | Différée — confirmation explicite requise au moment venu | Action publique irréversible, jamais lancée sans feu vert direct |

## 3. Structure

```
cli/
├── package.json          # name: "heraldic", bin: { heraldic: "./bin/heraldic.js" }
├── bin/heraldic.js        # point d'entrée exécutable (#!/usr/bin/env node)
├── lib/
│   ├── core.js            # hashString, mulberry32, deriveParams, generateParticles,
│   │                       # rasterizeToDotField, dotFieldToBraille, overlayStructural,
│   │                       # buildGrid, slugify, formatSeedLine
│   └── serialize.js        # parseColor, serializeText, serializeAnsi, serializeSvg, escapeXml
└── test/
    └── core.test.js        # node:test, port de test/core.test.js (30 tests) sans harnais vm
```

Une seule dépendance npm : `sharp`. Le reste (`readline`, `fs`, `path`) est Node natif.

## 4. REPL & grammaire de commande

Au lancement (`heraldic`) : banner ASCII "HERALDIC" (repris de `terminal/index.html`) + tagline/version, imprimés une fois puis défilant comme le reste (pas de zone fixe). Prompt `heraldic:~$`.

Boucle via `readline` natif. Chaque ligne + Entrée :

- **Texte libre** → génère un blason : `buildGrid(text, entropy)` → `serializeAnsi` → `console.log` (couleurs vraies 24-bit directement supportées par la plupart des terminaux modernes).
- **`/help`** → liste les commandes disponibles.
- **`/reroll`** → nouvelle entropy, même texte courant. Erreur si aucun blason généré.
- **`/export <png|txt|ans|svg>`** → écrit `<slug>.<ext>` dans le cwd du process (`fs.writeFileSync`), confirmation imprimée (`écrit: chateau.svg`). Erreur si format invalide ou rien généré.
- **`/clear`** → `console.clear()`.
- **`/quit`** (nouveau — pas de commande équivalente dans le navigateur, nécessaire pour un vrai process TTY) → sortie propre.
- Ctrl+C / Ctrl+D → équivalent à `/quit`, sortie propre.

Pas de commande `copy` (pas de sens direct dans un terminal réel : `/export txt` puis pipe/copie manuelle suffit).

## 5. Data flow

texte → `hashString` → `mulberry32(seed)` → `deriveParams` → `generateParticles` → `rasterizeToDotField` → `dotFieldToBraille` → `overlayStructural` → grille finale → `serializeAnsi`/`serializeText`/`serializeSvg` selon contexte.

État courant en mémoire du process (pas de persistance disque) : `currentText`, `currentEntropy`, `currentGrid`, réinitialisés à chaque génération, lus par `/reroll` et `/export`.

## 6. Gestion d'erreurs

Toutes les erreurs sont imprimées comme ligne simple dans le terminal — jamais d'exception qui fait planter le process :

- `/export` sans blason généré → `aucun blason généré — tape un mot d'abord`
- `/export <fmt invalide>` → `format invalide — formats valides: png, txt, ans, svg`
- commande inconnue (`/xyz`) → `commande inconnue: /xyz`
- échec écriture fichier (permissions, disque plein) → message d'erreur `fs` affiché tel quel

## 7. Tests

`cli/test/core.test.js` via `node:test` natif, port direct des 30 tests de `test/core.test.js` adaptés à `lib/core.js`/`lib/serialize.js`. Plus besoin du harnais `node:vm` (`extract-core.js`) — le code est un module Node natif, pas extrait d'un `<script>` HTML.

`bin/heraldic.js` (boucle `readline`, I/O interactif) non testé automatiquement — vérification manuelle au vrai terminal après implémentation, comme `#blason-ui`.

## 8. Publication npm

`cli/package.json` : `name: "heraldic"`, `version: "0.1.0"`, champ `bin`, `files`, licence. `npm publish` sera proposé comme dernière étape mais jamais exécuté sans confirmation explicite de l'utilisateur au moment venu (action publique irréversible).

## Hors scope

- Commande `/export copy` (presse-papier OS).
- TUI à panneaux fixes (type `blessed`/`ink`).
- Partage de code runtime entre `terminal/index.html` et `cli/` (DOM vs TTY, YAGNI).
- Toute évolution au-delà de la parité avec `terminal/index.html` (pas de nouvelles features CLI-only pour cette session).
