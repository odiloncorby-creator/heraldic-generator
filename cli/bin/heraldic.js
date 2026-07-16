#!/usr/bin/env node
'use strict';

const fs = require('fs');
const readline = require('readline');
const crypto = require('crypto');

const { buildGrid, slugify, mulberry32, formatSeedLine } = require('../lib/core');
const { serializeText, serializeAnsi, serializeSvg, cellsToAnsi } = require('../lib/serialize');
const { serializeSvgToPngBuffer } = require('../lib/png');
const { computeDecodeFrame, DECODE_STAGGER_MS, DECODE_DURATION_MS } = require('../lib/animate');

const BANNER = `▗▖ ▗▖▗▄▄▄▖▗▄▄▖  ▗▄▖ ▗▖   ▗▄▄▄ ▗▄▄▄▖ ▗▄▄▖
▐▌ ▐▌▐▌   ▐▌ ▐▌▐▌ ▐▌▐▌   ▐▌  █  █  ▐▌
▐▛▀▜▌▐▛▀▀▘▐▛▀▚▖▐▛▀▜▌▐▌   ▐▌  █  █  ▐▌
▐▌ ▐▌▐▙▄▄▖▐▌ ▐▌▐▌ ▐▌▐▙▄▄▖▐▙▄▄▀▗▄█▄▖▝▚▄▄▖
CLI v0.1.0 — tape /help`;

const EXPORT_FORMATS = ['png', 'txt', 'ans', 'svg'];

function makeEntropy() {
  return crypto.randomBytes(4).readUInt32BE(0) >>> 0;
}

let currentText = '';
let pendingExport = Promise.resolve();
let currentGrid = null;
let quitting = false;

const FRAME_INTERVAL_MS = 50;
let generation = 0;

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
        process.stdout.write('\x1b[?25h');
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
  await playDecodeAnimation(currentGrid, generation);
}

function requireGrid() {
  if (!currentGrid) {
    console.log('aucun blason généré — tape un mot d’abord');
    return false;
  }
  return true;
}

async function runExport(fmt) {
  const filename = `${slugify(currentText)}.${fmt}`;
  if (fmt === 'txt') {
    fs.writeFileSync(filename, serializeText(currentGrid));
  } else if (fmt === 'ans') {
    fs.writeFileSync(filename, serializeAnsi(currentGrid));
  } else if (fmt === 'svg') {
    fs.writeFileSync(filename, serializeSvg(currentGrid));
  } else if (fmt === 'png') {
    const buffer = await serializeSvgToPngBuffer(serializeSvg(currentGrid));
    fs.writeFileSync(filename, buffer);
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
      '  /export <fmt>         exporte le dernier blason (fmt: png, txt, ans, svg)',
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
  pendingExport.finally(() => process.exit(0));
});
