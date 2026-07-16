# heraldic

Générateur procédural de blasons ASCII/braille en CLI. Même texte, même blason, toujours — déterministe par construction (`mulberry32` seedé par hash du texte).

## Installation locale

```bash
cd cli
npm install
npm link
```

Puis lancer `heraldic` depuis n'importe quel répertoire.

## Usage

```
heraldic:~$ chateau
[grille braille colorée]

heraldic:~$ /export png
écrit: chateau.png

heraldic:~$ /help
commandes disponibles :
  <texte>              génère un blason à partir du texte
  /reroll               nouveau tirage du même texte
  /export <fmt>         exporte le dernier blason (fmt: png, txt, ans, svg)
  /clear                 vide l'écran
  /quit                  quitte le programme
  /help                  affiche cette liste
```

## Tests

```bash
npm test
```
