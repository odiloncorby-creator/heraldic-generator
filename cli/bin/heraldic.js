#!/usr/bin/env node
'use strict';

const fs = require('fs');
const readline = require('readline');
const crypto = require('crypto');

const { buildGrid, slugify } = require('../lib/core');
const { serializeText, serializeAnsi, serializeSvg } = require('../lib/serialize');
const { serializeSvgToPngBuffer } = require('../lib/png');

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

function generate(text, entropy) {
  currentText = text;
  currentGrid = buildGrid(text, entropy);
  console.log(serializeAnsi(currentGrid));
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
  reroll() {
    if (!requireGrid()) return;
    generate(currentText, makeEntropy());
  },
  clear() {
    console.clear();
  },
  quit() {
    pendingExport.then(() => rl.close());
  },
};

function handleLine(raw) {
  const text = raw.trim();
  if (text.length === 0) return;
  if (text[0] === '/') {
    const [name, ...rest] = text.slice(1).split(/\s+/);
    const key = name.toLowerCase();
    if (key === 'export') { handleExport(rest[0] ? rest[0].toLowerCase() : undefined); return; }
    if (Object.hasOwn(COMMANDS, key)) { COMMANDS[key](); return; }
    console.log(`commande inconnue: /${name} — tape /help`);
    return;
  }
  generate(text, makeEntropy());
}

console.log(BANNER);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: 'heraldic:~$ ',
});

rl.prompt();
rl.on('line', (line) => {
  handleLine(line);
  rl.prompt();
});
rl.on('close', () => {
  pendingExport.finally(() => process.exit(0));
});
