const test = require('node:test');
const assert = require('node:assert/strict');
const assertLoose = require('node:assert');
const { loadBlasonCore } = require('./support/extract-core');

test('constantes de grille figées', () => {
  const { COLS, ROWS, DOT_W, DOT_H } = loadBlasonCore();
  assert.equal(COLS, 80);
  assert.equal(ROWS, 50);
  assert.equal(DOT_W, 160);
  assert.equal(DOT_H, 200);
});

test('hashString déterministe', () => {
  const { hashString } = loadBlasonCore();
  assert.equal(hashString('sthol'), hashString('sthol'));
  assert.notEqual(hashString('sthol'), hashString('kaldrek'));
});

test('mulberry32 reproductible', () => {
  const { mulberry32 } = loadBlasonCore();
  const a = mulberry32(123), b = mulberry32(123);
  assertLoose.deepEqual([a(), a(), a()], [b(), b(), b()]);
});

test('slugify utilise la forme échappée des diacritiques', () => {
  const { slugify } = loadBlasonCore();
  assert.equal(slugify('Épée Ardente'), 'epee-ardente');
  assert.equal(slugify(''), 'blason');
});

function blankGrid(core, cols, rows) {
  return core.dotFieldToBraille(new Float64Array(cols * 2 * rows * 4), cols, rows);
}

test('overlayStructural frame=box: coins et bords', () => {
  const core = loadBlasonCore();
  const cells = blankGrid(core, 80, 50);
  const meta = { seed: 0x7F3A, rev: '2.6', unit: 'UNIT/D-01' };
  core.overlayStructural(cells, { frame: 'box' }, meta);
  assert.equal(cells[0][0].char, '┌');
  assert.equal(cells[0][79].char, '┐');
  assert.equal(cells[49][0].char, '└');
  assert.equal(cells[49][79].char, '┘');
  assert.equal(cells[0][0].layer, 'struct');
});

test('overlayStructural: ligne data contient le SEED en hex et layer=data', () => {
  const core = loadBlasonCore();
  const cells = blankGrid(core, 80, 50);
  core.overlayStructural(cells, { frame: 'box' }, { seed: 0x7F3A, rev: '2.6', unit: 'UNIT/D-01' });
  const dataRow = cells[48].map(c => c.char).join('');
  assert.ok(dataRow.includes('SEED 0x'));
  assert.ok(dataRow.includes('00007F3A'));
  const hasDataLayer = cells[48].some(c => c.layer === 'data');
  assert.ok(hasDataLayer);
});

test('overlayStructural frame=ticks: pas de bordure pleine', () => {
  const core = loadBlasonCore();
  const cells = blankGrid(core, 80, 50);
  core.overlayStructural(cells, { frame: 'ticks' }, { seed: 1, rev: '2.6', unit: 'U' });
  assert.equal(cells[0][0].char, '+'); // tick au coin
});
