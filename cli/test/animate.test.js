const test = require('node:test');
const assert = require('node:assert/strict');
const { mulberry32 } = require('../lib/core');
const { computeDecodeFrame, SCRAMBLE_CHARS, DECODE_DURATION_MS, DECODE_STAGGER_MS } = require('../lib/animate');

function makeGrid(rows, cols) {
  const cells = [];
  for (let r = 0; r < rows; r++) {
    const row = [];
    for (let c = 0; c < cols; c++) row.push({ char: 'X', color: '#8A9AD4' });
    cells.push(row);
  }
  return { rows, cols, cells, seed: 1 };
}

test('computeDecodeFrame : la cellule la plus excentrée reste blanche avant son cellStart', () => {
  const grid = makeGrid(3, 3);
  const rng = mulberry32(1);
  const frame = computeDecodeFrame(grid, 0, rng);
  assert.equal(frame.cells[0][0].char, ' ');
  assert.equal(frame.done, false);
});

test('computeDecodeFrame : la cellule centrale (d=0) atteint son caractère final dès t >= DECODE_DURATION_MS', () => {
  // cx = cols/2 = 2, cy = rows/2 = 2 (grille paire) : la cellule [2][2] est
  // exactement au centre géométrique (d=0), donc cellStart=0.
  const grid = makeGrid(4, 4);
  const rng = mulberry32(1);
  const frame = computeDecodeFrame(grid, DECODE_DURATION_MS, rng);
  assert.equal(frame.cells[2][2].char, 'X');
});

test('computeDecodeFrame : les caractères en cours de révélation viennent de SCRAMBLE_CHARS', () => {
  // cx = cy = 2.5 : les cellules [2][2]/[2][3]/[3][2]/[3][3] sont les plus
  // proches du centre, à d=0.2 soit cellStart=100ms. t=150 les place dans
  // leur fenêtre de scramble ([cellStart, cellStart+DECODE_DURATION_MS)).
  const grid = makeGrid(5, 5);
  const rng = mulberry32(7);
  const frame = computeDecodeFrame(grid, 150, rng);
  let sawScramble = false;
  for (const row of frame.cells) {
    for (const cell of row) {
      if (cell.char !== ' ' && cell.char !== 'X') {
        assert.ok(SCRAMBLE_CHARS.includes(cell.char));
        sawScramble = true;
      }
    }
  }
  assert.ok(sawScramble);
});

test('computeDecodeFrame : done=true seulement quand t >= DECODE_STAGGER_MS + DECODE_DURATION_MS', () => {
  const grid = makeGrid(4, 4);
  const early = computeDecodeFrame(grid, DECODE_STAGGER_MS + DECODE_DURATION_MS - 1, mulberry32(1));
  assert.equal(early.done, false);
  const late = computeDecodeFrame(grid, DECODE_STAGGER_MS + DECODE_DURATION_MS, mulberry32(1));
  assert.equal(late.done, true);
});

test('computeDecodeFrame : déterministe pour un même (grid, t, rng frais de même seed)', () => {
  const grid = makeGrid(4, 4);
  const a = computeDecodeFrame(grid, 200, mulberry32(99));
  const b = computeDecodeFrame(grid, 200, mulberry32(99));
  assert.deepEqual(a, b);
});
