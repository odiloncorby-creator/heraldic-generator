# heraldic

One word, one blazon. Not carved in stone — carved into the text: the
signature (symmetry, palette, density) is fixed by what you type, but every
invocation redistributes the particles differently. Same seal, never the
same imprint twice.

Braille-glyph rendering, cold colors `#6B7EC4` / `#8A9AD4`, black
background. No frame, no outline — the blazon floats in the terminal like
an artifact decoded live.

## How it works

The text is hashed (`hashString`) to seed a first deterministic
pseudo-random stream (`mulberry32`) that derives the blazon's **family**:
symmetry type (axial, or radial k=3/4/6/8), palette bias, density band.
This stream depends only on the text — fixed for a given word.

Each generation also draws a fresh random **entropy**
(`crypto.randomBytes`), XORed with the text hash to form the final seed.
That seed drives a second `mulberry32` stream that places the particle
clusters and their scatter — this is the stream that varies on every draw,
not the first one. Result: same text → same visual family, different
entropy → different variant within that family.

`(text, entropy)` fixed → strictly reproducible grid (guaranteed by
`node --test`). `/reroll` just draws a new entropy for the current text,
without retyping it.

Full pipeline: hash → family parameters → particles → dot field → braille
raster → structural overlay → colorize.

## Installation

```bash
npm install -g heraldic
```

## Usage

```
heraldic:~$ chateau
[colored braille grid]
SEED 0x4F2A91C3  REV 2.6  UNIT/D-01

heraldic:~$ /reroll
[new variant, same family, new SEED]

heraldic:~$ /export png
écrit: chateau.png

heraldic:~$ /help
commandes disponibles :
  <texte>              génère un blason à partir du texte
  /reroll               nouveau tirage du même texte
  /export <fmt>         exporte le dernier blason (fmt: png, png-story, mp4, mp4-story, txt, ans, svg)
  /clear                 vide l’écran
  /quit                  quitte le programme
  /help                  affiche cette liste
```

(the CLI's own output stays in French — that's what you'll actually see)

## Video export

The `mp4` and `mp4-story` formats render the decode animation to MP4 video.
This requires the `ffmpeg` system binary — install with `brew install ffmpeg`
(macOS) or `apt install ffmpeg` (Linux/Debian).

Supported export formats:
- `png`: single frame PNG (1080×1377)
- `png-story`: tall story-format PNG (1080×1920)
- `mp4`: video with decode animation (1080×1376, 30fps, ~2.2s)
- `mp4-story`: tall video with decode animation (1080×1920, 30fps, ~2.2s)
- `txt`: plain text
- `ans`: ANSI colored text
- `svg`: scalable vector

## Local development

```bash
cd cli
npm install
npm link
```

## Tests

```bash
npm test
```
