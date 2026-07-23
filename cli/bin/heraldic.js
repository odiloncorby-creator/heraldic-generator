#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');
const crypto = require('crypto');
const { spawn } = require('child_process');

const { buildGrid, slugify, mulberry32, formatSeedLine } = require('../lib/core');
const { serializeText, serializeAnsi, serializeSvg, cellsToAnsi } = require('../lib/serialize');
const { serializeSvgToPngBuffer } = require('../lib/png');
const { computeDecodeFrame, DECODE_DURATION_MS, DECODE_STAGGER_MS } = require('../lib/animate');

const BANNER = `▗▖ ▗▖▗▄▄▄▖▗▄▄▖  ▗▄▖ ▗▖   ▗▄▄▄ ▗▄▄▄▖ ▗▄▄▖
▐▌ ▐▌▐▌   ▐▌ ▐▌▐▌ ▐▌▐▌   ▐▌  █  █  ▐▌
▐▛▀▜▌▐▛▀▀▘▐▛▀▚▖▐▛▀▜▌▐▌   ▐▌  █  █  ▐▌
▐▌ ▐▌▐▙▄▄▖▐▌ ▐▌▐▌ ▐▌▐▙▄▄▖▐▙▄▄▀▗▄█▄▖▝▚▄▄▖
CLI v0.1.0 — tape /help`;

const EXPORT_FORMATS = ['png', 'png-story', 'mp4', 'mp4-story', 'txt', 'ans', 'svg'];
const STORY_HEIGHT = 1920;

function svgOptsFor(grid, story) {
  return story ? { cellW: 13.5, cellH: STORY_HEIGHT / (grid.rows + 1) } : undefined;
}

const VIDEO_FPS = 30;
const VIDEO_HOLD_MS = 1200;

async function renderFramePng(grid, cells, cellW, cellH) {
  const svg = serializeSvg({ cols: grid.cols, rows: grid.rows, cells, meta: grid.meta }, { cellW, cellH });
  return serializeSvgToPngBuffer(svg);
}

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', args);
    let stderr = '';
    proc.stderr.on('data', (d) => { stderr += d; });
    proc.on('error', (err) => {
      if (err.code === 'ENOENT') {
        reject(new Error('ffmpeg introuvable — installe-le (brew install ffmpeg / apt install ffmpeg) pour exporter en vidéo'));
      } else {
        reject(err);
      }
    });
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg a échoué (code ${code}): ${stderr.slice(-500)}`));
    });
  });
}

async function encodeVideo(grid, cellW, cellH, outPath) {
  const totalDurationMs = DECODE_STAGGER_MS + DECODE_DURATION_MS + VIDEO_HOLD_MS;
  const totalFrames = Math.ceil(totalDurationMs / (1000 / VIDEO_FPS));
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'heraldic-'));
  const rng = mulberry32(grid.seed >>> 0);
  try {
    for (let i = 0; i < totalFrames; i++) {
      const t = i * (1000 / VIDEO_FPS);
      const frame = computeDecodeFrame(grid, t, rng);
      const png = await renderFramePng(grid, frame.cells, cellW, cellH);
      fs.writeFileSync(path.join(tmpDir, `frame-${String(i).padStart(4, '0')}.png`), png);
    }
    // H.264/yuv420p requires even width/height; input 1377px → 1376px.
    await runFfmpeg(['-y', '-framerate', String(VIDEO_FPS), '-i', path.join(tmpDir, 'frame-%04d.png'), '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-pix_fmt', 'yuv420p', outPath]);
  } catch (err) {
    fs.rmSync(outPath, { force: true });
    throw err;
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function makeEntropy() {
  return crypto.randomBytes(4).readUInt32BE(0) >>> 0;
}

let currentText = '';
let pendingExport = Promise.resolve();
let currentGrid = null;
let quitting = false;

const FRAME_INTERVAL_MS = 50;
let generation = 0;
let pendingGenerate = Promise.resolve();

function playDecodeAnimation(grid, myGeneration) {
  if (!process.stdout.isTTY) {
    console.log(serializeAnsi(grid));
    return Promise.resolve();
  }
  const rng = mulberry32(grid.seed >>> 0);
  const start = Date.now();
  let first = true;
  process.stdout.write('\x1b[?25l');
  return new Promise((resolve) => {
    const timer = setInterval(() => {
      if (generation !== myGeneration) {
        clearInterval(timer);
        resolve();
        return;
      }
      const t = Date.now() - start;
      const frame = computeDecodeFrame(grid, t, rng);
      if (!first) process.stdout.write(`\x1b[${grid.rows}A\x1b[0J`);
      process.stdout.write(cellsToAnsi(frame.cells) + '\n');
      first = false;
      if (frame.done) {
        clearInterval(timer);
        console.log(`\n${formatSeedLine(grid.meta)}`);
        process.stdout.write('\x1b[?25h');
        resolve();
      }
    }, FRAME_INTERVAL_MS);
  });
}

async function generate(text, entropy) {
  currentText = text;
  currentGrid = buildGrid(text, entropy);
  generation += 1;
  pendingGenerate = playDecodeAnimation(currentGrid, generation);
  await pendingGenerate;
}

function requireGrid() {
  if (!currentGrid) {
    console.log('aucun blason généré — tape un mot d’abord');
    return false;
  }
  return true;
}

async function runExport(fmt) {
  const story = fmt.endsWith('-story');
  const suffix = story ? '-story' : '';
  const filename = `${slugify(currentText)}${suffix}.${fmt.replace('-story', '')}`;
  if (fmt === 'txt') {
    fs.writeFileSync(filename, serializeText(currentGrid));
  } else if (fmt === 'ans') {
    fs.writeFileSync(filename, serializeAnsi(currentGrid));
  } else if (fmt === 'svg') {
    fs.writeFileSync(filename, serializeSvg(currentGrid));
  } else if (fmt === 'png' || fmt === 'png-story') {
    const buffer = await serializeSvgToPngBuffer(serializeSvg(currentGrid, svgOptsFor(currentGrid, story)));
    fs.writeFileSync(filename, buffer);
  } else if (fmt === 'mp4' || fmt === 'mp4-story') {
    const cellW = 13.5, cellH = story ? STORY_HEIGHT / (currentGrid.rows + 1) : 27;
    await encodeVideo(currentGrid, cellW, cellH, filename);
  }
  console.log(`écrit: ${filename}`);
}

function handleExport(arg) {
  if (!arg || !EXPORT_FORMATS.includes(arg)) {
    console.log(`format invalide — formats valides: ${EXPORT_FORMATS.join(', ')}`);
    return;
  }
  if (!requireGrid()) return;
  pendingExport = runExport(arg).catch((err) => {
    console.log(`échec écriture fichier: ${err.message}`);
  });
}

const COMMANDS = {
  help() {
    console.log([
      'commandes disponibles :',
      '  <texte>              génère un blason à partir du texte',
      '  /reroll               nouveau tirage du même texte',
      '  /export <fmt>         exporte le dernier blason (fmt: png, png-story, mp4, mp4-story, txt, ans, svg)',
      '  /clear                 vide l’écran',
      '  /quit                  quitte le programme',
      '  /help                  affiche cette liste',
    ].join('\n'));
  },
  async reroll() {
    if (!requireGrid()) return;
    await generate(currentText, makeEntropy());
  },
  clear() {
    console.clear();
  },
  quit() {
    quitting = true;
    pendingExport.then(() => rl.close());
  },
};

async function handleLine(raw) {
  const text = raw.trim();
  if (text.length === 0) return;
  if (text[0] === '/') {
    const [name, ...rest] = text.slice(1).split(/\s+/);
    const key = name.toLowerCase();
    if (key === 'export') { handleExport(rest[0] ? rest[0].toLowerCase() : undefined); return; }
    if (Object.hasOwn(COMMANDS, key)) { await COMMANDS[key](); return; }
    console.log(`commande inconnue: /${name} — tape /help`);
    return;
  }
  await generate(text, makeEntropy());
}

console.log(BANNER);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: 'heraldic:~$ ',
});

rl.prompt();
rl.on('line', async (line) => {
  if (quitting) return;
  await handleLine(line);
  rl.prompt();
});
rl.on('close', () => {
  Promise.all([pendingExport, pendingGenerate]).finally(() => process.exit(0));
});
