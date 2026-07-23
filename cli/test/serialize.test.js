const test = require('node:test');
const assert = require('node:assert/strict');
const assertLoose = require('node:assert');
const { serializeText, serializeAnsi, parseColor, escapeXml, serializeSvg, cellsToAnsi } = require('../lib/serialize');

const FIXTURE_GRID = { cols: 3, rows: 2, cells: [
  [{ char: 'A', color: '#E61919', layer: 'data' },
   { char: 'B', color: '#8A9AD4', layer: 'struct' },
   { char: 'C', color: 'rgb(107, 126, 196)', layer: 'braille' }],
  [{ char: '⠁', color: 'rgb(120, 130, 200)', layer: 'braille' },
   { char: '⠀', color: 'rgb(107, 126, 196)', layer: 'braille' },
   { char: 'D', color: '#8A9AD4', layer: 'struct' }],
], seed: 42, meta: { seed: 42, rev: '2.6', unit: 'U' } };

test('serializeText: lignes jointes, glyphes bruts + ligne seed', () => {
  assert.equal(serializeText(FIXTURE_GRID), 'ABC\n⠁⠀D\n\nSEED 0x0000002A  REV 2.6  U');
});

test('parseColor: hex et rgb()', () => {
  assertLoose.deepEqual(parseColor('#E61919'), [230, 25, 25]);
  assertLoose.deepEqual(parseColor('rgb(107, 126, 196)'), [107, 126, 196]);
});

test('serializeAnsi: contient un escape truecolor, un reset, et la ligne seed', () => {
  const out = serializeAnsi(FIXTURE_GRID);
  assert.ok(out.includes('\x1b[38;2;230;25;25m'));
  assert.ok(out.includes('\x1b[0m'));
  const stripped = out.replace(/\x1b\[[0-9;]*m/g, '');
  assert.equal(stripped, 'ABC\n⠁⠀D\n\nSEED 0x0000002A  REV 2.6  U');
});

test('cellsToAnsi: rend les cellules d’une grille en art ANSI truecolor, sans le footer seed', () => {
  const out = cellsToAnsi(FIXTURE_GRID.cells);
  assert.ok(out.includes('\x1b[38;2;230;25;25m'));
  const stripped = out.replace(/\x1b\[[0-9;]*m/g, '');
  assert.equal(stripped, 'ABC\n⠁⠀D');
});

test('escapeXml: échappe &, <, >', () => {
  assert.equal(escapeXml('a<b>&c'), 'a&lt;b&gt;&amp;c');
});

test('serializeSvg: enveloppe SVG + fond + dimensions (rows+1 pour la ligne seed)', () => {
  const svg = serializeSvg(FIXTURE_GRID, { cellW: 10, cellH: 20, fontSize: 18 });
  assert.ok(svg.startsWith('<svg'));
  assert.ok(svg.includes('width="30"'));
  assert.ok(svg.includes('height="60"'));
  assert.ok(svg.includes('fill="#0A0A0A"'));
  assert.ok(svg.trim().endsWith('</svg>'));
});

test('serializeSvg: dessine les glyphes non-blancs, saute le blank braille, ajoute la ligne seed', () => {
  const svg = serializeSvg(FIXTURE_GRID);
  assert.ok(svg.includes('>A</text>'));
  assert.ok(svg.includes('fill="#E61919"'));
  assert.ok(svg.includes('SEED 0x0000002A'));
  const textCount = (svg.match(/<text /g) || []).length;
  assert.equal(textCount, 6);
});

test('serializeSvg: cellH calculé pour ratio story (1080x1920) sur une grille 80x50', () => {
  const grid = {
    cols: 80, rows: 50,
    cells: Array.from({ length: 50 }, () => Array.from({ length: 80 }, () => ({ char: ' ', color: '#8A9AD4' }))),
    meta: { seed: 1, rev: '2.6', unit: 'U' },
  };
  const cellW = 13.5, cellH = 1920 / (grid.rows + 1);
  const svg = serializeSvg(grid, { cellW, cellH });
  const width = Number(svg.match(/width="([\d.]+)"/)[1]);
  const height = Number(svg.match(/height="([\d.]+)"/)[1]);
  assert.equal(width, 1080);
  assert.ok(Math.abs(height - 1920) < 0.01);
});
